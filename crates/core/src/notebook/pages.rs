//! Reading and saving single pages.

use std::fs;
use std::path::Path;

use super::files::{read_if_exists, write_atomically};
use super::sealed::check_token;
use super::{MAX_PAGE_BYTES, Notebook, NotebookError, PAGE_EXTENSION};
use crate::crypto::names::{NameKind, PAGE_HEADER_VALUE2, is_named_text};
use crate::crypto::{CryptoError, Keys, PAGE_HEADER_VALUE, PAGE_HEADER_VALUE3, PageKey, Vault};
use crate::pagefile::{PageFile, normalise_text};
use crate::pagename::PageName;

/// Fingerprint of a page file as it was last read or written. Used to notice
/// changes made by other programs before overwriting them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileStamp(String);

impl FileStamp {
    fn of(bytes: &[u8]) -> Self {
        // FNV-1a, 64 bit: stable across runs and cheap for note-sized files.
        let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
        FileStamp(format!("{:x}-{hash:016x}", bytes.len()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for FileStamp {
    fn from(text: &str) -> Self {
        FileStamp(text.to_owned())
    }
}

/// What the caller believes is on disk before saving.
#[derive(Debug, Clone, Copy)]
pub enum Expect<'a> {
    /// Overwrite whatever is there.
    Anything,
    /// The page file must not exist yet.
    Missing,
    /// The page file must still match this stamp.
    Stamp(&'a FileStamp),
}

impl Expect<'_> {
    fn is_met(self, current: Option<&FileStamp>) -> bool {
        match self {
            Expect::Anything => true,
            Expect::Missing => current.is_none(),
            Expect::Stamp(stamp) => current == Some(stamp),
        }
    }
}

/// A page read from disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoadedPage {
    pub name: PageName,
    /// Wiki text with `\n` line endings.
    pub body: String,
    pub creation_date: Option<String>,
    pub stamp: FileStamp,
    /// The file holds an encrypted page.
    pub encrypted: bool,
    /// The page has a password of its own; `locked` then depends on that password, not the vault.
    pub own_password: bool,
    /// Encrypted and no key to open it was given: `body` is empty, the text is not known.
    pub locked: bool,
}

/// What saving does about encryption.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SaveMode {
    /// An encrypted page stays encrypted, a plain one stays plain; a new page is
    /// encrypted when the notebook says `encrypt_new_pages=True`.
    Keep,
    /// Seals the page with the vault.
    Encrypt,
    /// Writes the page as plain text; one with a password of its own needs its key for that.
    Decrypt,
    /// Seals a plain page with the key of its own password that the keys hold for it. (Giving a
    /// page that has such a password another one is [`Notebook::change_page_password`].)
    Own,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SaveOutcome {
    /// The file was written.
    Saved(FileStamp),
    /// Content was identical; the file was left untouched.
    Unchanged(FileStamp),
    /// The page had no content, so no file exists for it now.
    Removed,
}

impl Notebook {
    /// Reads a page. `Ok(None)` means no page file exists (new or placeholder
    /// page).
    pub fn read_page(&self, name: &PageName) -> Result<Option<LoadedPage>, NotebookError> {
        self.read_page_with(name, None::<&Vault>)
    }

    /// Like [`Notebook::read_page`], and with keys an encrypted page is opened. An encrypted
    /// page that is not opened comes back `locked` with no text.
    pub fn read_page_with<'k>(
        &self,
        name: &PageName,
        keys: impl Into<Keys<'k>>,
    ) -> Result<Option<LoadedPage>, NotebookError> {
        let keys = keys.into();
        let Some((page, bytes)) = self.read_raw(name)? else {
            return Ok(None);
        };
        let encrypted = page.is_encrypted();
        let own_password = page.is_own_password();
        let (body, locked) = match (encrypted, own_password) {
            // Every page of a sealed notebook is sealed with its vault; a plain file or a page
            // with a password of its own there is not ours.
            (false, _) | (_, true) if self.is_sealed() => {
                return Err(NotebookError::NotAPage(self.page_file(name)));
            }
            (false, _) => (page.body.clone(), false),
            // A key made for another version of the page (its password changed elsewhere) is no key.
            (true, true) => match keys.page(name).filter(|key| key.matches(&page.body)) {
                Some(key) => (key.open_text(&page.body)?, false),
                None => (String::new(), true),
            },
            (true, false) => match keys.vault {
                Some(vault) => (
                    self.open_body(&self.page_file(name), &page.body, vault)?,
                    false,
                ),
                None => (String::new(), true),
            },
        };
        Ok(Some(LoadedPage {
            name: name.clone(),
            creation_date: page.creation_date().map(str::to_owned),
            body,
            stamp: FileStamp::of(&bytes),
            encrypted,
            own_password,
            locked,
        }))
    }

    /// The page file as it is on disk, with its bytes; `None` when the page has no file.
    pub(crate) fn read_raw(
        &self,
        name: &PageName,
    ) -> Result<Option<(PageFile, Vec<u8>)>, NotebookError> {
        if name.is_root() {
            return Err(NotebookError::RootHasNoPage);
        }
        self.layout_keys()?;
        let path = self.page_file(name);
        let _parents = self.guard_parent(&path, false)?;
        self.check_path(&path)?;
        let Some(bytes) = read_if_exists(&path, MAX_PAGE_BYTES)? else {
            return Ok(None);
        };
        Ok(Some((parse_page(&path, &bytes)?, bytes)))
    }

    /// Saves the wiki text of a page.
    ///
    /// Existing header lines are kept. A page without visible content is
    /// removed from disk together with folders that became empty. Fails with
    /// [`NotebookError::Conflict`] when the file no longer matches `expect`.
    pub fn save_page(
        &self,
        name: &PageName,
        body: &str,
        expect: Expect<'_>,
    ) -> Result<SaveOutcome, NotebookError> {
        self.save_page_with(name, body, expect, None::<&Vault>, SaveMode::Keep)
    }

    /// Saves a page, encrypting or decrypting it as `mode` says. An encrypted page is never
    /// written without its key: a locked page refuses (`Locked`) instead of overwriting sealed
    /// text, and a plain page is never written for a notebook that wants its new pages encrypted.
    pub fn save_page_with<'k>(
        &self,
        name: &PageName,
        body: &str,
        expect: Expect<'_>,
        keys: impl Into<Keys<'k>>,
        mode: SaveMode,
    ) -> Result<SaveOutcome, NotebookError> {
        self.save_page_proving(name, body, expect, keys.into(), mode, None)
    }

    /// [`Notebook::save_page_with`]; `proof` is the key a page with its own password has now, which
    /// [`SaveMode::Own`] needs to give such a page another one.
    pub(crate) fn save_page_proving(
        &self,
        name: &PageName,
        body: &str,
        expect: Expect<'_>,
        keys: Keys<'_>,
        mode: SaveMode,
        proof: Option<&PageKey>,
    ) -> Result<SaveOutcome, NotebookError> {
        if name.is_root() {
            return Err(NotebookError::RootHasNoPage);
        }
        let layout = self.layout_keys()?;
        let sealed = layout.is_some();
        if sealed && matches!(mode, SaveMode::Decrypt | SaveMode::Own) {
            return Err(NotebookError::invalid(
                "the pages of this notebook are always encrypted",
            ));
        }
        let path = self.page_file(name);
        let parents = self.guard_parent(&path, false)?;
        self.check_path(&path)?;
        let current = read_if_exists(&path, MAX_PAGE_BYTES)?;
        let current_stamp = current.as_deref().map(FileStamp::of);
        if !expect.is_met(current_stamp.as_ref()) {
            return Err(NotebookError::Conflict);
        }

        let mut page = match &current {
            Some(bytes) => parse_page(&path, bytes)?,
            None => PageFile::new("", chrono::Local::now()),
        };
        let was_encrypted = page.is_encrypted();
        let was_own = page.is_own_password();
        let target = self.save_target(name, &page, current.is_none(), keys, mode, proof)?;
        let vault = keys.vault;
        let uses_vault = matches!(target, Target::Vault) || (was_encrypted && !was_own);
        if uses_vault && vault.is_none() {
            return Err(NotebookError::Locked);
        }
        // What the page says now; not asked for when the page is sealed anew with another password.
        let current_text = match (was_own, was_encrypted, vault) {
            _ if mode == SaveMode::Own => None,
            (true, ..) => Some(own_key(keys, name, &page)?.open_text(&page.body)?),
            (false, true, Some(vault)) => Some(self.open_body(&path, &page.body, vault)?),
            _ => Some(page.body.clone()),
        };
        let body = normalise_text(body);
        let same_kind = match target {
            Target::Plain => !was_encrypted,
            Target::Vault => was_encrypted && !was_own,
            Target::Own(_) => was_own && mode != SaveMode::Own,
        };
        if current_text.as_deref() == Some(body.as_str())
            && same_kind
            && let Some(stamp) = current_stamp
        {
            return Ok(SaveOutcome::Unchanged(stamp));
        }

        if body.trim().is_empty() {
            if current.is_some() {
                fs::remove_file(&path)?;
                drop(parents);
                self.remove_empty_folders(path.parent());
            }
            return Ok(SaveOutcome::Removed);
        }
        page.set_encryption_marker(match (sealed, target) {
            (true, _) => Some(PAGE_HEADER_VALUE2),
            (false, Target::Vault) => Some(PAGE_HEADER_VALUE),
            (false, Target::Own(_)) => Some(PAGE_HEADER_VALUE3),
            (false, Target::Plain) => None,
        });
        page.body = match (target, vault) {
            (Target::Own(key), _) => key.seal_text(&body)?,
            (Target::Vault, Some(vault)) if sealed => {
                vault.seal_named_text(name.basename(), &body)?
            }
            (Target::Vault, Some(vault)) => vault.seal_text(&body)?,
            _ => body,
        };

        let bytes = page.serialise(self.end_of_line()).into_bytes();
        if bytes.len() as u64 > MAX_PAGE_BYTES {
            return Err(NotebookError::TooLarge(path));
        }
        let stamp = FileStamp::of(&bytes);
        if current.as_deref() == Some(bytes.as_slice()) {
            return Ok(SaveOutcome::Unchanged(stamp));
        }
        let _created_parents = self.guard_parent(&path, true)?;
        self.check_path(&path)?;
        if let Some(layout) = &layout {
            self.write_dir_names(layout, name, false)?;
        }
        write_atomically(&path, &bytes)?;
        Ok(SaveOutcome::Saved(stamp))
    }

    /// How a save writes the page, and whether the keys allow it.
    fn save_target<'k>(
        &self,
        name: &PageName,
        page: &PageFile,
        is_new: bool,
        keys: Keys<'k>,
        mode: SaveMode,
        proof: Option<&PageKey>,
    ) -> Result<Target<'k>, NotebookError> {
        let (was_encrypted, was_own) = (page.is_encrypted(), page.is_own_password());
        Ok(match mode {
            _ if self.is_sealed() => Target::Vault,
            SaveMode::Own if was_encrypted && !was_own => {
                return Err(NotebookError::invalid(
                    "the page is encrypted with the vault: decrypt it first",
                ));
            }
            SaveMode::Own => {
                if was_own && !proof.is_some_and(|old| old.matches(&page.body)) {
                    return Err(NotebookError::Locked);
                }
                Target::Own(keys.page(name).ok_or(NotebookError::Locked)?)
            }
            SaveMode::Encrypt if was_own => {
                return Err(NotebookError::invalid("the page has a password of its own"));
            }
            SaveMode::Encrypt => Target::Vault,
            SaveMode::Decrypt if was_own => {
                own_key(keys, name, page)?;
                Target::Plain
            }
            SaveMode::Decrypt => Target::Plain,
            SaveMode::Keep if was_own => Target::Own(own_key(keys, name, page)?),
            SaveMode::Keep => {
                if was_encrypted || (is_new && self.property("encrypt_new_pages") == Some("True")) {
                    Target::Vault
                } else {
                    Target::Plain
                }
            }
        })
    }

    /// The text of a sealed page body. In a sealed notebook the real name inside must be the
    /// one the file name is the token of, so a file renamed or copied by hand is not accepted.
    pub(crate) fn open_body(
        &self,
        path: &Path,
        body: &str,
        vault: &Vault,
    ) -> Result<String, NotebookError> {
        match (self.layout_keys()?, is_named_text(body)) {
            (Some(keys), true) => {
                let (name, text) = vault.open_named_text(body)?;
                check_token(&keys, NameKind::Page, path, PAGE_EXTENSION, &name)?;
                Ok(text)
            }
            (None, false) => Ok(vault.open_text(body)?),
            _ => Err(CryptoError::Corrupt("not the layout of this notebook").into()),
        }
    }
}

/// How a page is written.
#[derive(Clone, Copy)]
enum Target<'k> {
    Plain,
    Vault,
    Own(&'k PageKey),
}

/// The key of a page with its own password, when it is the one the file was made with.
fn own_key<'k>(
    keys: Keys<'k>,
    name: &PageName,
    page: &PageFile,
) -> Result<&'k PageKey, NotebookError> {
    keys.page(name)
        .filter(|key| key.matches(&page.body))
        .ok_or(NotebookError::Locked)
}

pub(super) fn parse_page(path: &Path, bytes: &[u8]) -> Result<PageFile, NotebookError> {
    let text = std::str::from_utf8(bytes).map_err(|_| NotebookError::NotText(path.to_owned()))?;
    PageFile::parse(text).ok_or_else(|| NotebookError::NotAPage(path.to_owned()))
}
