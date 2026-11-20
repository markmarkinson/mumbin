//! Putting files next to a page, and reading them back.

use std::fs;
use std::path::{Path, PathBuf};

use crate::crypto::names::NameKind;
use crate::crypto::{
    CryptoError, FILE_MAGIC3, FILE_OVERHEAD, FileSeal, Keys, MAX_SEALED, Vault, names,
};
use crate::notebook::{
    SEALED_SUFFIX, check_token, copy_new_atomically, read_bounded, sealed_variant,
    write_new_atomically,
};
use crate::pagename::WINDOWS_RESERVED;
use crate::{Notebook, NotebookError, PageName};

/// The largest content of a sealed file.
pub(super) const MAX_CONTENT: u64 = MAX_SEALED as u64;

/// The largest sealed file that holds at most `content` bytes.
pub(super) fn sealed_file_limit(content: u64, named: bool) -> u64 {
    content
        + if named {
            names::named_file_overhead(names::MAX_NAME)
        } else {
            FILE_OVERHEAD
        }
}

/// A file name that every file system accepts: characters Windows forbids
/// become `_`, trailing dots and spaces go (Windows drops them silently), and a
/// device name such as `con` or `nul.txt` gets a `_` in front, because writing a
/// file with that name would write to the device instead.
pub(super) fn safe_file_name(name: &str) -> Option<String> {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.trim_end_matches(['.', ' ']);
    if cleaned.is_empty() {
        return None;
    }
    let device = cleaned
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end()
        .to_ascii_lowercase();
    Some(if WINDOWS_RESERVED.contains(&device.as_str()) {
        format!("_{cleaned}")
    } else {
        cleaned.to_owned()
    })
}

/// The file name from a wish: only the last part of a path, without leading dots or tildes,
/// made safe for Windows.
fn clean_attachment_name(wanted: &str) -> Result<String, NotebookError> {
    Path::new(wanted)
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .map(|file_name| file_name.trim().trim_start_matches(['.', '~']))
        .filter(|file_name| !file_name.is_empty() && !file_name.contains(['/', '\\']))
        .and_then(safe_file_name)
        .ok_or_else(|| NotebookError::invalid("not a usable file name"))
}

/// A file or its sealed twin exists at this plain path.
pub(super) fn name_taken(plain: &Path) -> bool {
    fs::symlink_metadata(plain).is_ok() || fs::symlink_metadata(sealed_variant(plain)).is_ok()
}

fn require_source_file(source: &Path) -> Result<&str, NotebookError> {
    if !source.is_file() {
        return Err(NotebookError::not_found("file does not exist"));
    }
    Ok(source.file_name().and_then(|n| n.to_str()).unwrap_or(""))
}

impl Notebook {
    /// A sealed notebook never keeps a plain file.
    fn refuse_plain_files(&self) -> Result<(), NotebookError> {
        if self.is_sealed() {
            return Err(NotebookError::invalid(
                "the files of this notebook must be sealed",
            ));
        }
        Ok(())
    }

    /// Free file name in the page's attachment folder, based on `wanted`.
    fn free_attachment_path(
        &self,
        name: &PageName,
        wanted: &str,
    ) -> Result<(PathBuf, String), NotebookError> {
        let base = clean_attachment_name(wanted)?;
        let _parents = self.guard_parent(&self.attachment_base(name, &base), true)?;
        if let Some(keys) = self.layout_keys()? {
            self.write_dir_names(&keys, name, true)?;
        }
        let (stem, extension) = match base.rsplit_once('.') {
            Some((stem, extension)) if !stem.is_empty() => (stem, format!(".{extension}")),
            _ => (base.as_str(), String::new()),
        };
        let mut chosen = base.clone();
        let mut candidate = self.attachment_base(name, &chosen);
        let mut counter = 1;
        while name_taken(&candidate) {
            counter += 1;
            chosen = format!("{stem}-{counter}{extension}");
            candidate = self.attachment_base(name, &chosen);
        }
        Ok((candidate, chosen))
    }

    /// Copies a file into the page's attachment folder; returns its name there.
    pub fn attach_file(&self, name: &PageName, source: &Path) -> Result<String, NotebookError> {
        let wanted = require_source_file(source)?;
        self.refuse_plain_files()?;
        let (target, stored) = self.free_attachment_path(name, wanted)?;
        let _parents = self.guard_parent(&target, false)?;
        self.check_path(&target)?;
        copy_new_atomically(&target, &mut fs::File::open(source)?)?;
        Ok(stored)
    }

    /// Like [`Notebook::attach_file`] for a sealed notebook: the file is stored sealed, with its
    /// name inside. Returns the name it has.
    pub fn attach_file_sealed(
        &self,
        name: &PageName,
        source: &Path,
        vault: &Vault,
    ) -> Result<String, NotebookError> {
        let wanted = require_source_file(source)?;
        let bytes = read_bounded(source, MAX_CONTENT)?;
        self.attach_bytes_sealed(name, wanted, &bytes, vault)
    }

    /// Stores bytes (a pasted picture, for example) as an attachment.
    pub fn attach_bytes(
        &self,
        name: &PageName,
        wanted: &str,
        bytes: &[u8],
    ) -> Result<String, NotebookError> {
        self.refuse_plain_files()?;
        let (target, stored) = self.free_attachment_path(name, wanted)?;
        let _parents = self.guard_parent(&target, false)?;
        write_new_atomically(&target, bytes)?;
        Ok(stored)
    }

    /// Stores bytes as a sealed attachment of the page; returns the plain name.
    pub fn attach_bytes_sealed(
        &self,
        name: &PageName,
        wanted: &str,
        bytes: &[u8],
        vault: &Vault,
    ) -> Result<String, NotebookError> {
        self.store_sealed(name, wanted, |stored| {
            if self.is_sealed() {
                vault.seal_named_file(stored, bytes)
            } else {
                vault.seal_file(bytes)
            }
        })
    }

    /// Like [`Notebook::attach_bytes_sealed`] with the key of a page that has a password of its
    /// own; such pages do not exist in a notebook that hides its file names.
    pub fn attach_bytes_with(
        &self,
        name: &PageName,
        wanted: &str,
        bytes: &[u8],
        sealer: &dyn FileSeal,
    ) -> Result<String, NotebookError> {
        if self.is_sealed() {
            return Err(NotebookError::invalid(
                "a page of this notebook is sealed with the vault",
            ));
        }
        self.store_sealed(name, wanted, |_| sealer.seal_file(bytes))
    }

    fn store_sealed(
        &self,
        name: &PageName,
        wanted: &str,
        seal: impl FnOnce(&str) -> Result<Vec<u8>, CryptoError>,
    ) -> Result<String, NotebookError> {
        let (plain, stored) = self.free_attachment_path(name, wanted)?;
        let _parents = self.guard_parent(&plain, false)?;
        let sealed = seal(&stored)?;
        let target = sealed_variant(&plain);
        self.check_path(&target)?;
        write_new_atomically(&target, &sealed)?;
        Ok(stored)
    }

    /// True when only the sealed variant of this plain path exists.
    pub fn is_sealed_only(&self, path: &Path) -> bool {
        fs::symlink_metadata(path).is_err()
            && fs::symlink_metadata(sealed_variant(path)).is_ok_and(|metadata| metadata.is_file())
    }

    /// Content of an attachment given by its plain path: the file itself, or, when only the
    /// sealed variant exists, that one opened with the vault or with the key of the page whose
    /// folder it lies in. A sealed file whose key is not given is `Locked`.
    pub fn read_attachment<'k>(
        &self,
        path: &Path,
        keys: impl Into<Keys<'k>>,
    ) -> Result<Vec<u8>, NotebookError> {
        self.read_attachment_limited(path, keys.into(), MAX_CONTENT)
    }

    /// Like [`Notebook::read_attachment`] for a file of at most `maximum` bytes of content.
    pub(super) fn read_attachment_limited(
        &self,
        path: &Path,
        keys: Keys<'_>,
        maximum: u64,
    ) -> Result<Vec<u8>, NotebookError> {
        let _parents = self.guard_parent(path, false)?;
        self.check_path(path)?;
        match fs::symlink_metadata(path) {
            Ok(metadata) if metadata.is_file() => return read_bounded(path, maximum),
            Ok(_) => return Err(NotebookError::not_found("not a file")),
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                return Err(error.into());
            }
            Err(_) => {}
        }
        let sealed = sealed_variant(path);
        self.check_path(&sealed)?;
        if !fs::symlink_metadata(&sealed)?.is_file() {
            return Err(NotebookError::not_found("not a file"));
        }
        if keys.vault.is_none() && keys.pages.is_none() {
            return Err(NotebookError::Locked);
        }
        if let Some(layout) = self.layout_keys()? {
            let vault = keys.vault.ok_or(NotebookError::Locked)?;
            let bytes = read_bounded(&sealed, sealed_file_limit(maximum, true))?;
            let (name, plain) = vault.open_named_file(&bytes)?;
            check_token(&layout, NameKind::File, &sealed, SEALED_SUFFIX, &name)?;
            return Ok(plain.to_vec());
        }
        let bytes = read_bounded(&sealed, sealed_file_limit(maximum, false))?;
        if bytes.starts_with(FILE_MAGIC3) {
            let key = self.owner_of(&sealed).and_then(|page| keys.page(&page));
            return Ok(key
                .ok_or(NotebookError::Locked)?
                .open_file(&bytes)?
                .to_vec());
        }
        let vault = keys.vault.ok_or(NotebookError::Locked)?;
        Ok(vault.open_file(&bytes)?.to_vec())
    }

    /// The page whose attachment folder holds `file`, in a notebook with plain names.
    fn owner_of(&self, file: &Path) -> Option<PageName> {
        let folder = file.parent()?.strip_prefix(self.folder()).ok()?;
        PageName::from_relative_path(folder, "")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::*;

    #[test]
    fn attachment_names_cannot_name_devices_or_leave_the_folder() {
        let (_dir, notebook) = notebook_with(&[("Home", "x")]);
        let home = page("Home");
        for (wanted, expected) in [
            ("con", "_con"),
            ("NUL.txt", "_NUL.txt"),
            ("Com1.png", "_Com1.png"),
            ("aux .pdf", "_aux .pdf"),
            ("a.png.", "a.png"),
            ("a.png  ", "a-2.png"), // same name as the line before once the spaces are gone
            ("a?b*c<d>e|f\"g:h.png", "a_b_c_d_e_f_g_h.png"),
            ("conx.txt", "conx.txt"),
        ] {
            let stored = notebook.attach_bytes(&home, wanted, b"x").unwrap();
            assert_eq!(stored, expected, "for {wanted}");
            assert!(notebook.page_folder(&home).join(&stored).is_file());
        }
        // `C:evil.png` means "evil.png on drive C" to Windows; either way it stays inside the folder.
        for wanted in [
            "",
            ".",
            "..",
            "...",
            "   ",
            "a/b",
            "../../x.png",
            "C:evil.png",
            r"\\host\share\x.png",
        ] {
            let result = notebook.attach_bytes(&home, wanted, b"x");
            if let Ok(stored) = result {
                assert!(
                    notebook.page_folder(&home).join(&stored).is_file(),
                    "{wanted:?} -> {stored:?} is not inside the page folder"
                );
                assert!(!stored.contains(['/', '\\']), "{stored}");
            }
        }
        assert!(
            !notebook.folder().join("x.png").exists()
                && !notebook.folder().parent().unwrap().join("x.png").exists()
        );
    }

    #[test]
    fn attaching_never_overwrites() {
        let (dir, notebook) = notebook_with(&[("A", "a")]);
        let source = dir.path().join("quelle.png");
        fs::write(&source, b"eins").unwrap();
        assert_eq!(
            notebook.attach_file(&page("A"), &source).unwrap(),
            "quelle.png"
        );
        assert_eq!(
            notebook.attach_file(&page("A"), &source).unwrap(),
            "quelle-2.png"
        );
        assert_eq!(
            notebook
                .attach_bytes(&page("A"), "quelle.png", b"drei")
                .unwrap(),
            "quelle-3.png"
        );
        assert!(notebook.attach_bytes(&page("A"), "..", b"x").is_err());
        assert!(notebook.attach_bytes(&page("A"), "", b"x").is_err());
        assert_eq!(
            notebook
                .attach_bytes(&page("A"), "..\\..\\raus.png", b"x")
                .unwrap(),
            "raus.png",
            "only the file name is used"
        );
        assert!(notebook.page_folder(&page("A")).join("raus.png").exists());
    }
}
