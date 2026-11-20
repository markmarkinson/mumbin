//! Where things lie on disk, and the checks that keep every access inside the notebook folder.

use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

use super::files::{is_link, linked_path_error, pin_directory};
use super::{Notebook, NotebookError, PAGE_EXTENSION};
use crate::crypto::names::{DIR_NAME_FILE, LayoutKeys};
use crate::pagename::PageName;

impl Notebook {
    /// Picks the sealed or the plain path. A locked sealed notebook has no keys, so its paths
    /// lead nowhere.
    fn locate(
        &self,
        sealed: impl FnOnce(&LayoutKeys) -> PathBuf,
        plain: impl FnOnce() -> PathBuf,
    ) -> PathBuf {
        if !self.is_sealed() {
            return plain();
        }
        match self.layout.keys() {
            Some(keys) => sealed(&keys),
            None => self.locked_path(),
        }
    }

    pub fn page_file(&self, name: &PageName) -> PathBuf {
        self.locate(
            |keys| self.sealed_page_file(keys, name),
            || self.folder.join(name.file_path(PAGE_EXTENSION)),
        )
    }

    /// Folder with the page's attachments and sub-pages.
    pub fn page_folder(&self, name: &PageName) -> PathBuf {
        self.locate(
            |keys| self.sealed_folder(keys, name.parts()),
            || self.folder.join(name.folder_path()),
        )
    }

    /// The path of an attachment before its sealed suffix: `<page folder>/<name>` in an
    /// ordinary notebook, the opaque path in a sealed one. `sealed_variant` of it is the file.
    pub fn attachment_base(&self, page: &PageName, file: &str) -> PathBuf {
        self.locate(
            |keys| self.sealed_attachment_base(keys, page, file),
            || self.page_folder(page).join(file),
        )
    }

    /// Rejects links at every existing component, including the final file.
    /// This guards static notebook links, not hostile concurrent path replacement.
    pub(crate) fn check_path(&self, path: &Path) -> Result<(), NotebookError> {
        let relative = path
            .strip_prefix(&self.folder)
            .map_err(|_| linked_path_error(path))?;
        let mut current = self.folder.clone();
        if is_link(&fs::symlink_metadata(&current)?) {
            return Err(linked_path_error(&current));
        }
        for part in relative.components() {
            current.push(part);
            match fs::symlink_metadata(&current) {
                Ok(metadata) if is_link(&metadata) => {
                    return Err(linked_path_error(&current));
                }
                Ok(_) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => break,
                Err(error) => return Err(error.into()),
            }
        }
        Ok(())
    }

    /// Pins each existing parent before proceeding to the next component.
    /// Creating missing parents one at a time prevents a concurrent junction
    /// from redirecting `create_dir_all` outside the notebook.
    pub(crate) fn guard_parent(
        &self,
        path: &Path,
        create: bool,
    ) -> Result<Vec<fs::File>, NotebookError> {
        let parent = path.parent().ok_or_else(|| linked_path_error(path))?;
        let relative = parent
            .strip_prefix(&self.folder)
            .map_err(|_| linked_path_error(path))?;
        let mut current = self.folder.clone();
        let mut guards = Vec::new();
        for component in relative.components() {
            if !matches!(component, Component::Normal(_)) {
                return Err(linked_path_error(path));
            }
            current.push(component);
            if create {
                match fs::create_dir(&current) {
                    Ok(()) => {}
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                    Err(error) => return Err(error.into()),
                }
            }
            match pin_directory(&current) {
                Ok(guard) => guards.push(guard),
                Err(NotebookError::Io(error))
                    if !create && error.kind() == io::ErrorKind::NotFound =>
                {
                    break;
                }
                Err(error) => return Err(error),
            }
        }
        Ok(guards)
    }

    /// Removes `start` and its ancestors while they are empty, never the
    /// notebook folder itself. Failures are harmless and ignored.
    pub(crate) fn remove_empty_folders(&self, start: Option<&Path>) {
        let mut folder = start;
        while let Some(path) = folder {
            if path == self.folder || !path.starts_with(&self.folder) {
                break;
            }
            if fs::remove_dir(path).is_err() && !self.remove_name_only_folder(path) {
                break;
            }
            folder = path.parent();
        }
    }

    /// In a sealed notebook a folder that holds nothing but its own name is empty too.
    fn remove_name_only_folder(&self, path: &Path) -> bool {
        if !self.is_sealed() || !holds_only_its_name(path) {
            return false;
        }
        let _ = fs::remove_file(path.join(DIR_NAME_FILE));
        fs::remove_dir(path).is_ok()
    }
}

/// True for the folders a sealed notebook keeps that hold nothing but their name.
fn holds_only_its_name(folder: &Path) -> bool {
    let Ok(entries) = fs::read_dir(folder) else {
        return false;
    };
    let mut found = false;
    for entry in entries.flatten() {
        if entry.file_name().to_str() != Some(DIR_NAME_FILE) {
            return false;
        }
        found = true;
    }
    found
}
