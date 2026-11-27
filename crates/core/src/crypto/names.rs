//! Opaque names for sealed notebooks (decision E-025).
//!
//! In a sealed notebook no file on disk carries a real name. A page, a folder and an
//! attachment are stored under a token, a keyed hash of their name that nobody without the
//! key can turn back into the name; the real name travels inside the file, sealed.
//!
//! * **Token** = BLAKE2b (keyed with a key derived from the master key, 128 bits) of the lower
//!   case name, written in lower case Base32: 26 letters and digits that Windows accepts and
//!   cannot confuse by case. A page and the folder of its sub-pages share a token; files use
//!   another domain, so an attachment never collides with a page.
//! * **Name block** = the real name sealed with XChaCha20-Poly1305 under another derived key. It
//!   sits first in the file (a sealed page has `SWENC2`, a sealed file `SWENC2F\0`), so the
//!   listing of a folder reads a few hundred bytes of each file, not its content. A folder has
//!   its name block in the hidden file `.mnm`.
//! * The content is sealed with the master key, and its associated data holds the name block,
//!   so a name block cannot be swapped between files. A listing also checks that the token of
//!   the file name is the token of the name inside; a file whose name does not fit is ignored.
//!
//! What stays visible: how many files and folders there are, how deep they nest and how large
//! they are. Not the names, and not which page an attachment belongs to by name.

use blake2::Blake2bMac;
use blake2::digest::Mac;
use blake2::digest::consts::{U16, U32};
use zeroize::Zeroizing;

use super::{
    CryptoError, KEY_LEN, NONCE_LEN, TAG_LEN, Vault, armour, base64_decode, decrypt, encrypt,
};

/// First line of the body of a sealed page whose name is sealed too.
pub const PAGE_MAGIC2: &str = "SWENC2";
/// First bytes of a sealed file whose name is sealed too.
pub const FILE_MAGIC2: &[u8] = b"SWENC2F\0";
/// Value of the page header `Encrypted` for such a page.
pub const PAGE_HEADER_VALUE2: &str = "swenc2";
/// Hidden file in a folder that holds the sealed name of that folder.
pub const DIR_NAME_FILE: &str = ".mnm";
/// Longest real name (one part of a page name, or a file name) in bytes.
pub(crate) const MAX_NAME: usize = 255;

const AAD_PAGE2: &[u8] = b"SWENC2:page";
const AAD_FILE2: &[u8] = b"SWENC2:file";
const BASE32: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyz234567";

/// What a name belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NameKind {
    /// A page file (`<token>.txt`).
    Page,
    /// A folder (`<token>`), with the same token as its page.
    Dir,
    /// An attachment (`<token>.swenc`).
    File,
}

impl NameKind {
    fn domain(self) -> &'static [u8] {
        match self {
            NameKind::Page | NameKind::Dir => b"p",
            NameKind::File => b"f",
        }
    }

    fn aad(self) -> &'static [u8] {
        match self {
            NameKind::Page => b"SWENC2:name:page",
            NameKind::Dir => b"SWENC2:name:dir",
            NameKind::File => b"SWENC2:name:file",
        }
    }
}

/// The two keys that name tokens and name blocks need; made from the master key and kept in
/// memory only. They cannot open any content.
#[derive(Clone)]
pub struct LayoutKeys {
    token: Zeroizing<[u8; KEY_LEN]>,
    block: Zeroizing<[u8; KEY_LEN]>,
}

impl std::fmt::Debug for LayoutKeys {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("LayoutKeys(..)")
    }
}

pub(super) fn derive(master: &[u8; KEY_LEN], label: &[u8]) -> Zeroizing<[u8; KEY_LEN]> {
    let mut mac = <Blake2bMac<U32> as Mac>::new_from_slice(master).expect("a 32 byte key is valid");
    mac.update(label);
    let mut out = Zeroizing::new([0_u8; KEY_LEN]);
    out.copy_from_slice(&mac.finalize().into_bytes());
    out
}

fn base32(bytes: &[u8]) -> String {
    let mut out = String::with_capacity((bytes.len() * 8).div_ceil(5));
    let (mut buffer, mut bits) = (0_u32, 0_u32);
    for byte in bytes {
        buffer = (buffer << 8) | u32::from(*byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(BASE32[((buffer >> bits) & 31) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(BASE32[((buffer << (5 - bits)) & 31) as usize] as char);
    }
    out
}

impl LayoutKeys {
    /// The token a name has on disk: 26 characters of `a-z2-7`.
    pub fn token(&self, kind: NameKind, name: &str) -> String {
        let mut mac = <Blake2bMac<U16> as Mac>::new_from_slice(self.token.as_ref())
            .expect("a 32 byte key is valid");
        mac.update(kind.domain());
        mac.update(&[0]);
        mac.update(name.to_lowercase().as_bytes());
        base32(&mac.finalize().into_bytes())
    }

    /// Seals a real name: nonce, ciphertext and tag.
    pub fn seal_name(&self, kind: NameKind, name: &str) -> Result<Vec<u8>, CryptoError> {
        if name.is_empty() || name.len() > MAX_NAME {
            return Err(CryptoError::Corrupt("name length"));
        }
        encrypt(&self.block, name.as_bytes(), kind.aad())
    }

    /// Opens a sealed name; `None` for anything that does not authenticate.
    pub fn open_name(&self, kind: NameKind, block: &[u8]) -> Option<String> {
        let plain = decrypt(&self.block, block, kind.aad())?;
        let name = String::from_utf8(plain.to_vec()).ok()?;
        (!name.is_empty() && name.len() <= MAX_NAME).then_some(name)
    }
}

/// Smallest and largest sealed name block: nonce and tag around 1 to `MAX_NAME` bytes.
const MIN_BLOCK: usize = NONCE_LEN + TAG_LEN + 1;
const MAX_BLOCK: usize = NONCE_LEN + TAG_LEN + MAX_NAME;

/// What sealing adds to a file with a sealed name: marker, length, name block, then the content
/// block with its own nonce and tag.
pub(crate) const fn named_file_overhead(name_len: usize) -> u64 {
    (FILE_MAGIC2.len() + 2 + NONCE_LEN + TAG_LEN + name_len + NONCE_LEN + TAG_LEN) as u64
}

fn assemble(name_block: &[u8], data_block: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(2 + name_block.len() + data_block.len());
    out.extend_from_slice(&(name_block.len() as u16).to_be_bytes());
    out.extend_from_slice(name_block);
    out.extend_from_slice(data_block);
    out
}

/// The name block and what follows it. `data` may be only the beginning of a file, as long as the
/// name block is complete.
fn split(data: &[u8]) -> Option<(&[u8], &[u8])> {
    let length = usize::from(u16::from_be_bytes([*data.first()?, *data.get(1)?]));
    if !(MIN_BLOCK..=MAX_BLOCK).contains(&length) || data.len() < 2 + length {
        return None;
    }
    Some((&data[2..2 + length], &data[2 + length..]))
}

fn bound_aad(base: &[u8], name_block: &[u8]) -> Vec<u8> {
    let mut aad = base.to_vec();
    aad.extend_from_slice(name_block);
    aad
}

impl Vault {
    /// The keys for tokens and name blocks of this vault's notebook.
    pub fn layout_keys(&self) -> LayoutKeys {
        LayoutKeys {
            token: derive(&self.key, b"mumbin/token-key/v1"),
            block: derive(&self.key, b"mumbin/name-key/v1"),
        }
    }

    /// Seals page text together with the real name of the page (its last part): the first line
    /// says what it is, then name block and text as Base64 lines.
    pub fn seal_named_text(&self, name: &str, text: &str) -> Result<String, CryptoError> {
        let block = self.layout_keys().seal_name(NameKind::Page, name)?;
        let data = encrypt(&self.key, text.as_bytes(), &bound_aad(AAD_PAGE2, &block))?;
        Ok(armour(PAGE_MAGIC2, &assemble(&block, &data)))
    }

    /// Opens text sealed by [`Vault::seal_named_text`]: the real name and the text.
    pub fn open_named_text(&self, sealed: &str) -> Result<(String, String), CryptoError> {
        let body = sealed
            .trim_start()
            .strip_prefix(PAGE_MAGIC2)
            .ok_or(CryptoError::Corrupt("no marker"))?;
        let data = base64_decode(body).ok_or(CryptoError::Corrupt("not base64"))?;
        let (block, content) = split(&data).ok_or(CryptoError::Corrupt("layout"))?;
        let name = self
            .layout_keys()
            .open_name(NameKind::Page, block)
            .ok_or(CryptoError::Corrupt("name does not authenticate"))?;
        let plain = decrypt(&self.key, content, &bound_aad(AAD_PAGE2, block))
            .ok_or(CryptoError::Corrupt("does not authenticate"))?;
        let text =
            String::from_utf8(plain.to_vec()).map_err(|_| CryptoError::Corrupt("not text"))?;
        Ok((name, text))
    }

    /// Seals the bytes of a file together with its real file name.
    pub fn seal_named_file(&self, name: &str, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let block = self.layout_keys().seal_name(NameKind::File, name)?;
        let data = encrypt(&self.key, plaintext, &bound_aad(AAD_FILE2, &block))?;
        let mut out = Vec::with_capacity(FILE_MAGIC2.len() + 2 + block.len() + data.len());
        out.extend_from_slice(FILE_MAGIC2);
        out.extend_from_slice(&assemble(&block, &data));
        Ok(out)
    }

    pub fn open_named_file(
        &self,
        sealed: &[u8],
    ) -> Result<(String, Zeroizing<Vec<u8>>), CryptoError> {
        let rest = sealed
            .strip_prefix(FILE_MAGIC2)
            .ok_or(CryptoError::Corrupt("no marker"))?;
        let (block, content) = split(rest).ok_or(CryptoError::Corrupt("layout"))?;
        let name = self
            .layout_keys()
            .open_name(NameKind::File, block)
            .ok_or(CryptoError::Corrupt("name does not authenticate"))?;
        let plain = decrypt(&self.key, content, &bound_aad(AAD_FILE2, block))
            .ok_or(CryptoError::Corrupt("does not authenticate"))?;
        Ok((name, plain))
    }
}

/// True when `body` is the body of a page sealed together with its name.
pub fn is_named_text(body: &str) -> bool {
    body.trim_start().starts_with(PAGE_MAGIC2)
}

/// The real name of a sealed page from the start of its file (header and the first lines of the
/// body are enough). `None` when it is not a sealed page of this vault.
pub fn peek_page_name(keys: &LayoutKeys, text: &str) -> Option<String> {
    let start = text.find(PAGE_MAGIC2)? + PAGE_MAGIC2.len();
    let encoded: String = text[start..]
        .chars()
        .filter(|c| !c.is_whitespace())
        .take(2 + (2 + MAX_BLOCK).div_ceil(3) * 4)
        .collect();
    let usable = encoded.len() / 4 * 4;
    let data = base64_decode(&encoded[..usable])?;
    let (block, _) = split(&data)?;
    keys.open_name(NameKind::Page, block)
}

/// The real file name of a sealed file from its first bytes.
pub fn peek_file_name(keys: &LayoutKeys, start: &[u8]) -> Option<String> {
    let rest = start.strip_prefix(FILE_MAGIC2)?;
    let (block, _) = split(rest)?;
    keys.open_name(NameKind::File, block)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::{KdfParams, base64_encode};

    fn new_vault() -> Vault {
        Vault::create("ein langer geheimer Satz", KdfParams::MINIMUM)
            .unwrap()
            .0
    }

    #[test]
    fn tokens_are_stable_opaque_and_ignore_case() {
        let keys = new_vault().layout_keys();
        let token = keys.token(NameKind::Page, "Projekte");
        assert_eq!(token.len(), 26);
        assert!(
            token
                .bytes()
                .all(|b| b.is_ascii_lowercase() || (b'2'..=b'7').contains(&b))
        );
        assert_eq!(token, keys.token(NameKind::Page, "Projekte"));
        assert_eq!(token, keys.token(NameKind::Page, "PROJEKTE"));
        assert_eq!(
            token,
            keys.token(NameKind::Dir, "projekte"),
            "a page and its folder share a token"
        );
        assert_ne!(
            token,
            keys.token(NameKind::File, "Projekte"),
            "an attachment must not collide with a page"
        );
        assert_ne!(token, keys.token(NameKind::Page, "Projekt"));
        // Another vault: another tokens.
        assert_ne!(
            token,
            new_vault().layout_keys().token(NameKind::Page, "Projekte")
        );
    }

    #[test]
    fn a_name_block_opens_only_as_what_it_is() {
        let keys = new_vault().layout_keys();
        let block = keys.seal_name(NameKind::Page, "Garten ä").unwrap();
        assert_eq!(
            keys.open_name(NameKind::Page, &block).as_deref(),
            Some("Garten ä")
        );
        assert_eq!(keys.open_name(NameKind::File, &block), None);
        assert_eq!(keys.open_name(NameKind::Dir, &block), None);
        let mut damaged = block.clone();
        damaged[30] ^= 1;
        assert_eq!(keys.open_name(NameKind::Page, &damaged), None);
        assert!(keys.seal_name(NameKind::Page, "").is_err());
        assert!(
            keys.seal_name(NameKind::Page, &"x".repeat(MAX_NAME + 1))
                .is_err()
        );
        assert!(
            keys.seal_name(NameKind::Page, &"ä".repeat(MAX_NAME / 2))
                .is_ok()
                || MAX_NAME / 2 * 2 > MAX_NAME
        );
    }

    #[test]
    fn named_text_round_trips_and_a_swapped_name_block_is_refused() {
        let vault = new_vault();
        let a = vault.seal_named_text("Garten", "Text A\n").unwrap();
        let b = vault.seal_named_text("Haus", "Text B\n").unwrap();
        assert_eq!(
            vault.open_named_text(&a).unwrap(),
            ("Garten".to_owned(), "Text A\n".to_owned())
        );
        assert!(!a.contains("Garten") && !a.contains("Text"));
        // Name block of one file, content of the other: refused.
        let split_at = |sealed: &str| {
            let data =
                base64_decode(sealed.trim_start().strip_prefix(PAGE_MAGIC2).unwrap()).unwrap();
            let (block, content) = split(&data).unwrap();
            (block.to_vec(), content.to_vec())
        };
        let ((block_a, _), (_, content_b)) = (split_at(&a), split_at(&b));
        let mixed = format!(
            "{PAGE_MAGIC2}\n{}\n",
            base64_encode(&assemble(&block_a, &content_b))
        );
        assert!(vault.open_named_text(&mixed).is_err());
        assert!(vault.open_named_text("SWENC2\nAAAA\n").is_err());
        assert!(vault.open_named_text("SWENC1\nAAAA\n").is_err());
    }

    #[test]
    fn named_file_round_trips_and_peeks_without_the_content() {
        let vault = new_vault();
        let keys = vault.layout_keys();
        let content = vec![7_u8; 100_000];
        let sealed = vault.seal_named_file("bild.png", &content).unwrap();
        let (name, back) = vault.open_named_file(&sealed).unwrap();
        assert_eq!(
            (name.as_str(), back.as_slice()),
            ("bild.png", content.as_slice())
        );
        assert_eq!(
            peek_file_name(&keys, &sealed[..400]).as_deref(),
            Some("bild.png")
        );
        assert_eq!(
            peek_file_name(&new_vault().layout_keys(), &sealed[..400]),
            None
        );
        let mut damaged = sealed.clone();
        let last = damaged.len() - 1;
        damaged[last] ^= 1;
        assert!(vault.open_named_file(&damaged).is_err());
    }

    #[test]
    fn a_page_name_can_be_read_from_the_start_of_the_file() {
        let vault = new_vault();
        let keys = vault.layout_keys();
        let body = vault
            .seal_named_text("Zweite Seite", &"viel Text ".repeat(5000))
            .unwrap();
        let file = format!(
            "Content-Type: text/x-mumbin-page\nPage-Format: mumbin 1\nEncrypted: swenc2\n\n{body}"
        );
        assert_eq!(
            peek_page_name(&keys, &file[..1000]).as_deref(),
            Some("Zweite Seite")
        );
        assert_eq!(
            peek_page_name(&new_vault().layout_keys(), &file[..1000]),
            None
        );
        assert_eq!(
            peek_page_name(&keys, "Content-Type: text/x-mumbin-page\n\nnichts\n"),
            None
        );
    }
}
