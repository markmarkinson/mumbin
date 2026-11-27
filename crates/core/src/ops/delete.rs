//! Deleting pages and attachments.

use std::fs;
use std::io;
use std::path::Path;

use crate::notebook::{is_hidden, is_link, is_page_file};
use crate::{Notebook, NotebookError, PageName};

/// Removes the paths: to the system's recycle bin, or for good when `permanently` is set.
pub(super) fn discard(paths: &[&Path], permanently: bool) -> Result<(), NotebookError> {
    if permanently {
        for path in paths {
            if path.is_dir() {
                fs::remove_dir_all(path)?;
            } else {
                fs::remove_file(path)?;
            }
        }
    } else {
        trash::delete_all(paths).map_err(|error| io::Error::other(error.to_string()))?;
    }
    Ok(())
}

/// Number of page files and of other files in `folder` and below.
fn count_files(folder: &Path, sealed: bool) -> (usize, usize) {
    let Ok(entries) = fs::read_dir(folder) else {
        return (0, 0);
    };
    let (mut pages, mut files) = (0, 0);
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if is_link(&metadata) {
            continue;
        }
        // The names of folders are not files of the person.
        if sealed && entry.file_name().to_str().is_none_or(is_hidden) {
            continue;
        }
        let path = entry.path();
        if metadata.is_dir() {
            let (inner_pages, inner_files) = count_files(&path, sealed);
            pages += inner_pages;
            files += inner_files;
        } else if is_page_file(&path) {
            pages += 1;
        } else {
            files += 1;
        }
    }
    (pages, files)
}

impl Notebook {
    /// Number of pages (the page itself and everything below it) and
    /// attachments that deleting `name` would remove.
    pub fn deletion_size(&self, name: &PageName) -> Result<(usize, usize), NotebookError> {
        self.layout_keys()?;
        let own_page = usize::from(self.page_file(name).exists());
        let (pages, files) = count_files(&self.page_folder(name), self.is_sealed());
        Ok((own_page + pages, files))
    }

    /// Deletes a page with its sub-pages and attachments. They go to the
    /// system's recycle bin unless `permanently` is set.
    pub fn delete_page(&self, name: &PageName, permanently: bool) -> Result<(), NotebookError> {
        if name.is_root() {
            return Err(NotebookError::RootHasNoPage);
        }
        self.layout_keys()?;
        let file = self.page_file(name);
        let folder = self.page_folder(name);
        let parents = self.guard_parent(&file, false)?;
        self.check_path(&file)?;
        self.check_path(&folder)?;
        if file.exists() && !is_page_file(&file) {
            return Err(NotebookError::NotAPage(file));
        }
        let existing: Vec<&Path> = [file.as_path(), folder.as_path()]
            .into_iter()
            .filter(|path| path.exists())
            .collect();
        if existing.is_empty() {
            return Ok(());
        }
        discard(&existing, permanently)?;
        drop(parents);
        self.remove_empty_folders(file.parent());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::*;

    #[test]
    fn deleting_removes_the_page_its_children_and_reports_the_size() {
        let (_dir, notebook) = notebook_with(&[
            ("A", "a"),
            ("A:Kind", "k"),
            ("A:Kind:Enkel", "e"),
            ("B", "b"),
        ]);
        fs::write(notebook.page_folder(&page("A")).join("datei.pdf"), b"x").unwrap();
        assert_eq!(notebook.deletion_size(&page("A")).unwrap(), (3, 1));
        notebook.delete_page(&page("A"), true).unwrap();
        assert_eq!(page_names(&notebook), ["B"]);
        assert!(!notebook.page_folder(&page("A")).exists());
        notebook.delete_page(&page("Fehlt"), true).unwrap();
    }
}
