//! Pages with a password of their own.
//!
//! Such a page needs no vault and no other page: it opens with its password alone. The body
//! of the page file (header `Encrypted: swenc3`) is the line `SWENC3` and the Base64 text of
//!
//! `version (1 byte) | memory KiB (u32 BE) | iterations (u32 BE) | lanes (1 byte) | salt (16)`
//! `| nonce (24) | ciphertext | tag (16)`.
//!
//! * `K` = Argon2id(NFC password, salt, parameters from the header).
//! * The text is sealed with `BLAKE2b(key = K, "mumbin/page-text-key/v1")`; the associated data
//!   are `SWENC3:page` and the header bytes, so changed parameters or salt never authenticate.
//! * Attachments are sealed with `BLAKE2b(key = K, "mumbin/page-file-key/v1")`: the bytes
//!   `SWENC3F\0`, a nonce of their own (24) and ciphertext plus tag, associated data
//!   `SWENC3:file`. The same password opens them, and nothing in them needs the page name.
//! * The page name is bound to nothing, so a page can be renamed and moved without its password.
//!
//! The derived keys live in memory only. [`PageKeys`] holds the ones of the pages a person has
//! opened; [`Keys`] is what the operations of a notebook are given to read and write with.

use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;

use zeroize::Zeroizing;

use super::names::derive;
use super::{
    CryptoError, KEY_LEN, KdfParams, NONCE_LEN, SALT_LEN, TAG_LEN, Vault, armour, base64_decode,
    decrypt, derive_key, encrypt, random,
};
use crate::pagename::PageName;

/// First line of the body of a page with its own password.
pub const PAGE_MAGIC3: &str = "SWENC3";
/// First bytes of a file sealed with the key of such a page.
pub const FILE_MAGIC3: &[u8] = b"SWENC3F\0";
/// Value of the page header `Encrypted` for such a page.
pub const PAGE_HEADER_VALUE3: &str = "swenc3";

const VERSION: u8 = 1;
const HEADER_LEN: usize = 1 + 4 + 4 + 1 + SALT_LEN;
const AAD_PAGE3: &[u8] = b"SWENC3:page";
const AAD_FILE3: &[u8] = b"SWENC3:file";
const LABEL_TEXT: &[u8] = b"mumbin/page-text-key/v1";
const LABEL_FILE: &[u8] = b"mumbin/page-file-key/v1";

/// How a key was made from the password: written in front of the sealed text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Seal {
    params: KdfParams,
    salt: [u8; SALT_LEN],
}

impl Seal {
    fn to_bytes(self) -> [u8; HEADER_LEN] {
        let mut out = [0_u8; HEADER_LEN];
        out[0] = VERSION;
        out[1..5].copy_from_slice(&self.params.memory_kib.to_be_bytes());
        out[5..9].copy_from_slice(&self.params.iterations.to_be_bytes());
        // The range check keeps the lane count far below 256.
        out[9] = u8::try_from(self.params.parallelism).unwrap_or(u8::MAX);
        out[10..].copy_from_slice(&self.salt);
        out
    }

    /// The header at the start of `data`, with the settings checked before any work is done.
    fn parse(data: &[u8]) -> Result<Seal, CryptoError> {
        let header: &[u8; HEADER_LEN] = data
            .get(..HEADER_LEN)
            .and_then(|bytes| bytes.try_into().ok())
            .ok_or(CryptoError::Corrupt("too short"))?;
        if header[0] != VERSION {
            return Err(CryptoError::Corrupt("unknown version"));
        }
        let word = |at: usize| {
            u32::from_be_bytes([header[at], header[at + 1], header[at + 2], header[at + 3]])
        };
        let params = KdfParams {
            memory_kib: word(1),
            iterations: word(5),
            parallelism: u32::from(header[9]),
        };
        params.check()?;
        let mut salt = [0_u8; SALT_LEN];
        salt.copy_from_slice(&header[10..]);
        Ok(Seal { params, salt })
    }
}

/// The data of a sealed page body: header, nonce, ciphertext and tag; sizes are checked.
fn payload(sealed: &str) -> Result<Vec<u8>, CryptoError> {
    let body = sealed
        .trim_start()
        .strip_prefix(PAGE_MAGIC3)
        .ok_or(CryptoError::Corrupt("no marker"))?;
    let data = base64_decode(body).ok_or(CryptoError::Corrupt("not base64"))?;
    if data.len() < HEADER_LEN + NONCE_LEN + TAG_LEN {
        return Err(CryptoError::Corrupt("too short"));
    }
    Ok(data)
}

/// The header of a sealed page body, read from the first few characters of it.
fn peek_seal(sealed: &str) -> Result<Seal, CryptoError> {
    let body = sealed
        .trim_start()
        .strip_prefix(PAGE_MAGIC3)
        .ok_or(CryptoError::Corrupt("no marker"))?;
    // 36 Base64 characters are 27 bytes, a little more than the header.
    let start: String = body
        .chars()
        .filter(|c| !c.is_whitespace())
        .take(36)
        .collect();
    let data = base64_decode(&start).ok_or(CryptoError::Corrupt("not base64"))?;
    Seal::parse(&data)
}

fn page_aad(header: &[u8]) -> Vec<u8> {
    [AAD_PAGE3, header].concat()
}

/// The keys of one page with its own password, and how they were made.
pub struct PageKey {
    text: Zeroizing<[u8; KEY_LEN]>,
    file: Zeroizing<[u8; KEY_LEN]>,
    seal: Seal,
}

impl fmt::Debug for PageKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("PageKey(unlocked)")
    }
}

impl PageKey {
    fn derive(password: &str, seal: Seal) -> Result<PageKey, CryptoError> {
        let master = derive_key(password, &seal.salt, seal.params)?;
        Ok(PageKey {
            text: derive(&master, LABEL_TEXT),
            file: derive(&master, LABEL_FILE),
            seal,
        })
    }

    /// A new key for `password`, with a fresh salt.
    pub fn create(password: &str, params: KdfParams) -> Result<PageKey, CryptoError> {
        let mut salt = [0_u8; SALT_LEN];
        random(&mut salt)?;
        PageKey::derive(password, Seal { params, salt })
    }

    /// Opens a sealed page body with its password: the key and the text. A password that does
    /// not fit is [`CryptoError::WrongPassphrase`]; a body that is not one, `Corrupt`.
    pub fn unlock(sealed: &str, password: &str) -> Result<(PageKey, String), CryptoError> {
        let data = payload(sealed)?;
        let key = PageKey::derive(password, Seal::parse(&data)?)?;
        match key.open_payload(&data) {
            Err(CryptoError::Corrupt("does not authenticate")) => Err(CryptoError::WrongPassphrase),
            other => other.map(|text| (key, text)),
        }
    }

    /// The sealed body is made with this key (same salt and settings), so it can be opened with it.
    /// Only the header is looked at, so this is cheap for a large page.
    pub fn matches(&self, sealed: &str) -> bool {
        peek_seal(sealed).is_ok_and(|seal| seal == self.seal)
    }

    fn open_payload(&self, data: &[u8]) -> Result<String, CryptoError> {
        let (header, sealed) = data.split_at(HEADER_LEN);
        let plain = decrypt(&self.text, sealed, &page_aad(header))
            .ok_or(CryptoError::Corrupt("does not authenticate"))?;
        String::from_utf8(plain.to_vec()).map_err(|_| CryptoError::Corrupt("not text"))
    }

    /// Opens a page body sealed with this key. Refuses anything that does not authenticate.
    pub fn open_text(&self, sealed: &str) -> Result<String, CryptoError> {
        let data = payload(sealed)?;
        if Seal::parse(&data)? != self.seal {
            return Err(CryptoError::Corrupt("made with another key"));
        }
        self.open_payload(&data)
    }

    /// Seals page text: the marker line, then header and data as Base64 lines.
    pub fn seal_text(&self, plaintext: &str) -> Result<String, CryptoError> {
        let header = self.seal.to_bytes();
        let sealed = encrypt(&self.text, plaintext.as_bytes(), &page_aad(&header))?;
        Ok(armour(PAGE_MAGIC3, &[header.as_slice(), &sealed].concat()))
    }
}

/// Something that seals and opens the files next to a page: the vault or the key of a page.
pub trait FileSeal {
    /// The bytes of a file, sealed.
    fn seal_file(&self, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError>;
    /// A sealed file opened; refuses anything that does not authenticate.
    fn open_file(&self, sealed: &[u8]) -> Result<Zeroizing<Vec<u8>>, CryptoError>;
}

impl FileSeal for Vault {
    fn seal_file(&self, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
        Vault::seal_file(self, plaintext)
    }

    fn open_file(&self, sealed: &[u8]) -> Result<Zeroizing<Vec<u8>>, CryptoError> {
        Vault::open_file(self, sealed)
    }
}

impl FileSeal for PageKey {
    fn seal_file(&self, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
        let sealed = encrypt(&self.file, plaintext, AAD_FILE3)?;
        Ok([FILE_MAGIC3, &sealed].concat())
    }

    fn open_file(&self, sealed: &[u8]) -> Result<Zeroizing<Vec<u8>>, CryptoError> {
        let data = sealed
            .strip_prefix(FILE_MAGIC3)
            .ok_or(CryptoError::Corrupt("no marker"))?;
        decrypt(&self.file, data, AAD_FILE3).ok_or(CryptoError::Corrupt("does not authenticate"))
    }
}

/// The keys of the pages with their own password that are open, by page name.
#[derive(Debug, Clone, Default)]
pub struct PageKeys(HashMap<String, (PageName, Arc<PageKey>)>);

impl PageKeys {
    pub fn get(&self, name: &PageName) -> Option<&Arc<PageKey>> {
        self.0.get(&name.key()).map(|(_, key)| key)
    }

    pub fn insert(&mut self, name: &PageName, key: Arc<PageKey>) {
        self.0.insert(name.key(), (name.clone(), key));
    }

    pub fn remove(&mut self, name: &PageName) {
        self.0.remove(&name.key());
    }

    /// Forgets the pages at and below `name` (the page was deleted).
    pub fn remove_within(&mut self, name: &PageName) {
        self.0.retain(|_, (page, _)| !page.is_within(name));
    }

    pub fn clear(&mut self) {
        self.0.clear();
    }

    /// The pages whose key is held, in no particular order.
    pub fn names(&self) -> impl Iterator<Item = &PageName> {
        self.0.values().map(|(name, _)| name)
    }

    /// The keys follow a page that was moved or renamed, with everything below it.
    pub fn relocate(&mut self, from: &PageName, to: &PageName) {
        let moved: Vec<_> = self
            .0
            .values()
            .filter(|(name, _)| name.is_within(from))
            .map(|(name, key)| (name.clone(), name.relocated(from, to), key.clone()))
            .collect();
        for (old, new, key) in moved {
            self.remove(&old);
            self.insert(&new, key);
        }
    }
}

/// What a read or a write may use to open encrypted pages: the notebook's vault and the keys of
/// the pages with a password of their own. Cheap to copy; owns nothing.
#[derive(Clone, Copy, Default)]
pub struct Keys<'a> {
    pub vault: Option<&'a Vault>,
    pub pages: Option<&'a PageKeys>,
}

impl<'a> Keys<'a> {
    pub fn new(vault: Option<&'a Vault>, pages: &'a PageKeys) -> Self {
        Keys {
            vault,
            pages: Some(pages),
        }
    }

    /// The key of the page with its own password, when it is open.
    pub fn page(&self, name: &PageName) -> Option<&'a PageKey> {
        self.pages?.get(name).map(|key| &**key)
    }
}

impl<'a> From<Option<&'a Vault>> for Keys<'a> {
    fn from(vault: Option<&'a Vault>) -> Self {
        Keys { vault, pages: None }
    }
}

impl<'a> From<&'a Vault> for Keys<'a> {
    fn from(vault: &'a Vault) -> Self {
        Some(vault).into()
    }
}

impl<'a> From<&'a PageKeys> for Keys<'a> {
    fn from(pages: &'a PageKeys) -> Self {
        Keys::new(None, pages)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FAST: KdfParams = KdfParams::MINIMUM;

    fn key(password: &str) -> PageKey {
        PageKey::create(password, FAST).unwrap()
    }

    fn name(text: &str) -> PageName {
        PageName::new(text).unwrap()
    }

    #[test]
    fn a_page_opens_with_its_password_only() {
        let key = key("erstes Passwort");
        let sealed = key.seal_text("Geheimer Text ä 🙂").unwrap();
        assert!(sealed.starts_with("SWENC3\n") && !sealed.contains("Geheimer"));
        let (again, text) = PageKey::unlock(&sealed, "erstes Passwort").unwrap();
        assert_eq!(text, "Geheimer Text ä 🙂");
        assert_eq!(again.open_text(&sealed).unwrap(), text);
        for wrong in ["erstes Passwor", "", "ERSTES PASSWORT"] {
            assert_eq!(
                PageKey::unlock(&sealed, wrong).unwrap_err(),
                CryptoError::WrongPassphrase,
                "{wrong:?}"
            );
        }
    }

    #[test]
    fn the_same_password_written_two_ways_is_the_same() {
        let sealed = key("Café-Passwort").seal_text("x").unwrap();
        assert!(PageKey::unlock(&sealed, "Cafe\u{301}-Passwort").is_ok());
    }

    #[test]
    fn two_pages_with_two_passwords_do_not_open_each_other() {
        let (first, second) = (key("eins eins eins"), key("zwei zwei zwei"));
        let (a, b) = (
            first.seal_text("A").unwrap(),
            second.seal_text("B").unwrap(),
        );
        assert!(PageKey::unlock(&a, "zwei zwei zwei").is_err());
        assert!(PageKey::unlock(&b, "eins eins eins").is_err());
        assert!(first.open_text(&b).is_err() && second.open_text(&a).is_err());
        // The same password on two pages still gives two salts and two keys.
        let twin = key("eins eins eins");
        assert!(!twin.matches(&a) && first.matches(&a));
        assert!(twin.open_text(&a).is_err());
        assert_eq!(PageKey::unlock(&a, "eins eins eins").unwrap().1, "A");
    }

    #[test]
    fn sealed_text_is_authenticated_and_never_repeats() {
        let key = key("pw pw pw pw");
        let first = key.seal_text("gleich").unwrap();
        assert_ne!(
            first,
            key.seal_text("gleich").unwrap(),
            "a fresh nonce each time"
        );
        let body: String = first.lines().skip(1).collect();
        let mut bytes = body.clone().into_bytes();
        // Header (salt, settings), nonce, ciphertext and tag: every changed place is refused.
        for position in [1, 8, 14, 30, 50, body.len() - 6] {
            let original = bytes[position];
            bytes[position] = if original == b'A' { b'B' } else { b'A' };
            let tampered = format!("SWENC3\n{}", String::from_utf8(bytes.clone()).unwrap());
            assert!(
                key.open_text(&tampered).is_err(),
                "a change at {position} was accepted"
            );
            assert!(
                PageKey::unlock(&tampered, "pw pw pw pw").is_err(),
                "{position}"
            );
            bytes[position] = original;
        }
        assert!(
            key.open_text(&format!("SWENC3\n{}", &body[..body.len() - 8]))
                .is_err()
        );
        for broken in ["SWENC3\n", "", "hallo", "SWENC1\nAAAA", "SWENC3\n!!!!"] {
            assert!(key.open_text(broken).is_err() && PageKey::unlock(broken, "pw").is_err());
        }
        assert_eq!(key.open_text(&first).unwrap(), "gleich");
    }

    #[test]
    fn a_hostile_header_cannot_ask_for_much_work() {
        let sealed = key("pw pw pw pw").seal_text("x").unwrap();
        let data = base64_decode(sealed.strip_prefix("SWENC3\n").unwrap()).unwrap();
        for (at, value) in [(0_usize, 2_u8), (1, 0xff), (5, 0xff), (9, 0), (9, 200)] {
            let mut forged = data.clone();
            forged[at] = value;
            let text = armour(PAGE_MAGIC3, &forged);
            let error = PageKey::unlock(&text, "pw pw pw pw").unwrap_err();
            assert!(
                matches!(error, CryptoError::BadParameters | CryptoError::Corrupt(_)),
                "{at}: {error:?}"
            );
        }
    }

    #[test]
    fn files_are_sealed_with_a_key_of_the_page() {
        let key = key("pw pw pw pw");
        let sealed = key.seal_file(b"bytes \x00\xff").unwrap();
        assert!(sealed.starts_with(FILE_MAGIC3));
        assert_eq!(
            key.open_file(&sealed).unwrap().as_slice(),
            b"bytes \x00\xff"
        );
        assert_ne!(
            sealed,
            key.seal_file(b"bytes \x00\xff").unwrap(),
            "per-file nonce"
        );
        // Opened with the password only, through the page.
        let page = key.seal_text("t").unwrap();
        let (again, _) = PageKey::unlock(&page, "pw pw pw pw").unwrap();
        assert_eq!(
            again.open_file(&sealed).unwrap().as_slice(),
            b"bytes \x00\xff"
        );
        // Another page's key, damage, and a page text posing as a file do not open.
        assert!(self::key("pw pw pw pw").open_file(&sealed).is_err());
        let mut damaged = sealed.clone();
        *damaged.last_mut().unwrap() ^= 1;
        assert!(key.open_file(&damaged).is_err());
        assert!(key.open_file(b"SWENC3F\0").is_err() && key.open_file(b"").is_err());
        let data = base64_decode(page.strip_prefix("SWENC3\n").unwrap()).unwrap();
        assert!(
            key.open_file(&[FILE_MAGIC3, &data[HEADER_LEN..]].concat())
                .is_err()
        );
        // The text key and the file key are different keys, and the vault's files are another format.
        let (vault, _) = Vault::create("pw pw pw pw", FAST).unwrap();
        assert!(key.open_file(&vault.seal_file(b"x").unwrap()).is_err());
        assert!(vault.open_file(&sealed).is_err());
    }

    #[test]
    fn page_keys_follow_a_move_and_forget_a_deletion() {
        let mut keys = PageKeys::default();
        for page in ["Alt", "Alt:Kind", "Anders"] {
            keys.insert(&name(page), Arc::new(key("pw pw pw pw")));
        }
        keys.relocate(&name("Alt"), &name("Neu:Alt"));
        let mut names: Vec<_> = keys.names().map(ToString::to_string).collect();
        names.sort();
        assert_eq!(names, ["Anders", "Neu:Alt", "Neu:Alt:Kind"]);
        assert!(
            keys.get(&name("NEU:alt")).is_some(),
            "names compare without case"
        );
        keys.remove_within(&name("Neu:Alt"));
        assert_eq!(keys.names().count(), 1);
        assert!(Keys::from(&keys).page(&name("Anders")).is_some());
        assert!(Keys::default().page(&name("Anders")).is_none());
        keys.clear();
        assert_eq!(keys.names().count(), 0);
    }

    #[test]
    fn a_debug_print_never_shows_the_key() {
        assert_eq!(format!("{:?}", key("pw pw pw pw")), "PageKey(unlocked)");
    }
}
