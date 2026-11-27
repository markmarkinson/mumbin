//! What the program may open or touch on behalf of a notebook's text and settings.

use std::path::{Component, Path, PathBuf, Prefix};

use crate::Notebook;

/// Extensions of files that run code or change the system when they are opened: programs and
/// installers, scripts, shortcuts and shell objects that start something or reach other
/// machines, registry, help and setup files.
const RISKY_EXTENSIONS: &str = concat!(
    "exe com scr pif msi msp msix msixbundle appx appinstaller application appref-ms gadget jar ",
    "dll cpl msc xll ",
    "bat cmd ps1 psm1 ps1xml psc1 msh msh1 msh2 vbs vbe vb js jse wsf wsh ws sct hta py pyw pl rb sh ",
    "lnk url scf search-ms library-ms settingcontent-ms diagcab ",
    "reg inf chm"
);

/// True for files that run code or change the system when they are opened.
/// Those are shown in their folder instead of being opened.
pub fn is_executable(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        // A name that is not text cannot be judged.
        return true;
    };
    // `tool.exe::$DATA` and `tool.exe:stream` name the same program on NTFS.
    if name.contains(':') {
        return true;
    }
    // Windows ignores trailing dots and spaces: `tool.exe.` starts `tool.exe`.
    let name = name.trim_end_matches(['.', ' ']);
    Path::new(name)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            RISKY_EXTENSIONS
                .split_whitespace()
                .any(|risky| risky.eq_ignore_ascii_case(extension))
        })
}

/// True for addresses the program may hand to the system's browser or mail
/// program: plain web and mail links, nothing else (no `file:`, no `ms-…:`
/// handlers, no script addresses), and no characters that could be read as more
/// than an address.
pub fn is_openable_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    url.len() <= 2048
        && !url.chars().any(|c| c.is_control() || c.is_whitespace())
        && (lower.starts_with("https://")
            || lower.starts_with("http://")
            || lower.starts_with("mailto:"))
}

/// True for `\\server\share` paths and device paths such as `\\.\pipe`.
fn is_remote(path: &Path) -> bool {
    matches!(
        path.components().next(),
        Some(Component::Prefix(prefix))
            if matches!(prefix.kind(), Prefix::UNC(..) | Prefix::VerbatimUNC(..) | Prefix::DeviceNS(..))
    )
}

/// Resolves `.` and `..` without touching the disk.
pub(super) fn normalise(path: &Path) -> PathBuf {
    let mut output = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                output.pop();
            }
            other => output.push(other),
        }
    }
    output
}

impl Notebook {
    /// Folder that `/…` file links are relative to, if configured.
    pub fn document_root(&self) -> Option<PathBuf> {
        let value = self.property("document_root")?.trim();
        if value.is_empty() {
            return None;
        }
        let path = Path::new(value);
        let root = if path.is_absolute() {
            path.to_owned()
        } else {
            normalise(&self.folder().join(path))
        };
        // The setting comes from the notebook file. A notebook from elsewhere
        // must not make the program reach out to another machine.
        (!self.is_foreign_remote(&root)).then_some(root)
    }

    /// True when `path` is on another machine (`\\server\share`) or a device
    /// and the notebook itself is not on that same share. Touching such a path
    /// at all, even only to ask whether it exists, makes Windows connect to the
    /// server and hand over the user's credentials. Nothing that comes from a
    /// notebook's text or settings may cause that.
    pub fn is_foreign_remote(&self, path: &Path) -> bool {
        is_remote(path) && path.components().next() != self.folder().components().next()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::*;

    #[test]
    fn programs_are_recognised_whatever_tricks_the_name_plays() {
        for name in [
            "a.exe",
            "A.EXE",
            "setup.msi",
            "x.bat",
            "x.ps1",
            "x.lnk",
            "x.url",
            "x.hta",
            "x.py",
            "x.search-ms",
            "x.library-ms",
            "x.scf",
            "x.settingcontent-ms",
            "x.chm",
            "x.reg",
            // Windows ignores trailing dots and spaces ...
            "tool.exe.",
            "tool.exe ",
            "tool.exe. .",
            "tool.EXE...",
            // ... and a stream name runs the same program.
            "tool.exe::$DATA",
            "tool.exe:evil",
            "tool.txt:payload.exe",
        ] {
            assert!(is_executable(Path::new(name)), "{name} is not flagged");
            assert!(
                is_executable(&Path::new("C:/dir").join(name)),
                "{name} in a folder is not flagged"
            );
        }
        for name in [
            "a.txt",
            "a.pdf",
            "a.png",
            "exe",
            "notes.exe.txt",
            "readme",
            "a.docx",
            "archive.zip",
        ] {
            assert!(!is_executable(Path::new(name)), "{name} is flagged");
        }
    }

    #[test]
    fn only_web_and_mail_addresses_are_opened() {
        for url in [
            "https://example.org/a?b=c#d",
            "http://localhost:8080/",
            "HTTPS://EXAMPLE.ORG",
            "mailto:a@b.de?subject=Hi",
        ] {
            assert!(is_openable_url(url), "{url}");
        }
        for url in [
            "file:///C:/Windows/System32/calc.exe",
            "javascript:alert(1)",
            "data:text/html,x",
            "ms-msdt:/id",
            "search-ms:query=x&crumb=location:\\\\evil\\share",
            "ftp://x/y",
            "smb://host/share",
            "\\\\host\\share",
            "http",
            "https:/x",
            "http://a b",
            "http://a\nb",
            "https://a\u{0}b",
            "",
        ] {
            assert!(!is_openable_url(url), "{url:?} would be opened");
        }
        assert!(!is_openable_url(&format!("https://a/{}", "x".repeat(3000))));
    }

    #[cfg(windows)]
    #[test]
    fn a_notebook_cannot_make_the_program_reach_out_to_other_machines() {
        let (_dir, notebook) = notebook_with(&[("Home", "x")]);
        for remote in [
            r"\\192.0.2.1\share\x.png",
            r"\\?\UNC\192.0.2.1\share\x.png",
            r"\\.\pipe\something",
            r"\\localhost\c$\Windows\win.ini",
        ] {
            assert!(notebook.is_foreign_remote(Path::new(remote)), "{remote}");
        }
        for local in [
            r"C:\Users\x\a.png",
            r"\\?\C:\Users\x\a.png",
            "relative/a.png",
            "./a.png",
        ] {
            assert!(!notebook.is_foreign_remote(Path::new(local)), "{local}");
        }
        // Links and settings that point there are turned into nothing before any file access.
        let page = page("Home");
        let target = notebook
            .resolve_file(&page, r"\\192.0.2.1\share\x.png")
            .unwrap();
        assert!(notebook.is_foreign_remote(&target), "{target:?}");

        let evil = tempfile::tempdir().unwrap();
        std::fs::write(
            evil.path().join("notebook.mumbin"),
            "[Notebook]\nname=Evil\ndocument_root=\\\\192.0.2.1\\share\n",
        )
        .unwrap();
        let hostile = Notebook::open(evil.path()).unwrap();
        assert_eq!(
            hostile.document_root(),
            None,
            "a remote document root was accepted"
        );
        assert_eq!(hostile.resolve_file(&page, "/x.png"), None);
    }
}
