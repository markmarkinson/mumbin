//! Pages with a password of their own: protecting a page, opening it, changing the password and
//! taking the protection off, together with the files next to the page.
//!
//! The order of the steps keeps the page and its files readable if one of them fails. The salt
//! that the key depends on is only in the page, so the page is written before any file is sealed
//! with a new key, and a file is never left sealed once the page no longer carries its salt.
//!
//! A password change replaces several files. It is made safe against a crash or a locked file
//! like this: the new copies of the files are made first, next to the old ones, under hidden
//! names (`.<file>.rekey`). Writing the page with its new salt is the point of no return. After
//! it the copies are moved into place; a copy that could not be moved (or a crash) leaves it
//! where it is, and [`Notebook::finish_pending_rekey`] moves it the next time the page is opened
//! with its password. A copy that does not open with the key of the page belongs to a change that
//! never reached the point of no return, and is deleted.

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use super::attachments::plain_attachment;
use super::store::{MAX_CONTENT, sealed_file_limit};
use crate::crypto::{FileSeal, KdfParams, Keys, PageKey, PageKeys};
use crate::notebook::{SaveMode, read_bounded, read_dir_if_exists, write_atomically};
use crate::{Expect, Notebook, NotebookError, PageName};

/// A page that got a password of its own, or a new one.
#[derive(Debug)]
pub struct Protected {
    pub key: Arc<PageKey>,
    /// Files next to the page that could not be sealed; they stay as they were (plain). After a
    /// password change: files whose new copy waits to be moved into place (see the module text).
    pub failed: Vec<String>,
}

/// Hidden name of the new copy of a file while a password is changed.
const REKEY_SUFFIX: &str = ".rekey";

fn rekey_name(file_name: &str) -> String {
    format!(".{file_name}{REKEY_SUFFIX}")
}

/// The file a hidden new copy replaces, from the name of the copy.
fn rekey_target(copy_name: &str) -> Option<&str> {
    copy_name
        .strip_prefix('.')?
        .strip_suffix(REKEY_SUFFIX)
        .filter(|target| !target.is_empty())
}

fn keys_of(name: &PageName, key: &Arc<PageKey>) -> PageKeys {
    let mut pages = PageKeys::default();
    pages.insert(name, key.clone());
    pages
}

impl Notebook {
    /// A notebook that hides its file names has no pages of this kind.
    fn refuse_own_password(&self) -> Result<(), NotebookError> {
        if self.is_sealed() {
            return Err(NotebookError::invalid(
                "the pages of this notebook are protected by the vault",
            ));
        }
        Ok(())
    }

    /// The text of the page with its own password, still sealed.
    fn own_password_body(&self, name: &PageName) -> Result<String, NotebookError> {
        let (page, _) = self
            .read_raw(name)?
            .ok_or_else(|| NotebookError::not_found("page does not exist"))?;
        if !page.is_own_password() {
            return Err(NotebookError::invalid(
                "the page has no password of its own",
            ));
        }
        Ok(page.body)
    }

    /// Opens a page that has a password of its own: the key for it and its files. A wrong
    /// password is a [`crate::crypto::CryptoError::WrongPassphrase`].
    pub fn unlock_page(
        &self,
        name: &PageName,
        password: &str,
    ) -> Result<Arc<PageKey>, NotebookError> {
        let (key, _) = PageKey::unlock(&self.own_password_body(name)?, password)?;
        let key = Arc::new(key);
        // A change of the password that was interrupted is finished now; if that does not work
        // yet, it is tried again the next time.
        let _ = self.finish_pending_rekey(name, &*key);
        Ok(key)
    }

    /// Gives a plain page a password of its own; the files next to it are sealed with it. A page
    /// that is encrypted already is not changed. The page must have been saved. The page is
    /// protected once this returns, also when some file could not be sealed (it is named in the
    /// result): the key has to be kept, because the password cannot be recovered from the page.
    pub fn protect_page(
        &self,
        name: &PageName,
        password: &str,
        params: KdfParams,
    ) -> Result<Protected, NotebookError> {
        self.refuse_own_password()?;
        let loaded = self
            .read_page(name)?
            .ok_or_else(|| NotebookError::not_found("page does not exist"))?;
        if loaded.encrypted {
            return Err(NotebookError::invalid("the page is encrypted already"));
        }
        let key = Arc::new(PageKey::create(password, params)?);
        self.save_page_with(
            name,
            &loaded.body,
            Expect::Stamp(&loaded.stamp),
            &keys_of(name, &key),
            SaveMode::Own,
        )?;
        let (_, failed) = self.convert_attachments(name, &*key, true)?;
        Ok(Protected { key, failed })
    }

    /// Takes the password off a page: the page and its files are plain again. The password
    /// must be right. If a file cannot be opened, nothing changes for the page.
    pub fn unprotect_page(&self, name: &PageName, password: &str) -> Result<(), NotebookError> {
        let key = self.unlock_page(name, password)?;
        let pages = keys_of(name, &key);
        let loaded = self
            .read_page_with(name, &pages)?
            .ok_or_else(|| NotebookError::not_found("page does not exist"))?;
        // The files first: while the page still carries its salt, a file left behind can be retried.
        let (_, failed) = self.convert_attachments(name, &*key, false)?;
        Self::require_all_converted(failed)?;
        self.save_page_with(
            name,
            &loaded.body,
            Expect::Stamp(&loaded.stamp),
            &pages,
            SaveMode::Decrypt,
        )?;
        Ok(())
    }

    /// Changes the password of a page: the page gets a new salt and key and the sealed files
    /// are sealed again. The old password must be right. The new copies of the files are made
    /// before the page is written and moved into place after it, so a failure before that changes
    /// nothing, and a failure after it is finished later (see the module text): `failed` names the
    /// files that still wait.
    pub fn change_page_password(
        &self,
        name: &PageName,
        old_password: &str,
        new_password: &str,
        params: KdfParams,
    ) -> Result<Protected, NotebookError> {
        let old = self.unlock_page(name, old_password)?;
        let loaded = self
            .read_page_with(name, &keys_of(name, &old))?
            .ok_or_else(|| NotebookError::not_found("page does not exist"))?;
        let new = Arc::new(PageKey::create(new_password, params)?);
        let staged = self.stage_resealed_files(name, &*old, &*new)?;
        let saved = self.save_page_proving(
            name,
            &loaded.body,
            Expect::Stamp(&loaded.stamp),
            Keys::from(&keys_of(name, &new)),
            SaveMode::Own,
            Some(&*old),
        );
        if let Err(error) = saved {
            discard_staged(&staged);
            return Err(error);
        }
        // Past the point of no return: a copy that cannot be moved stays for later.
        let failed = staged
            .iter()
            .filter(|(copy, target)| fs::rename(copy, target).is_err())
            .map(|(_, target)| file_name_of(target))
            .collect();
        Ok(Protected { key: new, failed })
    }

    /// Moves the new copies that an interrupted (or partly failed) password change left next to
    /// the page into place. `key` is the key the page has now. Copies that do not open with it
    /// belong to a change that never took effect and are deleted. Returns the names of the files
    /// whose copy could not be moved yet.
    pub fn finish_pending_rekey(
        &self,
        name: &PageName,
        key: &dyn FileSeal,
    ) -> Result<Vec<String>, NotebookError> {
        let folder = self.page_folder(name);
        let _parents = self.guard_parent(&folder.join(".conversion"), false)?;
        self.check_path(&folder)?;
        let Some(entries) = read_dir_if_exists(&folder)? else {
            return Ok(Vec::new());
        };
        let mut waiting = Vec::new();
        for entry in entries.flatten() {
            let copy_name = entry.file_name().to_string_lossy().into_owned();
            let Some(target_name) = rekey_target(&copy_name) else {
                continue;
            };
            let copy = entry.path();
            let target = copy.with_file_name(target_name);
            self.check_path(&copy)?;
            self.check_path(&target)?;
            match read_bounded(&copy, sealed_file_limit(MAX_CONTENT, false)) {
                // The copy could not be read now: leave it for the next time.
                Err(_) => waiting.push(target_name.to_owned()),
                Ok(bytes) if key.open_file(&bytes).is_ok() => {
                    if fs::rename(&copy, &target).is_err() {
                        waiting.push(target_name.to_owned());
                    }
                }
                Ok(_) => {
                    let _ = fs::remove_file(&copy);
                }
            }
        }
        Ok(waiting)
    }

    fn require_all_converted(failed: Vec<String>) -> Result<(), NotebookError> {
        match failed.into_iter().next() {
            None => Ok(()),
            Some(first) => {
                Err(std::io::Error::other(format!("could not convert the file {first}")).into())
            }
        }
    }

    /// Seals every sealed file of the page again, into a hidden file next to it. Returns the
    /// pairs (new file, file it replaces); when one cannot be made, all new files are removed.
    fn stage_resealed_files(
        &self,
        name: &PageName,
        old: &dyn FileSeal,
        new: &dyn FileSeal,
    ) -> Result<Vec<(PathBuf, PathBuf)>, NotebookError> {
        let folder = self.page_folder(name);
        let _parents = self.guard_parent(&folder.join(".conversion"), false)?;
        self.check_path(&folder)?;
        let Some(entries) = read_dir_if_exists(&folder)? else {
            return Ok(Vec::new());
        };
        let mut staged = Vec::new();
        let result = entries
            .flatten()
            .filter_map(|entry| plain_attachment(&entry))
            .filter(|file| file.sealed)
            .try_for_each(|file| {
                let bytes = read_bounded(&file.path, sealed_file_limit(MAX_CONTENT, false))?;
                let sealed = new.seal_file(&old.open_file(&bytes)?)?;
                let hidden = file.path.with_file_name(rekey_name(&file.file_name));
                self.check_path(&hidden)?;
                write_atomically(&hidden, &sealed)?;
                staged.push((hidden, file.path));
                Ok::<(), NotebookError>(())
            });
        if let Err(error) = result {
            discard_staged(&staged);
            return Err(error);
        }
        Ok(staged)
    }
}

fn discard_staged(staged: &[(PathBuf, PathBuf)]) {
    for (hidden, _) in staged {
        let _ = fs::remove_file(hidden);
    }
}

fn file_name_of(path: &std::path::Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}
