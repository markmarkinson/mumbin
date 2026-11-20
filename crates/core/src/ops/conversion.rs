//! Sealing and opening a page together with the files next to it.

use std::fs;
use std::path::Path;

use super::attachments::{PlainFile, plain_attachment};
use super::store::{MAX_CONTENT, sealed_file_limit};
use crate::crypto::{FileSeal, Vault};
use crate::notebook::{
    SaveMode, read_bounded, read_dir_if_exists, sealed_variant, write_new_atomically,
};
use crate::{Expect, Notebook, NotebookError, PageName};

impl Notebook {
    /// Seals every plain attachment of the page (`seal`), or opens every sealed one, with the
    /// vault or the key of the page. A file that cannot be converted stays as it was and is
    /// named in the result.
    pub fn convert_attachments(
        &self,
        name: &PageName,
        key: &dyn FileSeal,
        seal: bool,
    ) -> Result<(usize, Vec<String>), NotebookError> {
        if self.is_sealed() {
            // Everything in a sealed notebook is sealed already, and stays so.
            return if seal {
                Ok((0, Vec::new()))
            } else {
                Err(NotebookError::invalid(
                    "the files of this notebook are always sealed",
                ))
            };
        }
        let folder = self.page_folder(name);
        let _parents = self.guard_parent(&folder.join(".conversion"), false)?;
        self.check_path(&folder)?;
        let Some(entries) = read_dir_if_exists(&folder)? else {
            return Ok((0, Vec::new()));
        };
        let (mut done, mut failed) = (0, Vec::new());
        for file in entries
            .flatten()
            .filter_map(|entry| plain_attachment(&entry))
        {
            if file.sealed == seal {
                continue; // already in the wanted state
            }
            let result = if seal {
                self.seal_in_place(&file.path, key)
            } else {
                self.open_in_place(&file, key)
            };
            match result {
                Ok(()) => done += 1,
                Err(_) => failed.push(file.file_name),
            }
        }
        Ok((done, failed))
    }

    /// Writes `<path>.swenc` and removes the plain file.
    fn seal_in_place(&self, path: &Path, key: &dyn FileSeal) -> Result<(), NotebookError> {
        let sealed = key.seal_file(&read_bounded(path, MAX_CONTENT)?)?;
        let target = sealed_variant(path);
        self.check_path(&target)?;
        write_new_atomically(&target, &sealed)?;
        fs::remove_file(path)?;
        Ok(())
    }

    /// Writes the plain file next to the sealed one and removes the sealed one; a plain file with
    /// that name is never replaced.
    fn open_in_place(&self, file: &PlainFile, key: &dyn FileSeal) -> Result<(), NotebookError> {
        let plain = file.path.with_file_name(&file.name);
        if fs::symlink_metadata(&plain).is_ok() {
            return Err(NotebookError::AlreadyExists(plain));
        }
        let sealed = read_bounded(&file.path, sealed_file_limit(MAX_CONTENT, false))?;
        let content = key.open_file(&sealed)?;
        self.check_path(&plain)?;
        write_new_atomically(&plain, &content)?;
        fs::remove_file(&file.path)?;
        Ok(())
    }

    /// Encrypts or decrypts a page together with the files next to it.
    pub fn set_page_encrypted(
        &self,
        name: &PageName,
        vault: &Vault,
        encrypt: bool,
    ) -> Result<(), NotebookError> {
        if self.is_sealed() {
            return if encrypt {
                Ok(())
            } else {
                Err(NotebookError::invalid(
                    "the pages of this notebook are always encrypted",
                ))
            };
        }
        let loaded = self
            .read_page_with(name, Some(vault))?
            .ok_or_else(|| NotebookError::not_found("page does not exist"))?;
        if loaded.own_password {
            return Err(NotebookError::invalid(
                "the page has a password of its own, not the vault",
            ));
        }
        let mode = if encrypt {
            SaveMode::Encrypt
        } else {
            SaveMode::Decrypt
        };
        self.save_page_with(
            name,
            &loaded.body,
            Expect::Stamp(&loaded.stamp),
            Some(vault),
            mode,
        )?;
        // The page is done first: if a file fails, the page is in its new state and the rest can be retried.
        let (_, failed) = self.convert_attachments(name, vault, encrypt)?;
        if let Some(first) = failed.into_iter().next() {
            return Err(
                std::io::Error::other(format!("could not convert the file {first}")).into(),
            );
        }
        Ok(())
    }
}
