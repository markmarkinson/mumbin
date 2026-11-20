//! The sealed layout of a notebook (decision E-025): every page, folder and attachment has an
//! opaque name on disk and carries its real name sealed inside (see `crypto::names`).
//!
//! A sealed notebook is told by its vault file (`sealedNames`). While it is locked there are no
//! keys, so nothing can be listed, read or written (`Locked`); `unlock_vault` hands the keys to
//! the notebook, and every clone of the notebook sees them.

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::SystemTime;

use super::files::{read_bounded, read_prefix, write_atomically, write_new_atomically};
use super::pages::parse_page;
use super::{MAX_PAGE_BYTES, Notebook, NotebookError, PAGE_EXTENSION};
use crate::crypto::names::{DIR_NAME_FILE, LayoutKeys, NameKind, peek_file_name, peek_page_name};
use crate::crypto::{CryptoError, Vault};
use crate::pagename::PageName;

/// A name that no file can have: what the paths of a locked sealed notebook point to.
const LOCKED_PLACEHOLDER: &str = ".mumbin-locked";
/// Suffix of a sealed attachment.
pub(crate) const SEALED_SUFFIX: &str = ".swenc";

/// The place where a file with this (plain) name lies when it is sealed.
pub(crate) fn sealed_variant(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(SEALED_SUFFIX);
    path.with_file_name(name)
}

/// In a sealed notebook the real name inside a file must be the one its file name is the token
/// of (`suffix` is what follows the token), so a file renamed or copied by hand is not accepted.
pub(crate) fn check_token(
    keys: &LayoutKeys,
    kind: NameKind,
    path: &Path,
    suffix: &str,
    real_name: &str,
) -> Result<(), NotebookError> {
    let stem = path
        .file_name()
        .and_then(|file| file.to_str())
        .and_then(|file| file.strip_suffix(suffix));
    if stem == Some(keys.token(kind, real_name).as_str()) {
        Ok(())
    } else {
        Err(CryptoError::Corrupt("the name does not fit the file").into())
    }
}

/// A real name read from a file, with the size and time of the file it came from.
type KnownName = (u64, Option<SystemTime>, String);

#[derive(Debug, Default)]
pub(crate) struct Layout {
    sealed: AtomicBool,
    keys: RwLock<Option<Arc<LayoutKeys>>>,
    /// Real names read from files, so that listing a folder again does not open every file.
    names: Mutex<HashMap<PathBuf, KnownName>>,
}

impl Layout {
    pub(crate) fn new(sealed: bool) -> Arc<Layout> {
        Arc::new(Layout {
            sealed: AtomicBool::new(sealed),
            ..Layout::default()
        })
    }

    pub(crate) fn mark_sealed(&self) {
        self.sealed.store(true, Ordering::SeqCst);
    }

    pub(crate) fn keys(&self) -> Option<Arc<LayoutKeys>> {
        self.keys
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    fn set_keys(&self, keys: Option<Arc<LayoutKeys>>) {
        *self
            .keys
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = keys;
        self.known_names().clear();
    }

    fn known_names(&self) -> std::sync::MutexGuard<'_, HashMap<PathBuf, KnownName>> {
        self.names
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// The name read from `path` earlier, if the file still has that size and time.
    fn cached_name(&self, path: &Path, size: u64, modified: Option<SystemTime>) -> Option<String> {
        let names = self.known_names();
        let (known_size, known_time, name) = names.get(path)?;
        (*known_size == size && modified.is_some() && *known_time == modified).then(|| name.clone())
    }
}

/// One entry of a folder of a sealed notebook, with its real name.
pub(crate) struct SealedEntry {
    pub name: String,
    pub kind: NameKind,
}

impl Notebook {
    /// The notebook hides its file names (it was made with a passphrase from the start).
    pub fn is_sealed(&self) -> bool {
        self.layout.sealed.load(Ordering::SeqCst)
    }

    /// Sealed and not yet opened with the passphrase: nothing can be listed, read or written.
    pub fn is_locked(&self) -> bool {
        self.is_sealed() && self.layout.keys().is_none()
    }

    /// `Err(Locked)` for a locked sealed notebook; for an open one the keys, for a plain
    /// notebook `None`.
    pub(crate) fn layout_keys(&self) -> Result<Option<Arc<LayoutKeys>>, NotebookError> {
        if !self.is_sealed() {
            return Ok(None);
        }
        self.layout.keys().map(Some).ok_or(NotebookError::Locked)
    }

    /// Gives a sealed notebook the keys of its opened vault.
    pub fn attach_vault(&self, vault: &Vault) {
        if self.is_sealed() {
            self.layout.set_keys(Some(Arc::new(vault.layout_keys())));
        }
    }

    /// Takes the keys away: a sealed notebook is locked again.
    pub fn detach_vault(&self) {
        if self.is_sealed() {
            self.layout.set_keys(None);
        }
    }

    /// The opaque path of a folder of the notebook, given its real names from the top.
    pub(crate) fn sealed_folder<'a>(
        &self,
        keys: &LayoutKeys,
        parts: impl IntoIterator<Item = &'a str>,
    ) -> PathBuf {
        let mut path = self.folder.clone();
        for part in parts {
            path.push(keys.token(NameKind::Dir, part));
        }
        path
    }

    /// The opaque path of the file of a page.
    pub(crate) fn sealed_page_file(&self, keys: &LayoutKeys, name: &PageName) -> PathBuf {
        let Some(last) = name.parts().last() else {
            return self.folder.clone();
        };
        let mut path = self.sealed_folder(keys, name.parent().parts());
        path.push(format!(
            "{}{PAGE_EXTENSION}",
            keys.token(NameKind::Page, last)
        ));
        path
    }

    /// Where paths point to while the notebook is locked: nothing exists there.
    pub(crate) fn locked_path(&self) -> PathBuf {
        self.folder.join(LOCKED_PLACEHOLDER)
    }

    /// The opaque path of an attachment without its suffix: the path a plain attachment would
    /// have in an ordinary notebook, so that `sealed_variant` gives the file.
    pub(crate) fn sealed_attachment_base(
        &self,
        keys: &LayoutKeys,
        page: &PageName,
        file: &str,
    ) -> PathBuf {
        self.sealed_folder(keys, page.parts())
            .join(keys.token(NameKind::File, file))
    }

    /// The real name of an entry of a folder in a sealed notebook, when the entry is one of
    /// ours: its token must be the token of the name that is sealed inside it.
    pub(crate) fn sealed_entry(
        &self,
        keys: &LayoutKeys,
        path: &Path,
        is_dir: bool,
        size: u64,
        modified: Option<SystemTime>,
    ) -> Option<SealedEntry> {
        let file_name = path.file_name()?.to_str()?;
        if is_dir {
            let block = read_prefix(&path.join(DIR_NAME_FILE), 1024)?;
            let name = keys.open_name(NameKind::Dir, &block)?;
            return (keys.token(NameKind::Dir, &name) == file_name).then_some(SealedEntry {
                name,
                kind: NameKind::Dir,
            });
        }
        let (stem, kind) = match file_name.strip_suffix(PAGE_EXTENSION) {
            Some(stem) => (stem, NameKind::Page),
            None => (file_name.strip_suffix(SEALED_SUFFIX)?, NameKind::File),
        };
        let name = self.layout.cached_name(path, size, modified).or_else(|| {
            let start = read_prefix(path, 2048)?;
            let name = match kind {
                NameKind::Page => peek_page_name(keys, &String::from_utf8_lossy(&start))?,
                _ => peek_file_name(keys, &start)?,
            };
            self.layout
                .known_names()
                .insert(path.to_owned(), (size, modified, name.clone()));
            Some(name)
        })?;
        (keys.token(kind, &name) == stem).then_some(SealedEntry { name, kind })
    }

    /// Makes sure every folder on the way to a page (and, with `include_self`, the page's own
    /// folder) has its sealed name next to its contents, so a listing can tell what it is.
    pub(crate) fn write_dir_names(
        &self,
        keys: &LayoutKeys,
        name: &PageName,
        include_self: bool,
    ) -> Result<(), NotebookError> {
        let depth = name.parts().count();
        let count = if include_self {
            depth
        } else {
            depth.saturating_sub(1)
        };
        let mut folder = self.folder.clone();
        for part in name.parts().take(count) {
            folder.push(keys.token(NameKind::Dir, part));
            let file = folder.join(DIR_NAME_FILE);
            if fs::symlink_metadata(&file).is_ok() {
                continue;
            }
            self.check_path(&file)?;
            let block = keys.seal_name(NameKind::Dir, part)?;
            match write_new_atomically(&file, &block) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.into()),
            }
        }
        Ok(())
    }

    /// Rewrites the sealed name of one folder (after it was renamed).
    pub(crate) fn rewrite_dir_name(
        &self,
        keys: &LayoutKeys,
        folder: &Path,
        part: &str,
    ) -> Result<(), NotebookError> {
        let file = folder.join(DIR_NAME_FILE);
        self.check_path(&file)?;
        let block = keys.seal_name(NameKind::Dir, part)?;
        write_atomically(&file, &block)?;
        Ok(())
    }

    /// Where a relative file link written on `page` points to in a sealed notebook, with the real
    /// names translated: all but the last part are folders of pages, the last is a file.
    pub(crate) fn sealed_resolve(
        &self,
        keys: &LayoutKeys,
        page: &PageName,
        relative: &str,
    ) -> PathBuf {
        let mut stack: Vec<&str> = page.parts().collect();
        let mut last_is_file = false;
        for part in relative.split('/') {
            last_is_file = false;
            match part {
                "" | "." => {}
                ".." => {
                    stack.pop();
                }
                other => {
                    stack.push(other);
                    last_is_file = true;
                }
            }
        }
        let file = if last_is_file { stack.pop() } else { None };
        let folder = self.sealed_folder(keys, stack);
        match file {
            Some(file) => folder.join(keys.token(NameKind::File, file)),
            None => folder,
        }
    }

    /// Writes a page file again with another real name inside (after the page was renamed).
    pub(crate) fn reseal_page_name(
        &self,
        path: &Path,
        new_part: &str,
        vault: &Vault,
    ) -> Result<(), NotebookError> {
        let bytes = read_bounded(path, MAX_PAGE_BYTES)?;
        let mut page = parse_page(path, &bytes)?;
        let (_, text) = vault.open_named_text(&page.body)?;
        page.body = vault.seal_named_text(new_part, &text)?;
        write_atomically(path, page.serialise(self.end_of_line()).as_bytes())?;
        Ok(())
    }
}
