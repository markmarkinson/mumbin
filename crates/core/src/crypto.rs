//! Encryption of pages and files (decision E-016).
//!
//! No primitive is written here: the passphrase goes through Argon2id, the
//! contents through XChaCha20-Poly1305 (both RustCrypto). What this module adds
//! is the order in which they are used.
//!
//! * A random 256-bit **master key** encrypts everything. It is stored wrapped
//!   by a key derived from the passphrase, in the vault file of the notebook.
//!   Changing the passphrase re-wraps the master key; no content is touched.
//! * Every sealed text or file has its own random 192-bit nonce, so nonces
//!   never repeat in practice. A fixed associated-data tag keeps a sealed page
//!   from being accepted as a sealed file, and the other way round.
//! * Whatever comes from disk is untrusted: parameters are bounded (a hostile
//!   vault file cannot ask for gigabytes of memory), a wrong passphrase and a
//!   damaged file are told apart only by which key failed, and nothing is
//!   decrypted that does not authenticate.

use std::fmt;
use std::path::Path;

pub mod names;
mod page_key;

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
pub use page_key::{
    FILE_MAGIC3, FileSeal, Keys, PAGE_HEADER_VALUE3, PAGE_MAGIC3, PageKey, PageKeys,
};
use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;
/// For callers that hold a password: wiped from memory when dropped.
pub use zeroize::Zeroizing;

/// First line of a sealed page body.
pub const PAGE_MAGIC: &str = "SWENC1";
/// First bytes of a sealed file.
pub const FILE_MAGIC: &[u8] = b"SWENC1F\0";
/// Name of the vault file in the notebook folder (hidden: the page lists skip it).
pub const VAULT_FILE: &str = ".securewiki-vault";
/// A second copy of the vault file next to it: if the first is deleted by mistake or damaged
/// (a sync conflict, a tidy-up), the notebook still opens with its passphrase.
pub const VAULT_BACKUP: &str = ".securewiki-vault.bak";
/// Value of the page header that marks an encrypted page.
pub const PAGE_HEADER: &str = "Encrypted";
pub const PAGE_HEADER_VALUE: &str = "swenc1";

const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 24;
const TAG_LEN: usize = 16;
const SALT_LEN: usize = 16;
/// The vault file is a few hundred bytes; anything larger is not one.
const MAX_VAULT_FILE: u64 = 4096;
/// Largest content sealed or opened in one piece.
pub const MAX_SEALED: usize = 512 * 1024 * 1024;
/// What sealing adds to a file: marker, nonce and tag.
pub(crate) const FILE_OVERHEAD: u64 = (FILE_MAGIC.len() + NONCE_LEN + TAG_LEN) as u64;

const AAD_PAGE: &[u8] = b"SWENC1:page";
const AAD_FILE: &[u8] = b"SWENC1:file";
const AAD_WRAP: &[u8] = b"SWVAULT1:key";

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum CryptoError {
    /// The passphrase does not open the vault.
    #[error("wrong passphrase")]
    WrongPassphrase,
    /// The data is damaged, was changed, or is not what it claims to be.
    #[error("damaged encrypted data: {0}")]
    Corrupt(&'static str),
    /// The vault asks for settings that are out of the allowed range.
    #[error("the vault asks for unusual settings")]
    BadParameters,
    /// The system could not give random numbers.
    #[error("no source of randomness")]
    NoRandomness,
    /// The vault file could not be read or written.
    #[error("vault file: {0}")]
    Io(String),
    /// The notebook has no vault.
    #[error("the notebook has no vault")]
    NoVault,
}

/// Cost of turning the passphrase into a key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KdfParams {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl Default for KdfParams {
    /// 64 MiB and three passes: a few tenths of a second on a normal computer,
    /// and a real cost for someone guessing passphrases.
    fn default() -> Self {
        KdfParams {
            memory_kib: 64 * 1024,
            iterations: 3,
            parallelism: 1,
        }
    }
}

impl KdfParams {
    /// The weakest settings the program accepts; for tests.
    pub const MINIMUM: KdfParams = KdfParams {
        memory_kib: 8 * 1024,
        iterations: 1,
        parallelism: 1,
    };

    fn check(self) -> Result<(), CryptoError> {
        let ok = (8 * 1024..=512 * 1024).contains(&self.memory_kib)
            && (1..=20).contains(&self.iterations)
            && (1..=8).contains(&self.parallelism);
        if ok {
            Ok(())
        } else {
            Err(CryptoError::BadParameters)
        }
    }
}

/// What the vault file holds: how the key is derived and the wrapped master key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFile {
    /// The notebook hides its file names too (decision E-025): every page and file has an
    /// opaque name on disk and carries its real name sealed inside.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub sealed_names: bool,
    pub version: u32,
    pub kdf: String,
    #[serde(flatten)]
    pub params: KdfParams,
    pub salt: String,
    pub nonce: String,
    pub wrapped_key: String,
}

/// The unlocked master key. It lives in memory only and is wiped when dropped.
pub struct Vault {
    pub(crate) key: Zeroizing<[u8; KEY_LEN]>,
}

impl fmt::Debug for Vault {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Vault(unlocked)")
    }
}

pub(crate) fn random(buffer: &mut [u8]) -> Result<(), CryptoError> {
    getrandom::fill(buffer).map_err(|_| CryptoError::NoRandomness)
}

fn derive_key(
    passphrase: &str,
    salt: &[u8],
    params: KdfParams,
) -> Result<Zeroizing<[u8; KEY_LEN]>, CryptoError> {
    params.check()?;
    let argon_params = Params::new(
        params.memory_kib,
        params.iterations,
        params.parallelism,
        Some(KEY_LEN),
    )
    .map_err(|_| CryptoError::BadParameters)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);
    let mut key = Zeroizing::new([0_u8; KEY_LEN]);
    // Composed to NFC, so the same word typed on another keyboard or system opens the same vault.
    let passphrase = Zeroizing::new(passphrase.nfc().collect::<String>().into_bytes());
    argon
        .hash_password_into(&passphrase, salt, key.as_mut())
        .map_err(|_| CryptoError::BadParameters)?;
    Ok(key)
}

pub(crate) fn encrypt(
    key: &[u8; KEY_LEN],
    plaintext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    if plaintext.len() > MAX_SEALED {
        return Err(CryptoError::Corrupt("too large"));
    }
    let cipher = XChaCha20Poly1305::new(key.into());
    let mut nonce = [0_u8; NONCE_LEN];
    random(&mut nonce)?;
    let sealed = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| CryptoError::Corrupt("encryption failed"))?;
    let mut out = Vec::with_capacity(NONCE_LEN + sealed.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&sealed);
    Ok(out)
}

pub(crate) fn decrypt(key: &[u8; KEY_LEN], data: &[u8], aad: &[u8]) -> Option<Zeroizing<Vec<u8>>> {
    if data.len() < NONCE_LEN + TAG_LEN || data.len() > MAX_SEALED + NONCE_LEN + TAG_LEN {
        return None;
    }
    let (nonce, sealed) = data.split_at(NONCE_LEN);
    let cipher = XChaCha20Poly1305::new(key.into());
    cipher
        .decrypt(XNonce::from_slice(nonce), Payload { msg: sealed, aad })
        .ok()
        .map(Zeroizing::new)
}

// ── Base64 (standard alphabet, padded) ─────────────────────────────────

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// A sealed page body: the marker line, then the data as Base64 lines.
pub(crate) fn armour(magic: &str, data: &[u8]) -> String {
    let encoded = base64_encode(data);
    let mut out = String::with_capacity(magic.len() + 1 + encoded.len() + encoded.len() / 72 + 1);
    out.push_str(magic);
    out.push('\n');
    for line in encoded.as_bytes().chunks(72) {
        out.push_str(std::str::from_utf8(line).unwrap_or_default());
        out.push('\n');
    }
    out
}

pub(crate) fn base64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let group = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let value = (u32::from(group[0]) << 16) | (u32::from(group[1]) << 8) | u32::from(group[2]);
        out.push(ALPHABET[(value >> 18) as usize & 63] as char);
        out.push(ALPHABET[(value >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[(value >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[value as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

/// Decodes padded standard base64; white space is skipped, anything else invalid is refused.
pub(crate) fn base64_decode(text: &str) -> Option<Vec<u8>> {
    let mut values = Vec::with_capacity(text.len());
    let mut padding = 0;
    for c in text.chars().filter(|c| !c.is_whitespace()) {
        if c == '=' {
            padding += 1;
            continue;
        }
        if padding > 0 {
            return None; // data after padding
        }
        values.push(u32::try_from(ALPHABET.iter().position(|&a| a as char == c)?).ok()?);
    }
    if padding > 2
        || (values.len() + padding) % 4 != 0
        || (padding > 0 && values.len() % 4 == 1)
        || values.len() % 4 == 1
    {
        return None;
    }
    let mut out = Vec::with_capacity(values.len() / 4 * 3 + 2);
    for group in values.chunks(4) {
        let mut value = 0_u32;
        for (position, v) in group.iter().enumerate() {
            value |= v << (18 - 6 * position);
        }
        let bytes = value.to_be_bytes();
        out.extend_from_slice(&bytes[1..group.len()]);
    }
    Some(out)
}

// ── The vault ──────────────────────────────────────────────────────────

impl Vault {
    /// A new vault with a fresh master key, wrapped by `passphrase`.
    pub fn create(passphrase: &str, params: KdfParams) -> Result<(Vault, VaultFile), CryptoError> {
        let mut key = Zeroizing::new([0_u8; KEY_LEN]);
        random(key.as_mut())?;
        let vault = Vault { key };
        let file = vault.wrap(passphrase, params)?;
        Ok((vault, file))
    }

    /// Opens the vault with its passphrase.
    pub fn unlock(file: &VaultFile, passphrase: &str) -> Result<Vault, CryptoError> {
        if file.version != 1 || file.kdf != "argon2id" {
            return Err(CryptoError::Corrupt("unknown vault version"));
        }
        let salt = base64_decode(&file.salt)
            .filter(|salt| salt.len() == SALT_LEN)
            .ok_or(CryptoError::Corrupt("salt"))?;
        let wrapped =
            base64_decode(&file.wrapped_key).ok_or(CryptoError::Corrupt("wrapped key"))?;
        let nonce = base64_decode(&file.nonce)
            .filter(|nonce| nonce.len() == NONCE_LEN)
            .ok_or(CryptoError::Corrupt("nonce"))?;
        let kek = derive_key(passphrase, &salt, file.params)?;
        let mut joined = nonce;
        joined.extend_from_slice(&wrapped);
        let master = decrypt(&kek, &joined, AAD_WRAP).ok_or(CryptoError::WrongPassphrase)?;
        let key: [u8; KEY_LEN] = master
            .as_slice()
            .try_into()
            .map_err(|_| CryptoError::Corrupt("key length"))?;
        Ok(Vault {
            key: Zeroizing::new(key),
        })
    }

    /// The master key wrapped by `passphrase`: a new vault file, or the same vault under a new
    /// passphrase (everything already sealed stays readable).
    pub fn wrap(&self, passphrase: &str, params: KdfParams) -> Result<VaultFile, CryptoError> {
        let mut salt = [0_u8; SALT_LEN];
        random(&mut salt)?;
        let kek = derive_key(passphrase, &salt, params)?;
        let sealed = encrypt(&kek, self.key.as_ref(), AAD_WRAP)?;
        let (nonce, wrapped) = sealed.split_at(NONCE_LEN);
        Ok(VaultFile {
            sealed_names: false,
            version: 1,
            kdf: "argon2id".to_owned(),
            params,
            salt: base64_encode(&salt),
            nonce: base64_encode(nonce),
            wrapped_key: base64_encode(wrapped),
        })
    }

    /// Seals page text: the first line says what it is, then the data as Base64 lines.
    pub fn seal_text(&self, plaintext: &str) -> Result<String, CryptoError> {
        let sealed = encrypt(&self.key, plaintext.as_bytes(), AAD_PAGE)?;
        Ok(armour(PAGE_MAGIC, &sealed))
    }

    /// Opens text sealed by [`Vault::seal_text`]. Refuses anything that does not authenticate.
    pub fn open_text(&self, sealed: &str) -> Result<String, CryptoError> {
        let body = sealed
            .trim_start()
            .strip_prefix(PAGE_MAGIC)
            .ok_or(CryptoError::Corrupt("no marker"))?;
        let data = base64_decode(body).ok_or(CryptoError::Corrupt("not base64"))?;
        let plain = decrypt(&self.key, &data, AAD_PAGE)
            .ok_or(CryptoError::Corrupt("does not authenticate"))?;
        String::from_utf8(plain.to_vec()).map_err(|_| CryptoError::Corrupt("not text"))
    }

    /// Seals the bytes of a file.
    pub fn seal_file(&self, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let sealed = encrypt(&self.key, plaintext, AAD_FILE)?;
        let mut out = Vec::with_capacity(FILE_MAGIC.len() + sealed.len());
        out.extend_from_slice(FILE_MAGIC);
        out.extend_from_slice(&sealed);
        Ok(out)
    }

    pub fn open_file(&self, sealed: &[u8]) -> Result<Zeroizing<Vec<u8>>, CryptoError> {
        let data = sealed
            .strip_prefix(FILE_MAGIC)
            .ok_or(CryptoError::Corrupt("no marker"))?;
        decrypt(&self.key, data, AAD_FILE).ok_or(CryptoError::Corrupt("does not authenticate"))
    }
}

// ── The vault file ─────────────────────────────────────────────────────

/// Reads the notebook's vault file, `None` when the notebook has none. A file
/// that is a link, too big, unreadable or out of range is an error, not a vault.
pub fn read_vault_file(folder: &Path) -> Result<Option<VaultFile>, CryptoError> {
    let first = read_one_vault_file(&folder.join(VAULT_FILE));
    if matches!(first, Ok(Some(_))) {
        return first;
    }
    // Missing or damaged: the copy next to it takes over, and the main file is made again.
    if let Ok(Some(file)) = read_one_vault_file(&folder.join(VAULT_BACKUP)) {
        let _ = write_vault_file(folder, &file);
        return Ok(Some(file));
    }
    first
}

fn read_one_vault_file(path: &Path) -> Result<Option<VaultFile>, CryptoError> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(CryptoError::Io(error.to_string())),
    };
    if !metadata.is_file() || crate::notebook::is_link(&metadata) || metadata.len() > MAX_VAULT_FILE
    {
        return Err(CryptoError::Corrupt(
            "the vault file is not a plain small file",
        ));
    }
    let bytes = crate::notebook::read_bounded(path, MAX_VAULT_FILE)
        .map_err(|error| CryptoError::Io(error.to_string()))?;
    let file: VaultFile =
        serde_json::from_slice(&bytes).map_err(|_| CryptoError::Corrupt("vault file"))?;
    file.params.check()?;
    Ok(Some(file))
}

/// Writes the vault file next to the notebook's pages, replacing the old one in one step.
pub fn write_vault_file(folder: &Path, file: &VaultFile) -> Result<(), CryptoError> {
    write_vault_copy(&folder.join(VAULT_FILE), file)?;
    write_vault_backup(folder, file)
}

/// Writes the second copy of the vault file.
pub fn write_vault_backup(folder: &Path, file: &VaultFile) -> Result<(), CryptoError> {
    write_vault_copy(&folder.join(VAULT_BACKUP), file)
}

/// Replaces the file at `path` by the vault file, unless something else than a plain file is there.
fn write_vault_copy(path: &Path, file: &VaultFile) -> Result<(), CryptoError> {
    if std::fs::symlink_metadata(path)
        .is_ok_and(|metadata| !metadata.is_file() || crate::notebook::is_link(&metadata))
    {
        return Err(CryptoError::Corrupt("the vault file is not a plain file"));
    }
    let text =
        serde_json::to_string_pretty(file).map_err(|error| CryptoError::Io(error.to_string()))?;
    crate::notebook::write_atomically(path, text.as_bytes())
        .map_err(|error| CryptoError::Io(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FAST: KdfParams = KdfParams::MINIMUM;

    #[test]
    fn base64_matches_known_values_and_refuses_bad_input() {
        for (plain, encoded) in [
            ("", ""),
            ("f", "Zg=="),
            ("fo", "Zm8="),
            ("foo", "Zm9v"),
            ("foobar", "Zm9vYmFy"),
        ] {
            assert_eq!(base64_encode(plain.as_bytes()), encoded);
            assert_eq!(base64_decode(encoded).unwrap(), plain.as_bytes());
        }
        assert_eq!(
            base64_decode("Zm9v\nYmFy \r\n").unwrap(),
            b"foobar",
            "white space is skipped"
        );
        for bad in ["Z", "Zg=", "Zg===", "Zg==Zg==", "Zm9v!", "====", "Zg=a"] {
            assert!(base64_decode(bad).is_none(), "{bad:?}");
        }
        let all: Vec<u8> = (0..=255).collect();
        assert_eq!(base64_decode(&base64_encode(&all)).unwrap(), all);
    }

    #[test]
    fn a_vault_opens_with_its_passphrase_only() {
        let (vault, file) = Vault::create("correct horse", FAST).unwrap();
        let sealed = vault.seal_text("Geheimer Text ä 🙂").unwrap();
        let again = Vault::unlock(&file, "correct horse").unwrap();
        assert_eq!(again.open_text(&sealed).unwrap(), "Geheimer Text ä 🙂");
        assert_eq!(
            Vault::unlock(&file, "correct hors").unwrap_err(),
            CryptoError::WrongPassphrase
        );
        assert_eq!(
            Vault::unlock(&file, "").unwrap_err(),
            CryptoError::WrongPassphrase
        );
        // Another vault cannot read it.
        let (other, _) = Vault::create("correct horse", FAST).unwrap();
        assert!(other.open_text(&sealed).is_err());
    }

    #[test]
    fn the_same_passphrase_written_two_ways_is_the_same() {
        let (_, file) = Vault::create("Café", FAST).unwrap();
        assert!(
            Vault::unlock(&file, "Cafe\u{301}").is_ok(),
            "decomposed é must open a vault made with composed é"
        );
    }

    #[test]
    fn sealed_text_is_authenticated_and_never_repeats() {
        let (vault, _) = Vault::create("pw", FAST).unwrap();
        let first = vault.seal_text("gleich").unwrap();
        let second = vault.seal_text("gleich").unwrap();
        assert_ne!(
            first, second,
            "the same text sealed twice must differ (fresh nonce)"
        );
        assert!(first.starts_with("SWENC1\n"));
        assert!(!first.contains("gleich"));
        // Every changed, cut or extended form is refused.
        let lines: Vec<&str> = first.lines().collect();
        let body: String = lines[1..].concat();
        let mut bytes = body.clone().into_bytes();
        for position in [0, 10, 30, body.len() - 6] {
            let original = bytes[position];
            bytes[position] = if original == b'A' { b'B' } else { b'A' };
            let tampered = format!("SWENC1\n{}", String::from_utf8(bytes.clone()).unwrap());
            assert!(
                vault.open_text(&tampered).is_err(),
                "a change at {position} was accepted"
            );
            bytes[position] = original;
        }
        assert!(
            vault
                .open_text(&format!("SWENC1\n{}", &body[..body.len() - 8]))
                .is_err(),
            "a cut text was accepted"
        );
        assert!(
            vault.open_text("SWENC1\n").is_err()
                && vault.open_text("").is_err()
                && vault.open_text("hallo").is_err()
        );
        assert!(vault.open_text(&first).is_ok());
    }

    #[test]
    fn a_page_cannot_pass_for_a_file_or_the_other_way_round() {
        let (vault, _) = Vault::create("pw", FAST).unwrap();
        let file = vault.seal_file(b"bytes \x00\xff").unwrap();
        assert!(file.starts_with(FILE_MAGIC));
        assert_eq!(
            vault.open_file(&file).unwrap().as_slice(),
            b"bytes \x00\xff"
        );
        // The data of a sealed page, wrapped as a file, does not authenticate.
        let page = vault.seal_text("Text").unwrap();
        let data = base64_decode(page.strip_prefix("SWENC1\n").unwrap()).unwrap();
        let mut forged = FILE_MAGIC.to_vec();
        forged.extend_from_slice(&data);
        assert!(vault.open_file(&forged).is_err());
        let mut damaged = file.clone();
        *damaged.last_mut().unwrap() ^= 1;
        assert!(vault.open_file(&damaged).is_err());
        assert!(vault.open_file(b"SWENC1F\0").is_err() && vault.open_file(b"").is_err());
    }

    #[test]
    fn the_passphrase_can_change_without_touching_the_content() {
        let (vault, file) = Vault::create("alt", FAST).unwrap();
        let sealed = vault.seal_text("bleibt lesbar").unwrap();
        let changed = vault.wrap("neu", FAST).unwrap();
        assert_ne!(changed.salt, file.salt, "a new salt");
        assert!(
            Vault::unlock(&changed, "alt").is_err(),
            "the old passphrase must stop working"
        );
        assert_eq!(
            Vault::unlock(&changed, "neu")
                .unwrap()
                .open_text(&sealed)
                .unwrap(),
            "bleibt lesbar"
        );
    }

    #[test]
    fn a_hostile_vault_file_cannot_ask_for_much_work() {
        let (_, file) = Vault::create("pw", FAST).unwrap();
        for params in [
            KdfParams {
                memory_kib: 4 * 1024 * 1024,
                ..FAST
            },
            KdfParams {
                memory_kib: 1024,
                ..FAST
            },
            KdfParams {
                iterations: 0,
                ..FAST
            },
            KdfParams {
                iterations: 1000,
                ..FAST
            },
            KdfParams {
                parallelism: 0,
                ..FAST
            },
            KdfParams {
                parallelism: 64,
                ..FAST
            },
        ] {
            let hostile = VaultFile {
                params,
                ..file.clone()
            };
            assert_eq!(
                Vault::unlock(&hostile, "pw").unwrap_err(),
                CryptoError::BadParameters,
                "{params:?}"
            );
        }
        for broken in [
            VaultFile {
                version: 2,
                ..file.clone()
            },
            VaultFile {
                kdf: "scrypt".into(),
                ..file.clone()
            },
            VaultFile {
                salt: "AAAA".into(),
                ..file.clone()
            },
            VaultFile {
                nonce: "!!".into(),
                ..file.clone()
            },
            VaultFile {
                wrapped_key: String::new(),
                ..file.clone()
            },
        ] {
            assert!(matches!(
                Vault::unlock(&broken, "pw"),
                Err(CryptoError::Corrupt(_) | CryptoError::WrongPassphrase)
            ));
        }
    }

    #[test]
    fn the_vault_file_is_read_and_written_with_care() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_vault_file(dir.path()).unwrap(), None);
        let (_, file) = Vault::create("pw", FAST).unwrap();
        write_vault_file(dir.path(), &file).unwrap();
        assert_eq!(read_vault_file(dir.path()).unwrap(), Some(file.clone()));
        let text = std::fs::read_to_string(dir.path().join(VAULT_FILE)).unwrap();
        assert!(!text.contains("pw") && text.contains("argon2id"));
        // The copy next to it takes over when the file is damaged.
        std::fs::write(dir.path().join(VAULT_FILE), "kaputt").unwrap();
        assert_eq!(read_vault_file(dir.path()).unwrap(), Some(file.clone()));
        // Without the copy: too big, not JSON, out-of-range parameters are errors, never a vault.
        std::fs::remove_file(dir.path().join(VAULT_BACKUP)).unwrap();
        std::fs::write(dir.path().join(VAULT_FILE), "x".repeat(5000)).unwrap();
        assert!(read_vault_file(dir.path()).is_err());
        std::fs::write(dir.path().join(VAULT_FILE), "kein json").unwrap();
        assert!(read_vault_file(dir.path()).is_err());
        let hostile = VaultFile {
            params: KdfParams {
                memory_kib: u32::MAX,
                ..FAST
            },
            ..file
        };
        std::fs::write(
            dir.path().join(VAULT_FILE),
            serde_json::to_string(&hostile).unwrap(),
        )
        .unwrap();
        assert_eq!(
            read_vault_file(dir.path()).unwrap_err(),
            CryptoError::BadParameters
        );
        // A folder with that name is no vault file either.
        std::fs::remove_file(dir.path().join(VAULT_FILE)).unwrap();
        std::fs::create_dir(dir.path().join(VAULT_FILE)).unwrap();
        assert!(read_vault_file(dir.path()).is_err());
        assert!(write_vault_file(dir.path(), &hostile).is_err());
    }

    #[test]
    fn a_debug_print_never_shows_the_key() {
        let (vault, _) = Vault::create("pw", FAST).unwrap();
        assert_eq!(format!("{vault:?}"), "Vault(unlocked)");
    }
}
