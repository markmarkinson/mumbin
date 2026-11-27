//! The files next to a page: listing, renaming and deleting them.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use super::delete::discard;
use super::file_links::is_image;
use super::store::{MAX_CONTENT, name_taken, safe_file_name, sealed_file_limit};
use crate::crypto::FILE_OVERHEAD;
use crate::crypto::names::{LayoutKeys, NameKind, named_file_overhead};
use crate::crypto::{Keys, Vault};
use crate::notebook::{
    LoadedPage, PAGE_EXTENSION, SEALED_SUFFIX, SaveMode, is_hidden, is_link, is_page_file,
    read_bounded, read_dir_if_exists, sealed_variant, write_atomically, write_new_atomically,
};
use crate::pagename::{name_key, sort_key};
use crate::{Expect, Notebook, NotebookError, PageName};

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub name: String,
    pub size: u64,
    /// Seconds since 1970, zero when unknown.
    pub modified: u64,
    pub is_image: bool,
    /// Stored sealed (`<name>.swenc`); `name` is the plain name.
    pub encrypted: bool,
}

/// Outcome of renaming an attachment.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRename {
    /// The name the file has now (it may differ from the wish: Windows-unsafe characters are replaced).
    pub name: String,
    /// Links and pictures on the page that were changed to the new name.
    pub links_updated: usize,
}

/// A file of a page folder in a notebook with plain names that counts as an attachment.
pub(super) struct PlainFile {
    /// The name on disk.
    pub file_name: String,
    /// The name the person sees: without the sealed suffix.
    pub name: String,
    pub path: PathBuf,
    pub metadata: fs::Metadata,
    /// The file is stored sealed (`<name>.swenc`).
    pub sealed: bool,
}

/// `name` without `suffix`, compared without case.
fn strip_suffix_ignore_case<'a>(name: &'a str, suffix: &str) -> Option<&'a str> {
    let split = name.len().checked_sub(suffix.len())?;
    (name.is_char_boundary(split) && name[split..].eq_ignore_ascii_case(suffix))
        .then(|| &name[..split])
}

/// The notebook file is no attachment and no name for one.
fn is_notebook_file(name: &str) -> bool {
    strip_suffix_ignore_case(name, ".mumbin").is_some()
}

/// What a directory entry in a page folder of a plain notebook is, when it is an attachment.
pub(super) fn plain_attachment(entry: &fs::DirEntry) -> Option<PlainFile> {
    let metadata = entry.metadata().ok()?;
    if is_link(&metadata) || !metadata.is_file() {
        return None;
    }
    let file_name = entry.file_name().into_string().ok()?;
    let path = entry.path();
    if is_hidden(&file_name)
        || is_notebook_file(&file_name)
        || (strip_suffix_ignore_case(&file_name, PAGE_EXTENSION).is_some() && is_page_file(&path))
    {
        return None;
    }
    let (name, sealed) = match strip_suffix_ignore_case(&file_name, SEALED_SUFFIX) {
        Some(plain) => (plain.to_owned(), true),
        None => (file_name.clone(), false),
    };
    (!name.is_empty()).then_some(PlainFile {
        file_name,
        name,
        path,
        metadata,
        sealed,
    })
}

impl Notebook {
    /// Files in the page's folder that are not pages. The root lists the
    /// files directly in the notebook folder.
    pub fn attachments(&self, name: &PageName) -> Result<Vec<Attachment>, NotebookError> {
        let keys = self.layout_keys()?;
        let folder = self.page_folder(name);
        self.check_path(&folder)?;
        let Some(entries) = read_dir_if_exists(&folder)? else {
            return Ok(Vec::new());
        };
        let mut found: Vec<Attachment> = entries
            .flatten()
            .filter_map(|entry| match &keys {
                Some(keys) => self.sealed_attachment(keys, &entry),
                None => plain_attachment_listing(&entry),
            })
            .collect();
        found.sort_by_cached_key(|attachment| sort_key(&attachment.name));
        // A leftover plain file and its sealed twin share a name: show the plain one only.
        found.dedup_by(|later, kept| {
            if later.name != kept.name {
                return false;
            }
            if kept.encrypted && !later.encrypted {
                std::mem::swap(kept, later);
            }
            true
        });
        Ok(found)
    }

    /// An attachment of a sealed notebook: a sealed file whose name is the one its token says.
    /// Nothing else in the folder is shown.
    fn sealed_attachment(&self, keys: &LayoutKeys, entry: &fs::DirEntry) -> Option<Attachment> {
        let metadata = entry.metadata().ok()?;
        if is_link(&metadata) || !metadata.is_file() {
            return None;
        }
        let real = self.sealed_entry(
            keys,
            &entry.path(),
            false,
            metadata.len(),
            metadata.modified().ok(),
        )?;
        if real.kind != NameKind::File {
            return None;
        }
        let size = metadata
            .len()
            .saturating_sub(named_file_overhead(real.name.len()));
        Some(attachment_of(real.name, size, true, &metadata))
    }

    /// Looks `file` up among the page's attachments. Only a name from that
    /// list leads to a path, so no name can reach a file the list would not show.
    /// The flag tells whether the file on disk is the sealed variant.
    fn attachment_path(
        &self,
        page: &PageName,
        file: &str,
    ) -> Result<(PathBuf, bool), NotebookError> {
        let found = self
            .attachments(page)?
            .into_iter()
            .find(|attachment| attachment.name == file)
            .ok_or_else(|| NotebookError::not_found("no such attachment"))?;
        let plain = self.attachment_base(page, file);
        // The name is the plain one; the file on disk may be the sealed variant.
        Ok(if found.encrypted {
            (sealed_variant(&plain), true)
        } else {
            (plain, false)
        })
    }

    /// Removes an attachment: to the recycle bin, or for good when
    /// `permanently` is set. Links to it on the page are left as they are.
    pub fn delete_attachment(
        &self,
        page: &PageName,
        file: &str,
        permanently: bool,
    ) -> Result<(), NotebookError> {
        let (path, _) = self.attachment_path(page, file)?;
        discard(&[&path], permanently)?;
        self.remove_empty_folders(path.parent());
        Ok(())
    }

    /// Renames an attachment inside its folder and, when the page text
    /// refers to it as `./old`, makes those links and pictures follow.
    pub fn rename_attachment(
        &self,
        page: &PageName,
        file: &str,
        wanted: &str,
    ) -> Result<AttachmentRename, NotebookError> {
        self.rename_attachment_with(page, file, wanted, None::<&Vault>)
    }

    pub fn rename_attachment_with<'k>(
        &self,
        page: &PageName,
        file: &str,
        wanted: &str,
        keys: impl Into<Keys<'k>>,
    ) -> Result<AttachmentRename, NotebookError> {
        let keys = keys.into();
        let loaded = self.read_page_with(page, keys)?;
        if loaded.as_ref().is_some_and(|page| page.locked) {
            return Err(NotebookError::Locked);
        }
        let (old_path, sealed_file) = self.attachment_path(page, file)?;
        let _parents = self.guard_parent(&old_path, false)?;
        let name = usable_name(wanted)?;
        let mut report = AttachmentRename {
            name: name.clone(),
            links_updated: 0,
        };
        if name == file {
            return Ok(report);
        }
        self.rename_attachment_file(page, file, &name, (&old_path, sealed_file), keys.vault)?;
        if let Some(loaded) = loaded {
            report.links_updated = self.follow_rename(page, &loaded, file, &name, keys);
        }
        Ok(report)
    }

    /// Renames the file on disk.
    fn rename_attachment_file(
        &self,
        page: &PageName,
        file: &str,
        name: &str,
        (old_path, sealed_file): (&Path, bool),
        vault: Option<&Vault>,
    ) -> Result<(), NotebookError> {
        let new_base = self.attachment_base(page, name);
        let new_path = if sealed_file {
            sealed_variant(&new_base)
        } else {
            new_base.clone()
        };
        // A change of case only renames the same file; anything else must be free.
        if name_key(name) != name_key(file) && name_taken(&new_base) {
            return Err(NotebookError::AlreadyExists(new_path));
        }
        self.check_path(old_path)?;
        self.check_path(&new_path)?;
        if self.is_sealed() {
            // The real name is sealed inside the file: the file is written again under the new one.
            let vault = vault.ok_or(NotebookError::Locked)?;
            let bytes = read_bounded(old_path, sealed_file_limit(MAX_CONTENT, true))?;
            let (_, plain) = vault.open_named_file(&bytes)?;
            let sealed_again = vault.seal_named_file(name, &plain)?;
            if name_key(name) == name_key(file) {
                write_atomically(&new_path, &sealed_again)?;
            } else {
                write_new_atomically(&new_path, &sealed_again)?;
                fs::remove_file(old_path)?;
            }
            return Ok(());
        }
        fs::rename(old_path, &new_path)?;
        if is_page_file(&new_path) {
            // The new name would turn this file into a page.
            fs::rename(&new_path, old_path)?;
            return Err(NotebookError::invalid(
                "the new name would make the file a page",
            ));
        }
        Ok(())
    }

    /// Makes the links and pictures on the page that name `old` name `new`; returns how many were
    /// changed. The file is renamed already, so a page that changed meanwhile keeps its old links.
    fn follow_rename(
        &self,
        page: &PageName,
        loaded: &LoadedPage,
        old: &str,
        new: &str,
        keys: Keys<'_>,
    ) -> usize {
        let (text, count) = retarget_attachment_links(&loaded.body, old, new);
        if text == loaded.body {
            return 0;
        }
        let saved = self.save_page_with(
            page,
            &text,
            Expect::Stamp(&loaded.stamp),
            keys,
            SaveMode::Keep,
        );
        if saved.is_ok() { count } else { 0 }
    }
}

fn plain_attachment_listing(entry: &fs::DirEntry) -> Option<Attachment> {
    let file = plain_attachment(entry)?;
    let size = if file.sealed {
        file.metadata.len().saturating_sub(FILE_OVERHEAD)
    } else {
        file.metadata.len()
    };
    Some(attachment_of(file.name, size, file.sealed, &file.metadata))
}

fn attachment_of(name: String, size: u64, encrypted: bool, metadata: &fs::Metadata) -> Attachment {
    Attachment {
        encrypted,
        is_image: is_image(Path::new(&name)),
        size,
        modified: metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |duration| duration.as_secs()),
        name,
    }
}

/// The name a wish turns into, or an error when no file can have it.
fn usable_name(wanted: &str) -> Result<String, NotebookError> {
    safe_file_name(wanted.trim())
        .filter(|name| !name.contains(['/', '\\']) && !is_hidden(name) && !is_notebook_file(name))
        .ok_or_else(|| NotebookError::invalid("not a usable file name"))
}

/// Writes `./new` wherever `text` has a link or picture to `./old`; returns the new text and how
/// many places changed.
fn retarget_attachment_links(text: &str, old: &str, new: &str) -> (String, usize) {
    let (old_ref, new_ref) = (format!("./{old}"), format!("./{new}"));
    let mut text = text.to_owned();
    let mut count = 0;
    for (before, after) in [
        (format!("[[{old_ref}]]"), format!("[[{new_ref}]]")),
        (format!("[[{old_ref}|"), format!("[[{new_ref}|")),
        (format!("{{{{{old_ref}}}}}"), format!("{{{{{new_ref}}}}}")),
        (format!("{{{{{old_ref}?"), format!("{{{{{new_ref}?")),
        (format!("{{{{{old_ref}|"), format!("{{{{{new_ref}|")),
    ] {
        count += text.matches(&before).count();
        text = text.replace(&before, &after);
    }
    (text, count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::*;

    #[test]
    fn attachments_list_files_but_not_pages() {
        let (_dir, notebook) = notebook_with(&[("A", "a"), ("A:Kind", "k")]);
        let folder = notebook.page_folder(&page("A"));
        fs::write(folder.join("b.PNG"), b"12").unwrap();
        fs::write(folder.join("a.pdf"), b"1").unwrap();
        fs::write(folder.join("text.txt"), b"kein Seitenkopf").unwrap();
        fs::write(folder.join(".versteckt"), b"x").unwrap();
        let listed: Vec<(String, u64, bool)> = notebook
            .attachments(&page("A"))
            .unwrap()
            .into_iter()
            .map(|a| (a.name, a.size, a.is_image))
            .collect();
        assert_eq!(
            listed,
            [
                ("a.pdf".to_owned(), 1, false),
                ("b.PNG".to_owned(), 2, true),
                ("text.txt".to_owned(), 15, false)
            ]
        );
        assert!(notebook.attachments(&page("Fehlt")).unwrap().is_empty());
    }

    #[test]
    fn attachments_can_be_renamed_with_their_links_and_deleted() {
        let (_dir, notebook) = notebook_with(&[(
            "Plan",
            "Bild {{./foto.png?width=40}} und [[./foto.png|Foto]] und [[./foto.png]], anderes [[./anders.png]]",
        )]);
        let plan = page("Plan");
        notebook.attach_bytes(&plan, "foto.png", b"png").unwrap();
        notebook.attach_bytes(&plan, "anders.png", b"x").unwrap();

        let report = notebook
            .rename_attachment(&plan, "foto.png", "Urlaub 1.png")
            .unwrap();
        assert_eq!(
            (report.name.as_str(), report.links_updated),
            ("Urlaub 1.png", 3)
        );
        let text = body(&notebook, "Plan");
        assert!(
            text.contains("{{./Urlaub 1.png?width=40}}")
                && text.contains("[[./Urlaub 1.png|Foto]]"),
            "{text}"
        );
        assert!(text.contains("[[./anders.png]]"), "other links stay");
        let names: Vec<_> = notebook
            .attachments(&plan)
            .unwrap()
            .into_iter()
            .map(|a| a.name)
            .collect();
        assert_eq!(names, ["anders.png", "Urlaub 1.png"]);

        // Refusals: taken name, path tricks, hidden or page-like names, unknown files.
        assert!(matches!(
            notebook.rename_attachment(&plan, "anders.png", "Urlaub 1.png"),
            Err(NotebookError::AlreadyExists(_))
        ));
        for wanted in [
            "../aus.png",
            "a/b.png",
            "..\\aus.png",
            ".versteckt",
            "x.mumbin",
            "",
        ] {
            assert!(
                notebook
                    .rename_attachment(&plan, "anders.png", wanted)
                    .is_err(),
                "{wanted:?}"
            );
        }
        assert!(
            notebook
                .rename_attachment(&plan, "Plan.txt", "x.png")
                .is_err(),
            "a page is no attachment"
        );
        assert!(
            notebook
                .rename_attachment(&plan, "../notebook.mumbin", "x.png")
                .is_err()
        );
        // Case only, and a name Windows would change.
        assert_eq!(
            notebook
                .rename_attachment(&plan, "anders.png", "ANDERS.png")
                .unwrap()
                .name,
            "ANDERS.png"
        );
        assert_eq!(
            notebook
                .rename_attachment(&plan, "ANDERS.png", "con.png")
                .unwrap()
                .name,
            "_con.png"
        );

        notebook.delete_attachment(&plan, "_con.png", true).unwrap();
        assert!(notebook.delete_attachment(&plan, "_con.png", true).is_err());
        assert!(
            notebook
                .delete_attachment(&plan, "../Plan.txt", true)
                .is_err()
        );
        assert!(notebook.delete_attachment(&plan, "Plan.txt", true).is_err());
        assert!(
            notebook.page_file(&plan).exists(),
            "the page itself was not touched"
        );
        notebook
            .delete_attachment(&plan, "Urlaub 1.png", true)
            .unwrap();
        assert!(
            !notebook.page_folder(&plan).exists(),
            "an empty attachment folder goes away"
        );
    }
}
