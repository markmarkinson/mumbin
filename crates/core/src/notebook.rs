//! A notebook: a folder of page files, sub-folders and attachments.
//!
//! This module and its children are the only place that touches page files on disk. They never
//! overwrite a file that is not a wiki page and never write a page whose content did not change.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;

mod files;
mod listing;
mod pages;
mod paths;
mod sealed;
mod vault;

pub(crate) use files::{
    copy_new_atomically, guard_absolute_parents, is_hidden, is_link, is_page_file, open_regular,
    read_bounded, read_dir_if_exists, write_atomically, write_new_atomically,
};
pub use listing::{FileFacts, PageInfo};
pub use pages::{Expect, FileStamp, LoadedPage, SaveMode, SaveOutcome};
pub(crate) use sealed::{SEALED_SUFFIX, check_token, sealed_variant};
pub use vault::BulkReport;

use crate::crypto::{CryptoError, read_vault_file};
use crate::ini::IniDocument;
use crate::pagefile::EndOfLine;
use crate::pagename::{PageName, PageNameError};
use files::{linked_path_error, pin_directory, read_if_exists};

/// Name of the configuration file that marks a folder as a notebook.
pub const CONFIG_FILE: &str = "notebook.mumbin";
/// Extension of wiki page files.
pub const PAGE_EXTENSION: &str = ".txt";
const SECTION: &str = "Notebook";
/// Largest page file that is read. A notebook can come from anywhere; a file of
/// hundreds of megabytes named like a page must not be loaded into memory.
pub const MAX_PAGE_BYTES: u64 = 32 * 1024 * 1024;
/// The notebook file is a few lines; anything larger is not one.
const MAX_CONFIG_BYTES: u64 = 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum NotebookError {
    #[error("{0}")]
    Io(#[from] io::Error),
    #[error("{0}")]
    Name(#[from] PageNameError),
    #[error("folder does not exist: {0}")]
    FolderMissing(PathBuf),
    #[error("a notebook already exists in {0}")]
    AlreadyExists(PathBuf),
    #[error("{0} exists but is not a wiki page")]
    NotAPage(PathBuf),
    #[error("{0} is not valid UTF-8 text")]
    NotText(PathBuf),
    #[error("the page was changed on disk by another program")]
    Conflict,
    #[error("the notebook root has no page of its own")]
    RootHasNoPage,
    #[error("{0} is larger than a page may be")]
    TooLarge(PathBuf),
    #[error("the notebook is locked: this needs its passphrase")]
    Locked,
    #[error("{0}")]
    Crypto(#[from] CryptoError),
}

impl NotebookError {
    /// An I/O error of kind `InvalidInput`: the caller asked for something that cannot be done.
    pub(crate) fn invalid(message: &str) -> Self {
        io::Error::new(io::ErrorKind::InvalidInput, message.to_owned()).into()
    }

    pub(crate) fn not_found(message: &str) -> Self {
        io::Error::new(io::ErrorKind::NotFound, message.to_owned()).into()
    }
}

#[derive(Debug, Clone)]
pub struct Notebook {
    folder: PathBuf,
    config: IniDocument,
    /// Whether the file names are hidden, and the keys while the notebook is open (E-025).
    layout: Arc<sealed::Layout>,
    // On Windows an open directory handle without FILE_SHARE_DELETE prevents
    // the notebook root from being replaced while any clone is in use.
    _root_guard: Arc<fs::File>,
}

impl Notebook {
    /// Opens an existing folder as a notebook. A missing notebook file is
    /// tolerated (defaults apply) and is not created behind the user's back.
    pub fn open(folder: &Path) -> Result<Self, NotebookError> {
        if !folder.is_dir() {
            return Err(NotebookError::FolderMissing(folder.to_owned()));
        }
        let folder = fs::canonicalize(folder)?;
        let root_guard = Arc::new(pin_directory(&folder)?);
        let config = read_config_text(&folder.join(CONFIG_FILE))?
            .map(|text| IniDocument::parse(&text))
            .unwrap_or_default();
        let sealed = read_vault_file(&folder)?.is_some_and(|file| file.sealed_names);
        Ok(Notebook {
            folder,
            config,
            layout: sealed::Layout::new(sealed),
            _root_guard: root_guard,
        })
    }

    /// Creates a new notebook in `folder`, which may exist but must not
    /// already contain a notebook.
    pub fn create(folder: &Path, name: &str) -> Result<Self, NotebookError> {
        if name.contains(['\r', '\n', '\0']) {
            return Err(NotebookError::invalid("notebook name must be one line"));
        }
        if folder.join(CONFIG_FILE).exists() {
            return Err(NotebookError::AlreadyExists(folder.to_owned()));
        }
        fs::create_dir_all(folder)?;
        let folder = fs::canonicalize(folder)?;
        let root_guard = Arc::new(pin_directory(&folder)?);
        let mut config = IniDocument::default();
        for (key, value) in [
            ("version", "1"),
            ("name", name),
            ("home", "Home"),
            ("icon", ""),
            ("document_root", ""),
            ("endofline", "dos"),
            ("disable_trash", "False"),
        ] {
            config.set(SECTION, key, value);
        }
        write_new_atomically(
            &folder.join(CONFIG_FILE),
            config.serialise("\r\n").as_bytes(),
        )?;
        Ok(Notebook {
            folder,
            config,
            layout: sealed::Layout::new(false),
            _root_guard: root_guard,
        })
    }

    pub fn folder(&self) -> &Path {
        &self.folder
    }

    /// Display name: the configured one, else the folder name.
    pub fn name(&self) -> String {
        self.config
            .get(SECTION, "name")
            .map(str::to_owned)
            .or_else(|| {
                self.folder
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
            })
            .unwrap_or_default()
    }

    /// Start page shown when the notebook is opened.
    pub fn home(&self) -> PageName {
        self.config
            .get(SECTION, "home")
            .and_then(|home| PageName::from_input(home).ok())
            .unwrap_or_else(|| PageName::new("Home").expect("constant is a valid page name"))
    }

    /// Raw value of a key in the `[Notebook]` section of the notebook file.
    pub fn property(&self, key: &str) -> Option<&str> {
        self.config.get(SECTION, key)
    }

    pub fn end_of_line(&self) -> EndOfLine {
        match self.property("endofline") {
            Some("unix") => EndOfLine::Unix,
            _ => EndOfLine::Dos,
        }
    }

    /// Writes keys into one section of the notebook file and returns the notebook
    /// with that configuration. The file is read again first, so what another
    /// program changed in the meantime is kept; everything else in it stays
    /// as it was. A notebook file that is a link is not written.
    pub fn with_properties(
        &self,
        section: &str,
        values: &[(&str, &str)],
    ) -> Result<Notebook, NotebookError> {
        if section.contains(['\r', '\n', '\0', '[', ']'])
            || values.iter().any(|(key, value)| {
                key.contains(['\r', '\n', '\0', '=']) || value.contains(['\r', '\n', '\0'])
            })
        {
            return Err(NotebookError::invalid(
                "configuration values must be one line",
            ));
        }
        let config_path = self.folder.join(CONFIG_FILE);
        self.check_path(&config_path)?;
        let (mut config, line_ending) = match read_config_text(&config_path)? {
            Some(text) => (IniDocument::parse(&text), line_ending_of(&text)),
            None => (self.config.clone(), "\r\n"),
        };
        for (key, value) in values {
            config.set(section, key, value);
        }
        write_atomically(&config_path, config.serialise(line_ending).as_bytes())?;
        Ok(self.with_config(config))
    }

    /// Removes a section that no longer belongs to the notebook file (left over from a feature
    /// the program no longer has). Nothing is written when the section is not there.
    pub fn without_section(&self, section: &str) -> Result<Notebook, NotebookError> {
        if self.config.get_section_names().all(|name| name != section) {
            return Ok(self.clone());
        }
        let config_path = self.folder.join(CONFIG_FILE);
        self.check_path(&config_path)?;
        let Some(text) = read_config_text(&config_path)? else {
            return Ok(self.clone());
        };
        let mut config = IniDocument::parse(&text);
        if !config.remove_section(section) {
            return Ok(self.clone());
        }
        write_atomically(
            &config_path,
            config.serialise(line_ending_of(&text)).as_bytes(),
        )?;
        Ok(self.with_config(config))
    }

    fn with_config(&self, config: IniDocument) -> Notebook {
        Notebook {
            config,
            ..self.clone()
        }
    }
}

/// The text of the notebook file, `None` when there is none. A link is refused.
fn read_config_text(path: &Path) -> Result<Option<String>, NotebookError> {
    if fs::symlink_metadata(path).is_ok_and(|metadata| is_link(&metadata)) {
        return Err(linked_path_error(path));
    }
    Ok(read_if_exists(path, MAX_CONFIG_BYTES)?
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned()))
}

/// The line ending a file already uses; Windows style for an empty one.
fn line_ending_of(text: &str) -> &'static str {
    if text.is_empty() || text.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

#[cfg(test)]
mod tests {
    use super::files::TEMP_SUFFIX;
    use super::*;

    const HEADER: &str = "Content-Type: text/x-mumbin-page\r\nPage-Format: mumbin 1\r\nCreation-Date: 2020-01-02T03:04:05+01:00\r\n\r\n";

    fn page(text: &str) -> PageName {
        PageName::new(text).unwrap()
    }

    fn fixture() -> (tempfile::TempDir, Notebook) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::write(
            root.join("notebook.mumbin"),
            "[Notebook]\r\nname=Test\r\nhome=Start\r\n[Custom]\r\nx=1\r\n",
        )
        .unwrap();
        let write = |rel: &str, body: &str| {
            let path = root.join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, format!("{HEADER}{body}")).unwrap();
        };
        write("Start.txt", "Willkommen\r\n");
        write("Seite_10.txt", "zehn\r\n");
        write("seite_9.txt", "neun\r\n");
        write("Projekt_A/Besprechung.txt", "Protokoll\r\n");
        write("Nur_Ordner/Tief/Kind.txt", "Kind\r\n");
        fs::write(root.join("notizen.txt"), "plain text attachment\r\n").unwrap();
        fs::write(root.join("Mit Leerzeichen.txt"), format!("{HEADER}x\r\n")).unwrap();
        fs::write(root.join("Start.txt~"), "backup").unwrap();
        fs::create_dir_all(root.join(".cache")).unwrap();
        fs::create_dir_all(root.join("Anhang_Ordner")).unwrap();
        fs::write(root.join("Anhang_Ordner/bild.png"), [1u8, 2, 3]).unwrap();
        let notebook = Notebook::open(root).unwrap();
        (dir, notebook)
    }

    #[test]
    fn reads_configuration_with_defaults() {
        let (_dir, notebook) = fixture();
        assert_eq!(notebook.name(), "Test");
        assert_eq!(notebook.home(), page("Start"));
        assert_eq!(notebook.end_of_line(), EndOfLine::Dos);

        let bare = tempfile::tempdir().unwrap();
        let notebook = Notebook::open(bare.path()).unwrap();
        assert_eq!(notebook.home(), page("Home"));
        assert!(
            !bare.path().join(CONFIG_FILE).exists(),
            "open must not create files"
        );
        assert!(matches!(
            Notebook::open(&bare.path().join("missing")),
            Err(NotebookError::FolderMissing(_))
        ));
    }

    #[test]
    fn lists_only_real_pages_in_natural_order() {
        let (_dir, notebook) = fixture();
        let top = notebook.children(&PageName::root()).unwrap();
        let summary: Vec<(&str, bool, bool)> = top
            .iter()
            .map(|p| (p.name.as_str(), p.has_content, p.has_children))
            .collect();
        assert_eq!(
            summary,
            [
                ("Nur Ordner", false, true),
                ("Projekt A", false, true),
                ("seite 9", true, false),
                ("Seite 10", true, false),
                ("Start", true, false),
            ]
        );
        let nested = notebook.children(&page("Nur Ordner:Tief")).unwrap();
        assert_eq!(nested[0].name, page("Nur Ordner:Tief:Kind"));
        assert!(
            notebook
                .children(&page("Gibt es nicht"))
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn reads_pages_and_reports_missing_ones() {
        let (_dir, notebook) = fixture();
        let loaded = notebook
            .read_page(&page("Projekt A:Besprechung"))
            .unwrap()
            .unwrap();
        assert_eq!(loaded.body, "Protokoll\n");
        assert_eq!(
            loaded.creation_date.as_deref(),
            Some("2020-01-02T03:04:05+01:00")
        );
        assert_eq!(notebook.read_page(&page("Neu")).unwrap(), None);
        assert!(matches!(
            notebook.read_page(&page("notizen")),
            Err(NotebookError::NotAPage(_))
        ));
        assert!(matches!(
            notebook.read_page(&PageName::root()),
            Err(NotebookError::RootHasNoPage)
        ));
    }

    #[test]
    fn saving_unchanged_text_does_not_touch_the_file() {
        let (_dir, notebook) = fixture();
        let name = page("Start");
        let before = fs::read(notebook.page_file(&name)).unwrap();
        let loaded = notebook.read_page(&name).unwrap().unwrap();
        let outcome = notebook
            .save_page(&name, &loaded.body, Expect::Stamp(&loaded.stamp))
            .unwrap();
        assert_eq!(outcome, SaveOutcome::Unchanged(loaded.stamp));
        assert_eq!(fs::read(notebook.page_file(&name)).unwrap(), before);
    }

    #[test]
    fn saves_changes_keeping_headers_and_line_endings() {
        let (_dir, notebook) = fixture();
        let name = page("Start");
        let loaded = notebook.read_page(&name).unwrap().unwrap();
        let outcome = notebook
            .save_page(&name, "Neu\nZeile 2", Expect::Stamp(&loaded.stamp))
            .unwrap();
        let on_disk = fs::read_to_string(notebook.page_file(&name)).unwrap();
        assert_eq!(on_disk, format!("{HEADER}Neu\r\nZeile 2\r\n"));
        let SaveOutcome::Saved(stamp) = outcome else {
            panic!("expected a write");
        };
        assert_eq!(notebook.read_page(&name).unwrap().unwrap().stamp, stamp);
        let leftovers: Vec<_> = fs::read_dir(notebook.folder())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(TEMP_SUFFIX))
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn creates_new_pages_with_folders_and_creation_date() {
        let (_dir, notebook) = fixture();
        let name = page("Neu:Unter Seite");
        notebook
            .save_page(&name, "Inhalt", Expect::Missing)
            .unwrap();
        let text = fs::read_to_string(notebook.folder().join("Neu/Unter_Seite.txt")).unwrap();
        assert!(text.starts_with(
            "Content-Type: text/x-mumbin-page\r\nPage-Format: mumbin 1\r\nCreation-Date: 20"
        ));
        assert!(text.ends_with("\r\n\r\nInhalt\r\n"));
        assert!(matches!(
            notebook.save_page(&name, "nochmal", Expect::Missing),
            Err(NotebookError::Conflict)
        ));
    }

    #[test]
    fn detects_changes_made_by_another_program() {
        let (_dir, notebook) = fixture();
        let name = page("Start");
        let loaded = notebook.read_page(&name).unwrap().unwrap();
        fs::write(notebook.page_file(&name), format!("{HEADER}von aussen\r\n")).unwrap();
        assert!(matches!(
            notebook.save_page(&name, "meins", Expect::Stamp(&loaded.stamp)),
            Err(NotebookError::Conflict)
        ));
        let on_disk = fs::read_to_string(notebook.page_file(&name)).unwrap();
        assert!(
            on_disk.ends_with("von aussen\r\n"),
            "foreign change must survive"
        );
    }

    #[test]
    fn never_overwrites_a_file_that_is_not_a_page() {
        let (_dir, notebook) = fixture();
        let result = notebook.save_page(&page("notizen"), "überschreiben", Expect::Anything);
        assert!(matches!(result, Err(NotebookError::NotAPage(_))));
        let text = fs::read_to_string(notebook.folder().join("notizen.txt")).unwrap();
        assert_eq!(text, "plain text attachment\r\n");
    }

    #[test]
    fn emptied_page_is_removed_with_empty_folders_only() {
        let (_dir, notebook) = fixture();
        let deep = page("Nur Ordner:Tief:Kind");
        assert_eq!(
            notebook.save_page(&deep, "  \n", Expect::Anything).unwrap(),
            SaveOutcome::Removed
        );
        assert!(!notebook.folder().join("Nur_Ordner").exists());
        assert!(notebook.folder().exists());

        fs::write(notebook.folder().join("Projekt_A/skizze.png"), [0u8]).unwrap();
        notebook
            .save_page(&page("Projekt A:Besprechung"), "", Expect::Anything)
            .unwrap();
        assert!(
            notebook.folder().join("Projekt_A/skizze.png").exists(),
            "attachments stay"
        );
        assert_eq!(
            notebook
                .save_page(&page("Nie da"), "", Expect::Anything)
                .unwrap(),
            SaveOutcome::Removed
        );
    }

    #[test]
    fn creates_a_notebook_once() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("Mein Notizbuch");
        let notebook = Notebook::create(&folder, "Mein Notizbuch").unwrap();
        assert_eq!(notebook.name(), "Mein Notizbuch");
        let config = fs::read_to_string(folder.join(CONFIG_FILE)).unwrap();
        assert!(config.starts_with("[Notebook]\r\nversion=1\r\nname=Mein Notizbuch\r\n"));
        assert!(matches!(
            Notebook::create(&folder, "x"),
            Err(NotebookError::AlreadyExists(_))
        ));
        let reopened = Notebook::open(&folder).unwrap();
        assert_eq!(reopened.home(), page("Home"));
    }

    #[test]
    fn unix_line_endings_are_honoured() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(CONFIG_FILE), "[Notebook]\nendofline=unix\n").unwrap();
        let notebook = Notebook::open(dir.path()).unwrap();
        notebook
            .save_page(&page("A"), "x\ny", Expect::Missing)
            .unwrap();
        let text = fs::read_to_string(dir.path().join("A.txt")).unwrap();
        assert!(!text.contains('\r'));
        assert!(text.ends_with("\n\nx\ny\n"));
    }
}
