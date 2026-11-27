//! File links and pictures on a page: where they point to, how a dropped file is written as one,
//! and how a picture is loaded.

use std::fs;
use std::path::{Path, PathBuf};

use super::policy::normalise;
use crate::crypto::{Keys, Vault};
use crate::notebook::{guard_absolute_parents, open_regular, read_bounded};
use crate::{Notebook, NotebookError, PageName};

/// File extensions shown as pictures in the editor.
const IMAGE_EXTENSIONS: [&str; 9] = [
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif",
];

/// Pictures are loaded without a click: at most 32 MiB.
const MAX_PICTURE_BYTES: u64 = 32 * 1024 * 1024;

/// True when the file name ends in a picture extension.
pub fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            IMAGE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        })
}

/// What dropping one file or folder onto a page produced.
#[derive(Debug, PartialEq, Eq)]
pub struct Referenced {
    /// Wiki text to put into the page; `None` when no valid link can be written.
    pub text: Option<String>,
    /// Name of the copy in the page's attachment folder, when one was made.
    pub copied: Option<String>,
}

/// Text that refers to a file in the page's attachment folder: a picture for
/// image files, a link for everything else. `None` when the name contains
/// characters the link syntax cannot carry.
fn attachment_text(name: &str, image: bool) -> Option<String> {
    if name.contains(['|', ']', '}', '\n', '\r']) {
        return None;
    }
    Some(if image {
        format!("{{{{./{name}}}}}")
    } else {
        format!("[[./{name}]]")
    })
}

fn percent_decode(text: &str) -> String {
    let hex = |byte: u8| match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    };
    let bytes = text.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%'
            && index + 2 < bytes.len()
            && let (Some(high), Some(low)) = (hex(bytes[index + 1]), hex(bytes[index + 2]))
        {
            output.push(high * 16 + low);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8_lossy(&output).into_owned()
}

/// `C:` at the start: a drive letter.
fn has_drive_letter(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

/// The path a `file:` address (without the `file:` part) stands for.
fn file_url_path(rest: &str) -> PathBuf {
    let path = percent_decode(rest.trim_start_matches('/'));
    normalise(Path::new(&if has_drive_letter(&path) {
        path
    } else {
        format!("/{path}")
    }))
}

fn slashes(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// `file:` address of an existing path. `%` is escaped because file addresses
/// are decoded when they are followed.
fn file_url(real: &Path) -> String {
    let text = real.to_string_lossy().into_owned();
    if let Some(unc) = text.strip_prefix(r"\\?\UNC\") {
        return format!("file://{}", unc.replace('\\', "/").replace('%', "%25"));
    }
    let plain = text.strip_prefix(r"\\?\").unwrap_or(&text);
    let plain = plain.replace('\\', "/").replace('%', "%25");
    if plain.starts_with('/') {
        format!("file://{plain}")
    } else {
        format!("file:///{plain}")
    }
}

impl Notebook {
    /// Where a file link or image source written on `page` points to. The
    /// result is not checked for existence and may lie outside the notebook.
    pub fn resolve_file(&self, page: &PageName, target: &str) -> Option<PathBuf> {
        let target = target.trim();
        if target.is_empty() {
            return None;
        }
        if target
            .get(..5)
            .is_some_and(|scheme| scheme.eq_ignore_ascii_case("file:"))
        {
            return Some(file_url_path(&target[5..]));
        }
        let unified = target.replace('\\', "/");
        if let Some(rest) = unified.strip_prefix("~/") {
            let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
            return Some(normalise(&PathBuf::from(home).join(rest)));
        }
        if unified.starts_with("//") {
            return Some(PathBuf::from(target.replace('/', "\\")));
        }
        if has_drive_letter(&unified) && unified.as_bytes().get(2) == Some(&b'/') {
            return Some(normalise(Path::new(&unified)));
        }
        if let Some(rest) = unified.strip_prefix('/') {
            return self.document_root().map(|root| normalise(&root.join(rest)));
        }
        if self.is_sealed() {
            return Some(match self.layout_keys().ok().flatten() {
                Some(keys) => self.sealed_resolve(&keys, page, &unified),
                None => self.locked_path(),
            });
        }
        Some(normalise(&self.page_folder(page).join(unified)))
    }

    /// Link target for an existing file or folder, written the way a person
    /// would: `./name` inside the page's own folder, a `../` path elsewhere in
    /// the notebook, otherwise a `file:` address. `None` when the path cannot
    /// be written inside `[[ ]]`.
    fn file_link_target(&self, page: &PageName, path: &Path) -> Option<String> {
        let real = fs::canonicalize(path).ok()?;
        let notebook = fs::canonicalize(self.folder()).ok()?;
        if self.is_sealed() && real.starts_with(&notebook) {
            // Files inside a sealed notebook have opaque names: nothing a link could say.
            return None;
        }
        let page_folder = notebook.join(page.folder_path());
        let target = if let Ok(rest) = real.strip_prefix(&page_folder) {
            format!("./{}", slashes(rest))
        } else if real.starts_with(&notebook) {
            let mut up = String::new();
            let mut base = page_folder;
            while !real.starts_with(&base) {
                base = base.parent()?.to_path_buf();
                up.push_str("../");
            }
            format!("{up}{}", slashes(real.strip_prefix(&base).ok()?))
        } else {
            file_url(&real)
        };
        (!target.contains(['|', ']', '\n', '\r'])).then_some(target)
    }

    /// Brings a dropped file or folder into a page. Files are copied into the
    /// page's attachment folder unless `link_only` is set or they already lie
    /// there; folders can only be linked. A sealed notebook needs the vault to store the copy.
    pub fn reference_file_with(
        &self,
        page: &PageName,
        path: &Path,
        link_only: bool,
        vault: Option<&Vault>,
    ) -> Result<Referenced, NotebookError> {
        let real = fs::canonicalize(path)?;
        let link = || Referenced {
            text: self
                .file_link_target(page, &real)
                .map(|target| format!("[[{target}]]")),
            copied: None,
        };
        if real.is_dir() {
            if !link_only {
                return Err(NotebookError::invalid(
                    "a folder cannot be copied, only linked",
                ));
            }
            return Ok(link());
        }
        if !real.is_file() {
            return Err(NotebookError::invalid("not a file"));
        }
        if link_only {
            return Ok(link());
        }
        let already_there = fs::canonicalize(self.page_folder(page))
            .is_ok_and(|folder| real.parent() == Some(folder.as_path()));
        if already_there {
            let name = real
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default();
            return Ok(Referenced {
                text: attachment_text(name, is_image(&real)),
                copied: None,
            });
        }
        let name = if self.is_sealed() {
            self.attach_file_sealed(page, &real, vault.ok_or(NotebookError::Locked)?)?
        } else {
            self.attach_file(page, &real)?
        };
        Ok(Referenced {
            text: attachment_text(&name, is_image(Path::new(&name))),
            copied: Some(name),
        })
    }

    /// Loads a picture of a page: only notebook files or a configured document root, without
    /// links, and at most 32 MiB.
    pub fn read_picture<'k>(
        &self,
        page: &PageName,
        source: &str,
        keys: impl Into<Keys<'k>>,
    ) -> Result<Vec<u8>, NotebookError> {
        let unavailable = || NotebookError::not_found("picture not available");
        let path = self.resolve_file(page, source).ok_or_else(unavailable)?;
        // In a sealed notebook the file has an opaque name: the picture is told by the link.
        let looks_like_picture =
            is_image(&path) || (self.is_sealed() && is_image(Path::new(source.trim())));
        if self.is_foreign_remote(&path) || !looks_like_picture {
            return Err(unavailable());
        }
        if path.starts_with(self.folder()) {
            return self.read_attachment_limited(&path, keys.into(), MAX_PICTURE_BYTES);
        }
        let root = self.document_root().ok_or_else(unavailable)?;
        let _root_guards = guard_absolute_parents(&root.join(".picture-root"))?;
        let _source_guards = guard_absolute_parents(&path)?;
        let _file = open_regular(&path)?;
        if !fs::canonicalize(&path)?.starts_with(fs::canonicalize(&root)?) {
            return Err(unavailable());
        }
        read_bounded(&path, MAX_PICTURE_BYTES)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::*;

    #[test]
    fn file_links_are_written_short_and_resolve_back() {
        let (_dir, notebook) = notebook_with(&[("Projekt:Plan", "x"), ("Projekt:Notiz", "y")]);
        let plan = page("Projekt:Plan");
        let inside = notebook.page_folder(&plan).join("skizze.png");
        fs::create_dir_all(inside.parent().unwrap()).unwrap();
        fs::write(&inside, b"x").unwrap();
        let sibling = notebook
            .page_folder(&page("Projekt:Notiz"))
            .join("liste.pdf");
        fs::create_dir_all(sibling.parent().unwrap()).unwrap();
        fs::write(&sibling, b"x").unwrap();
        let outside_dir = tempfile::tempdir().unwrap();
        let outside = outside_dir.path().join("Rechnung 100%.pdf");
        fs::write(&outside, b"x").unwrap();

        assert_eq!(
            notebook.file_link_target(&plan, &inside).as_deref(),
            Some("./skizze.png")
        );
        assert_eq!(
            notebook.file_link_target(&plan, &sibling).as_deref(),
            Some("../Notiz/liste.pdf")
        );
        let url = notebook.file_link_target(&plan, &outside).unwrap();
        assert!(url.starts_with("file://"), "{url}");
        assert!(url.ends_with("Rechnung 100%25.pdf"), "{url}");
        assert!(!url.contains('\\') && !url.contains(r"\\?"), "{url}");

        for (target, file) in [
            ("./skizze.png", &inside),
            ("../Notiz/liste.pdf", &sibling),
            (url.as_str(), &outside),
        ] {
            let resolved = notebook.resolve_file(&plan, target).unwrap();
            assert_eq!(
                fs::canonicalize(resolved).unwrap(),
                fs::canonicalize(file).unwrap(),
                "{target} does not lead back to the file"
            );
        }
    }

    #[test]
    fn unlinkable_paths_give_no_link() {
        let (_dir, notebook) = notebook_with(&[("Home", "x")]);
        let outside_dir = tempfile::tempdir().unwrap();
        let odd = outside_dir.path().join("a]b.pdf");
        fs::write(&odd, b"x").unwrap();
        assert_eq!(notebook.file_link_target(&page("Home"), &odd), None);
        assert_eq!(
            notebook.file_link_target(&page("Home"), &outside_dir.path().join("fehlt")),
            None
        );
        assert_eq!(attachment_text("a|b.pdf", false), None);
        assert_eq!(attachment_text("a}b.png", true), None);
        assert_eq!(
            attachment_text("x.png", true).as_deref(),
            Some("{{./x.png}}")
        );
        assert_eq!(
            attachment_text("Plan 1.pdf", false).as_deref(),
            Some("[[./Plan 1.pdf]]")
        );
    }

    #[test]
    fn dropped_files_are_copied_linked_or_left_alone() {
        let (_dir, notebook) = notebook_with(&[("Home", "x")]);
        let home = page("Home");
        let source = tempfile::tempdir().unwrap();
        let pdf = source.path().join("Vertrag.pdf");
        let png = source.path().join("foto.png");
        fs::write(&pdf, b"pdf").unwrap();
        fs::write(&png, b"png").unwrap();
        let reference =
            |path: &Path, link_only| notebook.reference_file_with(&home, path, link_only, None);

        // Copy: a link for a document, a picture for an image, no overwriting.
        let first = reference(&pdf, false).unwrap();
        assert_eq!(first.copied.as_deref(), Some("Vertrag.pdf"));
        assert_eq!(first.text.as_deref(), Some("[[./Vertrag.pdf]]"));
        let second = reference(&pdf, false).unwrap();
        assert_eq!(second.copied.as_deref(), Some("Vertrag-2.pdf"));
        let picture = reference(&png, false).unwrap();
        assert_eq!(picture.text.as_deref(), Some("{{./foto.png}}"));
        assert!(pdf.exists() && png.exists(), "the originals must stay");

        // Link only: nothing is copied.
        let before = notebook.attachments(&home).unwrap().len();
        let linked = reference(&png, true).unwrap();
        assert_eq!(linked.copied, None);
        assert!(
            linked
                .text
                .as_deref()
                .is_some_and(|t| t.starts_with("[[file://") && t.ends_with("foto.png]]")),
            "{linked:?}"
        );
        assert_eq!(notebook.attachments(&home).unwrap().len(), before);

        // A file that already is in the page's folder is referenced, not copied again.
        let there = notebook.page_folder(&home).join("foto.png");
        let again = reference(&there, false).unwrap();
        assert_eq!(again.copied, None);
        assert_eq!(again.text.as_deref(), Some("{{./foto.png}}"));
        assert_eq!(notebook.attachments(&home).unwrap().len(), before);

        // Folders can be linked but not copied; missing paths fail.
        assert!(reference(source.path(), false).is_err());
        let folder = reference(source.path(), true).unwrap();
        assert!(folder.text.is_some_and(|t| t.starts_with("[[file://")));
        assert!(reference(&source.path().join("fehlt.pdf"), false).is_err());
    }

    #[test]
    fn file_links_resolve_relative_to_the_page_folder() {
        let (_dir, notebook) = notebook_with(&[("A:B", "b")]);
        let folder = notebook.page_folder(&page("A:B"));
        let resolve = |target: &str| notebook.resolve_file(&page("A:B"), target);
        assert_eq!(resolve("./bild.png").unwrap(), folder.join("bild.png"));
        assert_eq!(resolve("bild.png").unwrap(), folder.join("bild.png"));
        assert_eq!(
            resolve("..\\x.pdf").unwrap(),
            notebook.page_folder(&page("A")).join("x.pdf")
        );
        assert_eq!(
            resolve("C:\\Daten\\a b.txt").unwrap(),
            PathBuf::from("C:/Daten/a b.txt")
        );
        assert_eq!(
            resolve("file:///C:/Daten/a%20b.txt").unwrap(),
            PathBuf::from("C:/Daten/a b.txt")
        );
        assert_eq!(resolve("/ohne/wurzel.txt"), None);
        assert_eq!(resolve("  "), None);
    }
}
