#!/usr/bin/env python3
"""Mumbin decryption tool: get your notes back without Mumbin.

Mumbin (a note program that stores pages as plain text files in a folder) can
encrypt pages and their attachments, and a notebook can hide its file names too.
This script is the safety net: if the program is ever gone, it decrypts
everything with the passphrase alone. It only reads the notebook folder and
writes plain copies to a NEW folder; it never changes or deletes anything in
the notebook.

Usage:
    pip install pynacl            (and, only if your notebook was made with a
                                   non-default setting: pip install argon2-cffi)
    python mumbin_decrypt.py NOTEBOOK_FOLDER --out DECRYPTED_FOLDER

The passphrase is asked for on the keyboard (or read from the environment
variable MUMBIN_PASSPHRASE for scripts). There is no way to open the
notebook without it: nobody, including the authors, can recover a lost passphrase.

Pages with a password of their own (a notebook may have no vault at all) are opened with that
password: the one in the environment variable MUMBIN_PAGE_PASSWORD is tried on every such page,
and for each page it does not open the script asks on the keyboard (Enter skips the page); a
password that worked is tried on the next pages first. With --pages-only the vault passphrase
is not asked for, and --no-prompt never asks for a page password. A page whose password is not
known is reported and not written.

The format (so you can check this script, or write your own):

* The notebook folder holds `.securewiki-vault`, a JSON file:
  version (1), kdf ("argon2id"), memoryKib, iterations, parallelism, and
  base64 strings salt (16 bytes), nonce (24 bytes) and wrappedKey.
* kek = Argon2id(NFC(passphrase) as UTF-8, salt, memory = memoryKib KiB,
  time = iterations, lanes = parallelism, version 0x13, output 32 bytes).
* master key (32 bytes) = XChaCha20-Poly1305 open(kek, nonce, wrappedKey,
  associated data b"SWVAULT1:key").
* An encrypted page is an ordinary page file (*.txt) whose headers include
  "Encrypted: swenc1". Its body is the line "SWENC1" followed by base64 text of
  nonce (24 bytes) + ciphertext + tag (16 bytes). Decrypt with the master key,
  associated data b"SWENC1:page"; the result is the page text (UTF-8).
* An encrypted attachment is a file named like the original plus ".swenc":
  bytes b"SWENC1F\\0", nonce (24 bytes), ciphertext + tag. Associated data
  b"SWENC1:file".

Pages with a password of their own:

* The page has the header "Encrypted: swenc3". Its body is the line "SWENC3" and the base64 text
  of: version (1 byte, value 1), memory in KiB (4 bytes, big endian), iterations (4 bytes, big
  endian), lanes (1 byte), salt (16 bytes), then nonce (24) + ciphertext + tag (16).
* K = Argon2id(NFC(password), salt, those settings, output 32 bytes), as for the vault.
* text key = BLAKE2b(key = K, data = b"mumbin/page-text-key/v1", 32 bytes); the page text is
  opened with it and the associated data b"SWENC3:page" + the 26 header bytes above.
* file key = BLAKE2b(key = K, data = b"mumbin/page-file-key/v1", 32 bytes). An attachment of the
  page is b"SWENC3F\\0", nonce (24), ciphertext + tag, opened with the file key and the
  associated data b"SWENC3:file". It lies in the folder named like the page file, as always.

Notebooks that hide their file names too ("sealedNames": true in the vault file):

* Nothing on disk has a real name. A page is `<token>.txt`, a folder `<token>`, an
  attachment `<token>.swenc`; the token is 26 characters of a-z2-7. The real names are
  sealed inside the files. This script reads them from there.
* name key = BLAKE2b(key = master key, data = b"mumbin/name-key/v1", 32 bytes).
* A name block is nonce (24 bytes) + XChaCha20-Poly1305 ciphertext + tag (16) of the
  UTF-8 name, with the name key and the associated data b"SWENC2:name:page",
  b"SWENC2:name:dir" or b"SWENC2:name:file".
* A page has the header "Encrypted: swenc2". Its body is the line "SWENC2" and the base64
  text of: 2 bytes (big endian) length of the name block, the name block, then
  nonce (24) + ciphertext + tag of the page text under the master key, with the associated
  data b"SWENC2:page" + the name block.
* An attachment starts with b"SWENC2F\\0", then the same two parts in binary (the
  associated data is b"SWENC2:file" + the name block).
* A folder holds the hidden file `.mnm`, the name block of the folder's name.
* The name of a page is its last part only; the folders above it give the rest.

Licence: this file may be copied, kept and used freely by the owners of
encrypted notebooks; it contains no secret.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import json
import os
import shutil
import stat
import sys
import unicodedata
from dataclasses import dataclass, field

VAULT_FILE = ".securewiki-vault"
VAULT_BACKUP = ".securewiki-vault.bak"  # a second copy; used when the first is missing
PAGE_MAGIC = "SWENC1"
FILE_MAGIC = b"SWENC1F\0"
PAGE_MAGIC2 = "SWENC2"
FILE_MAGIC2 = b"SWENC2F\0"
PAGE_MAGIC3 = "SWENC3"
FILE_MAGIC3 = b"SWENC3F\0"
OWN_HEADER_LEN = 1 + 4 + 4 + 1 + 16  # version, memory, iterations, lanes, salt
DIR_NAME_FILE = ".mnm"
NOTEBOOK_FILE = "notebook.mumbin"
PAGE_HEADER = "Content-Type: text/x-mumbin-page"
NONCE_LEN = 24
TAG_LEN = 16
KEY_LEN = 32
NAME_BLOCK_MIN = NONCE_LEN + TAG_LEN + 1
NAME_BLOCK_MAX = NONCE_LEN + TAG_LEN + 255
MAX_FILE = 1 << 30
MAX_VAULT = 4096

DAMAGED = "(damaged, or from another notebook)"


class Problem(Exception):
    """Something in one file could not be decrypted; the text says what."""


@dataclass
class Report:
    pages: int = 0
    files: int = 0
    copied: int = 0
    problems: list[str] = field(default_factory=list)


def fail(message: str) -> None:
    print(f"mumbin_decrypt: {message}", file=sys.stderr)
    sys.exit(1)


def is_link(path: str) -> bool:
    metadata = os.lstat(path)
    return stat.S_ISLNK(metadata.st_mode) or bool(
        getattr(metadata, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    )


def read_capped(path: str) -> bytes:
    with open(path, "rb") as handle:
        raw = handle.read(MAX_FILE + 1)
    if len(raw) > MAX_FILE:
        raise Problem("file exceeds the size limit")
    return raw


def write_new(path: str, data: bytes) -> None:
    """Writes a file that must not exist yet: nothing is ever overwritten."""
    with open(path, "xb") as handle:
        handle.write(data)


def copy_new(source: str, target: str) -> None:
    with open(source, "rb") as reader, open(target, "xb") as writer:
        shutil.copyfileobj(reader, writer)


# -- Cryptography -----------------------------------------------------------


def derive_key(passphrase: str, salt: bytes, memory_kib: int, iterations: int, parallelism: int) -> bytes:
    """Argon2id of the passphrase (normalised to NFC, as Mumbin does)."""
    secret = unicodedata.normalize("NFC", passphrase).encode("utf-8")
    try:
        from argon2.low_level import Type, hash_secret_raw

        return hash_secret_raw(
            secret, salt, time_cost=iterations, memory_cost=memory_kib,
            parallelism=parallelism, hash_len=KEY_LEN, type=Type.ID, version=19,
        )
    except ImportError:
        pass
    if parallelism != 1:
        fail("this notebook uses several Argon2 lanes: run  pip install argon2-cffi")
    try:
        from nacl.pwhash import argon2id
    except ImportError:
        fail("the package PyNaCl is missing: run  pip install pynacl")
    return argon2id.kdf(KEY_LEN, secret, salt, opslimit=iterations, memlimit=memory_kib * 1024)


def open_sealed(key: bytes, nonce: bytes, data: bytes, aad: bytes) -> bytes | None:
    """XChaCha20-Poly1305 decryption; None when the data does not authenticate."""
    try:
        from nacl.bindings import crypto_aead_xchacha20poly1305_ietf_decrypt
        from nacl.exceptions import CryptoError
    except ImportError:
        fail("the package PyNaCl is missing: run  pip install pynacl")
    try:
        return crypto_aead_xchacha20poly1305_ietf_decrypt(data, aad, nonce, key)
    except CryptoError:
        return None


def open_box(key: bytes, box: bytes, aad: bytes) -> bytes | None:
    """Opens `nonce + ciphertext + tag`."""
    return open_sealed(key, box[:NONCE_LEN], box[NONCE_LEN:], aad)


def blake_key(master: bytes, label: bytes) -> bytes:
    return hashlib.blake2b(label, key=master, digest_size=KEY_LEN).digest()


def vault_path(folder: str) -> str:
    """The vault file, or its copy when the file itself is missing."""
    path = os.path.join(folder, VAULT_FILE)
    backup = os.path.join(folder, VAULT_BACKUP)
    return backup if not os.path.isfile(path) and os.path.isfile(backup) else path


def read_vault(folder: str) -> dict:
    path = vault_path(folder)
    if not os.path.isfile(path) or is_link(path):
        fail(f"no {VAULT_FILE} in {folder}: this is not an encrypted Mumbin notebook")
    if os.path.getsize(path) > MAX_VAULT:
        fail("the vault file is too big to be one")
    try:
        with open(path, "r", encoding="utf-8") as handle:
            vault = json.loads(handle.read(MAX_VAULT + 1))
    except ValueError:
        fail("the vault file is damaged")
    if vault.get("version") != 1 or vault.get("kdf") != "argon2id":
        fail("unknown vault version: you may need a newer copy of this script")
    return vault


def unwrap_master_key(vault: dict, passphrase: str) -> bytes:
    try:
        salt = base64.b64decode(vault["salt"])
        nonce = base64.b64decode(vault["nonce"])
        wrapped = base64.b64decode(vault["wrappedKey"])
        memory, iterations, lanes = int(vault["memoryKib"]), int(vault["iterations"]), int(vault["parallelism"])
    except (KeyError, TypeError, ValueError):
        fail("the vault file is damaged")
    if len(salt) != 16 or len(nonce) != NONCE_LEN:
        fail("the vault file is damaged")
    if not (8 * 1024 <= memory <= 512 * 1024 and 1 <= iterations <= 20 and 1 <= lanes <= 8):
        fail("the vault asks for unusual settings; refusing")
    key = derive_key(passphrase, salt, memory, iterations, lanes)
    master = open_sealed(key, nonce, wrapped, b"SWVAULT1:key")
    if master is None:
        fail("wrong passphrase")
    return master


# -- Page files -------------------------------------------------------------


def split_page(text: str) -> tuple[list[str], str, str] | None:
    """(header lines, body, line ending) of a page file, or None when it is none."""
    newline = "\r\n" if "\r\n" in text[:300] else "\n"
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if lines[0].strip() != PAGE_HEADER:
        return None
    for position, line in enumerate(lines):
        if line.strip() == "":
            return lines[:position], "\n".join(lines[position + 1:]), newline
    return lines, "", newline


def decode_payload(body: str, magic: str) -> bytes | None:
    """The bytes behind the marker line of a sealed page body, or None."""
    text = body.strip()
    if not text.startswith(magic):
        return None
    try:
        return base64.b64decode("".join(text[len(magic):].split()), validate=True)
    except ValueError:
        return None


def parse_own_header(payload: bytes) -> tuple[int, int, int, bytes]:
    """(memory KiB, iterations, lanes, salt) at the start of the data of a page with its own password."""
    if len(payload) < OWN_HEADER_LEN + NONCE_LEN + TAG_LEN:
        raise Problem(f"the page is cut short {DAMAGED}")
    if payload[0] != 1:
        raise Problem("unknown version of a page with its own password: you may need a newer copy of this script")
    memory = int.from_bytes(payload[1:5], "big")
    iterations = int.from_bytes(payload[5:9], "big")
    lanes = payload[9]
    if not (8 * 1024 <= memory <= 512 * 1024 and 1 <= iterations <= 20 and 1 <= lanes <= 8):
        raise Problem("the page asks for unusual settings; refusing")
    return memory, iterations, lanes, payload[10:OWN_HEADER_LEN]


def open_own_page(password: str, payload: bytes) -> tuple[bytes, bytes] | None:
    """(page text, key of its files) when the password opens the page, else None."""
    memory, iterations, lanes, salt = parse_own_header(payload)
    master = derive_key(password, salt, memory, iterations, lanes)
    plain = open_box(
        blake_key(master, b"mumbin/page-text-key/v1"),
        payload[OWN_HEADER_LEN:],
        b"SWENC3:page" + payload[:OWN_HEADER_LEN],
    )
    return None if plain is None else (plain, blake_key(master, b"mumbin/page-file-key/v1"))


def open_own_file(file_key: bytes, raw: bytes) -> bytes:
    if not raw.startswith(FILE_MAGIC3) or len(raw) < len(FILE_MAGIC3) + NONCE_LEN + TAG_LEN:
        raise Problem("not an encrypted file")
    plain = open_box(file_key, raw[len(FILE_MAGIC3):], b"SWENC3:file")
    if plain is None:
        raise Problem(f"the file does not authenticate {DAMAGED}")
    return plain


class PagePasswords:
    """The passwords for pages with their own password: the ones given, then the ones asked for."""

    def __init__(self, given: list[str], may_ask: bool) -> None:
        self.known = list(given)
        self.may_ask = may_ask

    def open_page(self, label: str, payload: bytes) -> tuple[bytes, bytes] | None:
        for password in self.known:
            opened = open_own_page(password, payload)
            if opened is not None:
                return opened
        while self.may_ask:
            password = getpass.getpass(f"Password of the page {label} (Enter skips it): ")
            if not password:
                return None
            opened = open_own_page(password, payload)
            if opened is not None:
                self.known.append(password)
                return opened
            print("That password does not open this page.", file=sys.stderr)
        return None


def plain_page_file(headers: list[str], newline: str, plain: str) -> bytes:
    """A page file as it was before it was encrypted: the headers without `Encrypted:`, then the text."""
    kept = [header for header in headers if not header.startswith("Encrypted:")]
    return (newline.join(kept) + newline + newline + plain.replace("\n", newline)).encode("utf-8")


def decrypt_own_page(passwords: PagePasswords, label: str, raw: bytes) -> tuple[bytes, bytes] | None:
    """(plain page file, key of its files) for a page with its own password; None when `raw` is not one."""
    try:
        parts = split_page(raw.decode("utf-8"))
    except UnicodeDecodeError:
        return None
    if parts is None or "Encrypted: swenc3" not in [header.strip() for header in parts[0]]:
        return None
    headers, body, newline = parts
    payload = decode_payload(body, PAGE_MAGIC3)
    if payload is None:
        raise Problem(f"the page is damaged {DAMAGED}")
    opened = passwords.open_page(label, payload)
    if opened is None:
        raise Problem("no known password opens this page (or it is damaged)")
    plain, file_key = opened
    return plain_page_file(headers, newline, plain.decode("utf-8")), file_key


def decrypt_page(master: bytes | None, raw: bytes) -> bytes | None:
    """The plain page file for an encrypted page, or None when `raw` is not an encrypted page."""
    try:
        parts = split_page(raw.decode("utf-8"))
    except UnicodeDecodeError:
        return None
    if parts is None or "Encrypted: swenc1" not in [header.strip() for header in parts[0]]:
        return None
    if master is None:
        raise Problem("this page needs the passphrase of the notebook")
    headers, body, newline = parts
    payload = decode_payload(body, PAGE_MAGIC)
    plain = None
    if payload is not None and len(payload) >= NONCE_LEN + TAG_LEN:
        plain = open_box(master, payload, b"SWENC1:page")
    if plain is None:
        raise Problem(f"the page does not authenticate {DAMAGED}")
    return plain_page_file(headers, newline, plain.decode("utf-8"))


def decrypt_file(master: bytes | None, raw: bytes) -> bytes:
    if master is None:
        raise Problem("this file needs the passphrase of the notebook")
    if not raw.startswith(FILE_MAGIC) or len(raw) < len(FILE_MAGIC) + NONCE_LEN + TAG_LEN:
        raise Problem("not an encrypted file")
    plain = open_box(master, raw[len(FILE_MAGIC):], b"SWENC1:file")
    if plain is None:
        raise Problem(f"the file does not authenticate {DAMAGED}")
    return plain


# -- Notebooks that hide their file names -----------------------------------


def name_key_of(master: bytes) -> bytes:
    return hashlib.blake2b(b"mumbin/name-key/v1", key=master, digest_size=KEY_LEN).digest()


def open_name(name_key: bytes, block: bytes, kind: bytes) -> str | None:
    """The real name in a sealed name block (kind: b"page", b"dir" or b"file"), or None."""
    if not NAME_BLOCK_MIN <= len(block) <= NAME_BLOCK_MAX:
        return None
    plain = open_box(name_key, block, b"SWENC2:name:" + kind)
    if plain is None:
        return None
    try:
        name = plain.decode("utf-8")
    except UnicodeDecodeError:
        return None
    usable = name and not any(c in name for c in "/\\:") and name not in (".", "..") and not any(ord(c) < 32 for c in name)
    return name if usable else None


def split_blocks(data: bytes) -> tuple[bytes, bytes]:
    """(name block, content block) of the data behind a marker."""
    if len(data) >= 2:
        length = int.from_bytes(data[:2], "big")
        if NAME_BLOCK_MIN <= length <= NAME_BLOCK_MAX and len(data) >= 2 + length + NONCE_LEN + TAG_LEN:
            return data[2:2 + length], data[2 + length:]
    raise Problem("damaged")


def real_name(name_key: bytes, block: bytes, kind: bytes) -> str:
    name = open_name(name_key, block, kind)
    if name is None:
        raise Problem(f"the name does not authenticate {DAMAGED}")
    return name


def decrypt_sealed_page(master: bytes, name_key: bytes, raw: bytes) -> tuple[str, bytes]:
    """(real page name, plain page file) of a page of a notebook with hidden names."""
    try:
        parts = split_page(raw.decode("utf-8"))
    except UnicodeDecodeError:
        raise Problem("not a page") from None
    if parts is None or "Encrypted: swenc2" not in [header.strip() for header in parts[0]]:
        raise Problem("not a page of this kind")
    headers, body, newline = parts
    if not body.strip().startswith(PAGE_MAGIC2):
        raise Problem("no marker")
    data = decode_payload(body, PAGE_MAGIC2)
    if data is None:
        raise Problem("not base64")
    block, content = split_blocks(data)
    name = real_name(name_key, block, b"page")
    plain = open_box(master, content, b"SWENC2:page" + block)
    if plain is None:
        raise Problem(f"the page does not authenticate {DAMAGED}")
    return name, plain_page_file(headers, newline, plain.decode("utf-8"))


def decrypt_sealed_file(master: bytes, name_key: bytes, raw: bytes) -> tuple[str, bytes]:
    """(real file name, bytes) of an attachment of a notebook with hidden names."""
    if not raw.startswith(FILE_MAGIC2):
        raise Problem("not an encrypted file")
    block, content = split_blocks(raw[len(FILE_MAGIC2):])
    name = real_name(name_key, block, b"file")
    plain = open_box(master, content, b"SWENC2:file" + block)
    if plain is None:
        raise Problem(f"the file does not authenticate {DAMAGED}")
    return name, plain


# -- Walking the notebook ---------------------------------------------------


class PlainLayout:
    """Notebooks whose files keep their names: only the contents are encrypted."""

    def __init__(self, master: bytes | None, passwords: PagePasswords, root: str) -> None:
        self.master = master
        self.passwords = passwords
        self.root = root
        # Key of the files of each opened page with its own password, by the folder they lie in.
        self.file_keys: dict[str, bytes] = {}

    def folder_name(self, path: str) -> str:
        return os.path.basename(path)

    def decrypt_attachment(self, path: str) -> bytes:
        raw = read_capped(path)
        if not raw.startswith(FILE_MAGIC3):
            return decrypt_file(self.master, raw)
        key = self.file_keys.get(os.path.normcase(os.path.dirname(path)))
        if key is None:
            raise Problem("the page this file belongs to was not opened: its password is not known")
        return open_own_file(key, raw)

    def decrypt_text(self, path: str, raw: bytes) -> bytes | None:
        own = decrypt_own_page(self.passwords, os.path.relpath(path, self.root), raw)
        if own is None:
            return decrypt_page(self.master, raw)
        plain, file_key = own
        self.file_keys[os.path.normcase(path[: -len(".txt")])] = file_key
        return plain

    def convert(self, name: str, path: str, target: str, report: Report) -> None:
        lower = name.lower()
        if lower.endswith(".swenc"):
            write_new(os.path.join(target, name[: -len(".swenc")]), self.decrypt_attachment(path))
            report.files += 1
        elif lower.endswith(".txt"):
            raw = read_capped(path)
            plain = self.decrypt_text(path, raw)
            write_new(os.path.join(target, name), raw if plain is None else plain)
            if plain is None:
                report.copied += 1
            else:
                report.pages += 1
        else:
            copy_new(path, os.path.join(target, name))
            report.copied += 1


class SealedLayout:
    """Notebooks that hide their file names: the real names are read from inside the files."""

    def __init__(self, master: bytes) -> None:
        self.master = master
        self.name_key = name_key_of(master)

    def folder_name(self, path: str) -> str:
        name_file = os.path.join(path, DIR_NAME_FILE)
        if not os.path.isfile(name_file) or is_link(name_file) or os.path.getsize(name_file) > 1024:
            raise Problem("the folder name does not authenticate")
        with open(name_file, "rb") as handle:
            return real_name(self.name_key, handle.read(), b"dir").replace(" ", "_")

    def convert(self, name: str, path: str, target: str, report: Report) -> None:
        lower = name.lower()
        if lower.endswith(".txt"):
            real, text = decrypt_sealed_page(self.master, self.name_key, read_capped(path))
            write_new(os.path.join(target, real.replace(" ", "_") + ".txt"), text)
            report.pages += 1
        elif lower.endswith(".swenc"):
            real, data = decrypt_sealed_file(self.master, self.name_key, read_capped(path))
            write_new(os.path.join(target, real), data)
            report.files += 1
        elif name == NOTEBOOK_FILE:
            copy_new(path, os.path.join(target, name))
            report.copied += 1
        elif not name.startswith("."):  # hidden helper files (folder names, vault copies) are not copied
            raise Problem("not a file of this notebook")


def decrypt_tree(layout: PlainLayout | SealedLayout, directory: str, target: str, root: str, report: Report) -> None:
    os.makedirs(target, exist_ok=True)
    # Files before folders: a page is opened before the files in its folder need its key.
    for name in sorted(os.listdir(directory), key=lambda entry: (os.path.isdir(os.path.join(directory, entry)), entry)):
        path = os.path.join(directory, name)
        if is_link(path) or (directory == root and name in (VAULT_FILE, VAULT_BACKUP)):
            continue
        try:
            if os.path.isdir(path):
                decrypt_tree(layout, path, os.path.join(target, layout.folder_name(path)), root, report)
            else:
                layout.convert(name, path, target, report)
        except (OSError, ValueError, Problem) as error:
            report.problems.append(f"{os.path.relpath(path, root)}: {error}")


# -- Command line -----------------------------------------------------------


def check_folders(notebook: str, out: str) -> tuple[str, str]:
    source = os.path.realpath(notebook)
    target = os.path.realpath(out)
    if not os.path.isdir(source):
        fail(f"{source} is not a folder")
    if os.path.lexists(out):
        fail(f"{target} exists; choose a new folder")
    try:
        shared = os.path.commonpath([os.path.normcase(source), os.path.normcase(target)])
        inside = shared in (os.path.normcase(source), os.path.normcase(target))
    except ValueError:  # another drive: certainly not inside
        inside = False
    if inside:
        fail("the output folder must not lie inside the notebook, nor the notebook inside it")
    return source, target


def main() -> None:
    parser = argparse.ArgumentParser(description="Decrypt a Mumbin notebook into a new folder.")
    parser.add_argument("notebook", help="the notebook folder (with the file .securewiki-vault)")
    parser.add_argument("--out", required=True, help="a NEW folder for the decrypted copy")
    parser.add_argument("--pages-only", action="store_true", help="do not ask for the notebook passphrase: open only pages with a password of their own")
    parser.add_argument("--no-prompt", action="store_true", help="never ask for the password of a page (use MUMBIN_PAGE_PASSWORD)")
    arguments = parser.parse_args()
    source, out = check_folders(arguments.notebook, arguments.out)

    # A notebook without a vault can still hold pages with a password of their own.
    has_vault = os.path.isfile(vault_path(source))
    vault: dict = {}
    master = None
    if has_vault and not arguments.pages_only:
        passphrase = os.environ.get("MUMBIN_PASSPHRASE") or getpass.getpass("Passphrase: ")
        vault = read_vault(source)
        master = unwrap_master_key(vault, passphrase)
        del passphrase

    given = [os.environ["MUMBIN_PAGE_PASSWORD"]] if os.environ.get("MUMBIN_PAGE_PASSWORD") else []
    passwords = PagePasswords(given, may_ask=sys.stdin.isatty() and sys.stderr.isatty() and not arguments.no_prompt)
    report = Report()
    layout = SealedLayout(master) if vault.get("sealedNames") else PlainLayout(master, passwords, source)
    decrypt_tree(layout, source, out, source, report)

    print(f"Decrypted pages: {report.pages}, decrypted files: {report.files}, copied unchanged: {report.copied}")
    print(f"The decrypted notebook is in {out}. It can be opened with Mumbin.")
    if report.problems:
        print("Not done:", file=sys.stderr)
        for line in report.problems:
            print("  " + line, file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
