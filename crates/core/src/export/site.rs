//! Export of pages, attachments and a table of contents into a new folder.

use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use super::html::{document, escape, heading_anchor, safe_url};
use super::{ExportReport, Targets, Texts, render_html};
use crate::crypto::Keys;
use crate::index::IndexedPage;
use crate::notebook::{copy_new_atomically, open_regular, write_new_atomically};
use crate::pagename::name_key;
use crate::{Index, Notebook, NotebookError, PageName};

/// Encodes the parts of a relative path for use in a link.
fn url_path(parts: impl Iterator<Item = String>) -> String {
    parts
        .map(|part| {
            let mut encoded = String::new();
            for byte in part.bytes() {
                if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
                    encoded.push(byte as char);
                } else {
                    encoded.push_str(&format!("%{byte:02X}"));
                }
            }
            encoded
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Link from the folder `from` to the file `to`, both relative to the export folder.
fn relative_link(from: &Path, to: &Path) -> String {
    let parts = |path: &Path| -> Vec<String> {
        path.iter()
            .map(|part| part.to_string_lossy().into_owned())
            .collect()
    };
    let (from, to) = (parts(from), parts(to));
    let shared = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let up = std::iter::repeat_n("..".to_owned(), from.len() - shared);
    url_path(up.chain(to[shared..].iter().cloned()))
}

fn page_file(name: &PageName) -> PathBuf {
    name.file_path(".html")
}

/// Where the links of one exported page lead.
struct ExportTargets<'a> {
    notebook: &'a Notebook,
    index: &'a Index,
    page: &'a PageName,
    exported: &'a HashSet<String>,
}

impl ExportTargets<'_> {
    /// Folder of the page's HTML file inside the export.
    fn folder(&self) -> PathBuf {
        page_file(self.page)
            .parent()
            .map(Path::to_owned)
            .unwrap_or_default()
    }

    /// Link to a file inside the notebook, as it lies in the export folder.
    fn inside(&self, target: &str) -> Option<String> {
        let path = self.notebook.resolve_file(self.page, target)?;
        if self.notebook.is_foreign_remote(&path) {
            return None;
        }
        let relative = path.strip_prefix(self.notebook.folder()).ok()?;
        Some(relative_link(&self.folder(), relative))
    }
}

impl Targets for ExportTargets<'_> {
    fn page(&self, target: &str) -> Option<String> {
        let resolved = self.index.tree().resolve(self.page, target).ok()?;
        let anchor = target
            .split_once('#')
            .map(|(_, anchor)| heading_anchor(anchor))
            .filter(|anchor| !anchor.is_empty());
        let own = resolved.key() == self.page.key();
        if !own && !self.exported.contains(&resolved.key()) {
            return None;
        }
        let mut link = if own {
            String::new()
        } else {
            relative_link(&self.folder(), &page_file(&resolved))
        };
        if let Some(anchor) = anchor {
            link.push('#');
            link.push_str(&url_path(std::iter::once(anchor)));
        }
        (!link.is_empty()).then_some(link)
    }

    fn file(&self, target: &str) -> Option<String> {
        self.inside(target)
    }

    fn picture(&self, source: &str) -> Option<String> {
        if safe_url(source).is_some() {
            return None;
        }
        self.inside(source)
    }
}

/// The table of contents: pages nested by name; a branch whose own page has
/// no content shows as plain text.
#[derive(Default)]
struct ContentsNode {
    label: String,
    page: Option<PageName>,
    children: Vec<ContentsNode>,
}

impl ContentsNode {
    fn insert(&mut self, parts: &[&str], name: &PageName) {
        let Some((first, rest)) = parts.split_first() else {
            self.page = Some(name.clone());
            return;
        };
        let position = self
            .children
            .iter()
            .position(|child| name_key(&child.label) == name_key(first))
            .unwrap_or_else(|| {
                self.children.push(ContentsNode {
                    label: (*first).to_owned(),
                    ..ContentsNode::default()
                });
                self.children.len() - 1
            });
        self.children[position].insert(rest, name);
    }

    fn render(&self, output: &mut String) {
        for child in &self.children {
            output.push_str("<li>");
            match &child.page {
                Some(page) => output.push_str(&format!(
                    "<a href=\"{}\">{}</a>",
                    relative_link(Path::new(""), &page_file(page)),
                    escape(&child.label)
                )),
                None => output.push_str(&escape(&child.label)),
            }
            if !child.children.is_empty() {
                output.push_str("<ul>");
                child.render(output);
                output.push_str("</ul>");
            }
            output.push_str("</li>");
        }
    }
}

fn copy_attachments(
    notebook: &Notebook,
    page: &PageName,
    destination: &Path,
    keys: Keys<'_>,
) -> Result<usize, NotebookError> {
    let mut copied = 0;
    for attachment in notebook.attachments(page)? {
        let source = notebook.attachment_base(page, &attachment.name);
        let _parents = notebook.guard_parent(&source, false)?;
        notebook.check_path(&source)?;
        let folder = destination.join(page.folder_path());
        fs::create_dir_all(&folder)?;
        let target = folder.join(&attachment.name);
        let result = if attachment.encrypted {
            // A file whose key is not open stays out of the export, like a locked page.
            let bytes = match notebook.read_attachment(&source, keys) {
                Err(NotebookError::Locked) => continue,
                other => other?,
            };
            write_new_atomically(&target, &bytes)
        } else {
            copy_new_atomically(&target, &mut open_regular(&source)?)
        };
        match result {
            Ok(()) => copied += 1,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(copied)
}

fn invalid(message: &str) -> NotebookError {
    io::Error::new(io::ErrorKind::InvalidInput, message.to_owned()).into()
}

/// File name of the contents page. It must not replace a page that happens to
/// be called "index": the first name no top-level page uses.
fn contents_file(pages: &[&IndexedPage]) -> String {
    let taken: HashSet<String> = pages
        .iter()
        .filter(|page| page.info.name.parts().count() == 1)
        .map(|page| page_file(&page.info.name).to_string_lossy().to_lowercase())
        .collect();
    ["index", "contents", "toc"]
        .iter()
        .map(|stem| format!("{stem}.html"))
        .find(|candidate| !taken.contains(candidate))
        .unwrap_or_else(|| "_contents_.html".to_owned())
}

/// Everything that is the same for all pages of one export.
struct Site<'a> {
    index: &'a Index,
    notebook: &'a Notebook,
    texts: &'a Texts,
    keys: Keys<'a>,
    destination: &'a Path,
    pages: Vec<&'a IndexedPage>,
    /// Name keys of the pages that are written.
    exported: HashSet<String>,
    notebook_name: String,
    footer: String,
    /// More than one page: a contents page is written and linked.
    with_contents: bool,
    contents_file: String,
}

impl Site<'_> {
    /// Breadcrumbs above a page: the contents page, then every ancestor.
    fn navigation(&self, name: &PageName, own_folder: &Path) -> Result<String, NotebookError> {
        let mut navigation = String::from("<nav>");
        if self.with_contents {
            navigation.push_str(&format!(
                "<a href=\"{}\">{}</a> › ",
                relative_link(own_folder, Path::new(&self.contents_file)),
                escape(&self.texts.contents)
            ));
        }
        let parts: Vec<&str> = name.parts().collect();
        for depth in 1..parts.len() {
            let ancestor = PageName::new(&parts[..depth].join(":"))?;
            let label = escape(parts[depth - 1]);
            if self.exported.contains(&ancestor.key()) {
                navigation.push_str(&format!(
                    "<a href=\"{}\">{label}</a> › ",
                    relative_link(own_folder, &page_file(&ancestor)),
                ));
            } else {
                navigation.push_str(&format!("{label} › "));
            }
        }
        navigation.push_str(&format!("{}</nav>\n", escape(name.basename())));
        Ok(navigation)
    }

    fn write_page(&self, page: &IndexedPage) -> Result<PathBuf, NotebookError> {
        let name = &page.info.name;
        let file = self.destination.join(page_file(name));
        if let Some(folder) = file.parent() {
            fs::create_dir_all(folder)?;
        }
        let targets = ExportTargets {
            notebook: self.notebook,
            index: self.index,
            page: name,
            exported: &self.exported,
        };
        let navigation = self.navigation(name, &targets.folder())?;
        let content = render_html(&page.body, &targets);
        let title = format!("{} · {}", name.basename(), self.notebook_name);
        let html = document(
            &self.texts.language,
            &title,
            &navigation,
            &content,
            &self.footer,
        );
        write_new_atomically(&file, html.as_bytes())?;
        Ok(file)
    }

    fn write_contents(&self) -> Result<PathBuf, NotebookError> {
        let mut root = ContentsNode::default();
        for page in &self.pages {
            root.insert(&page.info.name.parts().collect::<Vec<_>>(), &page.info.name);
        }
        let mut list = String::from("<ul class=\"tree\">");
        root.render(&mut list);
        list.push_str("</ul>\n");
        let content = format!("<h1>{}</h1>\n{list}", escape(&self.notebook_name));
        let file = self.destination.join(&self.contents_file);
        let html = document(
            &self.texts.language,
            &self.notebook_name,
            "",
            &content,
            &self.footer,
        );
        write_new_atomically(&file, html.as_bytes())?;
        Ok(file)
    }

    fn write_all(&self) -> Result<ExportReport, NotebookError> {
        let mut report = ExportReport {
            folder: self.destination.to_string_lossy().into_owned(),
            ..ExportReport::default()
        };
        for page in &self.pages {
            let file = self.write_page(page)?;
            report.pages += 1;
            if report.entry.is_empty() {
                report.entry = file.to_string_lossy().into_owned();
            }
        }
        // Attachments come after all pages, so one can never replace a page.
        for page in &self.pages {
            report.files +=
                copy_attachments(self.notebook, &page.info.name, self.destination, self.keys)?;
        }
        if self.with_contents {
            report.entry = self.write_contents()?.to_string_lossy().into_owned();
        }
        Ok(report)
    }
}

impl Index {
    /// Writes pages as HTML into `destination`, a folder that must not exist
    /// yet and must lie outside the notebook. `scope` limits the export to a
    /// page and everything below it. With keys the encrypted attachments
    /// are written decrypted; encrypted pages are exported only when the
    /// index holds their text.
    pub fn export_html_with<'k>(
        &self,
        notebook: &Notebook,
        scope: Option<&PageName>,
        destination: &Path,
        texts: &Texts,
        keys: impl Into<Keys<'k>>,
    ) -> Result<ExportReport, NotebookError> {
        if destination.exists() {
            return Err(NotebookError::AlreadyExists(destination.to_owned()));
        }
        let parent = destination
            .parent()
            .ok_or_else(|| invalid("the export folder needs a parent folder"))?;
        if fs::canonicalize(parent)?.starts_with(notebook.folder()) {
            return Err(invalid("the export folder must lie outside the notebook"));
        }
        let pages: Vec<&IndexedPage> = self
            .pages()
            .iter()
            // A locked page has no text to export.
            .filter(|page| page.info.has_content && !page.locked)
            .filter(|page| scope.is_none_or(|scope| page.info.name.is_within(scope)))
            .collect();
        if pages.is_empty() {
            return Err(
                io::Error::new(io::ErrorKind::NotFound, "there is no page to export").into(),
            );
        }
        let notebook_name = notebook.name();
        let site = Site {
            index: self,
            notebook,
            texts,
            keys: keys.into(),
            destination,
            exported: pages.iter().map(|page| page.info.name.key()).collect(),
            footer: format!(
                "<footer>{} · {}</footer>\n",
                escape(&notebook_name),
                escape(&texts.exported)
            ),
            notebook_name,
            with_contents: pages.len() > 1,
            contents_file: contents_file(&pages),
            pages,
        };
        // `create_dir` fails when something is already there, so a folder that
        // appeared since the check above is never written into, and what this
        // call created is removed again if the export breaks off half way.
        fs::create_dir(destination)?;
        let result = site.write_all();
        if result.is_err() {
            let _ = fs::remove_dir_all(destination);
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{index_with, notebook_with, page};

    fn texts() -> Texts {
        Texts {
            language: "de".to_owned(),
            contents: "Inhalt".to_owned(),
            exported: "Exportiert".to_owned(),
            print_hint: "Drucken mit Strg+P".to_owned(),
        }
    }

    fn export(
        index: &Index,
        notebook: &Notebook,
        scope: Option<&PageName>,
        destination: &Path,
    ) -> Result<ExportReport, NotebookError> {
        index.export_html_with(notebook, scope, destination, &texts(), None)
    }

    fn print(index: &Index, notebook: &Notebook, page: &PageName, body: &str) -> String {
        index.print_html_with(notebook, page, body, &texts(), None)
    }

    #[test]
    fn unlocked_exports_and_prints_include_encrypted_attachments() {
        let (dir, notebook) = notebook_with(&[]);
        let name = page("Private");
        let vault = notebook
            .create_vault("pw", crate::crypto::KdfParams::MINIMUM)
            .unwrap();
        let body = "Secret {{./image.png}} [[./note.bin]]";
        notebook
            .save_page_with(
                &name,
                body,
                crate::Expect::Missing,
                Some(&vault),
                crate::notebook::SaveMode::Encrypt,
            )
            .unwrap();
        notebook
            .attach_bytes_sealed(&name, "image.png", b"image contents", &vault)
            .unwrap();
        notebook
            .attach_bytes_sealed(&name, "note.bin", b"attachment contents", &vault)
            .unwrap();
        let index = Index::build_with(&notebook, None, Some(&vault)).unwrap();
        let out = dir.path().join("export");
        let report = index
            .export_html_with(&notebook, None, &out, &texts(), Some(&vault))
            .unwrap();
        assert_eq!(report.files, 2);
        assert_eq!(
            fs::read(out.join("Private/image.png")).unwrap(),
            b"image contents"
        );
        assert_eq!(
            fs::read(out.join("Private/note.bin")).unwrap(),
            b"attachment contents"
        );
        let printed = index.print_html_with(&notebook, &name, body, &texts(), Some(&vault));
        assert!(printed.contains(&format!(
            "data:image/png;base64,{}",
            crate::crypto::base64_encode(b"image contents")
        )));
        assert!(notebook.page_folder(&name).join("image.png.swenc").exists());
        assert!(!notebook.page_folder(&name).join("image.png").exists());
    }

    #[test]
    fn relative_links_between_pages() {
        assert_eq!(
            relative_link(Path::new("A"), Path::new("A/B.html")),
            "B.html"
        );
        assert_eq!(
            relative_link(Path::new("A/B"), Path::new("C/D E.html")),
            "../../C/D%20E.html"
        );
        assert_eq!(
            relative_link(Path::new(""), Path::new("Home.html")),
            "Home.html"
        );
    }

    #[test]
    fn exports_pages_attachments_and_an_index() {
        let (dir, notebook, index) = index_with(&[
            (
                "Home",
                "====== Home ======\nZu [[Projekt:Plan]] und [[Fehlt]].\n{{./bild.png?width=40}}\n[[./notiz.pdf|PDF]]",
            ),
            (
                "Projekt:Plan",
                "Zurück nach [[Home#home|Start]] und zu [[Teil eins]].",
            ),
            ("Projekt:Teil eins", "Text"),
        ]);
        let attachments = notebook.page_folder(&page("Home"));
        fs::create_dir_all(&attachments).unwrap();
        fs::write(attachments.join("bild.png"), b"png").unwrap();
        fs::write(attachments.join("notiz.pdf"), b"pdf").unwrap();
        let target = dir.path().join("export");

        let report = export(&index, &notebook, None, &target).unwrap();

        assert_eq!((report.pages, report.files), (3, 2));
        assert!(report.entry.ends_with("index.html"));
        let home = fs::read_to_string(target.join("Home.html")).unwrap();
        assert!(
            home.contains("<a href=\"Projekt/Plan.html\">Projekt:Plan</a>"),
            "{home}"
        );
        assert!(home.contains("<span class=\"nolink\">Fehlt</span>"));
        assert!(home.contains("<img src=\"Home/bild.png\" alt=\"\" width=\"40\">"));
        assert!(home.contains("<a href=\"Home/notiz.pdf\">PDF</a>"));
        assert!(target.join("Home").join("bild.png").exists());
        let plan = fs::read_to_string(target.join("Projekt").join("Plan.html")).unwrap();
        assert!(
            plan.contains("<a href=\"../Home.html#home\">Start</a>"),
            "{plan}"
        );
        assert!(plan.contains("<a href=\"Teil_eins.html\">Teil eins</a>"));
        assert!(plan.contains("<a href=\"../index.html\">Inhalt</a>"));
        let contents = fs::read_to_string(target.join("index.html")).unwrap();
        assert!(
            contents.contains("<li><a href=\"Home.html\">Home</a></li>"),
            "{contents}"
        );
        assert!(contents.contains("<a href=\"Projekt/Teil_eins.html\">Teil eins</a>"));

        // The notebook itself was not touched, and nothing is overwritten.
        assert!(!notebook.folder().join("index.html").exists());
        assert!(matches!(
            export(&index, &notebook, None, &target),
            Err(NotebookError::AlreadyExists(_))
        ));
        assert!(export(&index, &notebook, None, &notebook.folder().join("x")).is_err());
    }

    #[test]
    fn export_of_a_branch_and_printing() {
        let (dir, notebook, index) = index_with(&[
            ("Home", "[[Projekt]]"),
            ("Projekt", "[[Home]] {{./b.png}}"),
            ("Projekt:Kind", "k"),
        ]);
        fs::write(notebook.page_folder(&page("Projekt")).join("b.png"), b"abc").unwrap();

        let target = dir.path().join("teil");
        let report = export(&index, &notebook, Some(&page("Projekt")), &target).unwrap();
        assert_eq!(report.pages, 2);
        assert!(!target.join("Home.html").exists());
        let project = fs::read_to_string(target.join("Projekt.html")).unwrap();
        assert!(
            project.contains("<span class=\"nolink\">Home</span>"),
            "a page outside the export is not linked"
        );

        let single = dir.path().join("einzeln");
        let report = export(&index, &notebook, Some(&page("Projekt:Kind")), &single).unwrap();
        assert_eq!(report.pages, 1);
        assert!(
            report.entry.ends_with("Kind.html"),
            "one page needs no index"
        );

        let printed = print(&index, &notebook, &page("Projekt"), "[[Home]] {{./b.png}}");
        assert!(
            printed.contains("<img src=\"data:image/png;base64,YWJj\""),
            "{printed}"
        );
        assert!(printed.contains("Drucken mit Strg+P"));
        assert!(!printed.contains("href=\"Home"));
    }

    #[test]
    fn nothing_is_overwritten_and_failures_leave_no_folder() {
        let (dir, notebook) = notebook_with(&[
            ("Index", "eigene Seite"),
            ("Home", "[[Index]]"),
            ("Home:Sub", "Unterseite"),
        ]);
        // An attachment that bears the name of an exported page.
        let attachments = notebook.page_folder(&page("Home"));
        fs::create_dir_all(&attachments).unwrap();
        fs::write(attachments.join("Sub.html"), b"<script>boese()</script>").unwrap();
        let index = Index::build(&notebook, None).unwrap();

        let target = dir.path().join("export");
        let report = export(&index, &notebook, None, &target).unwrap();

        let own = fs::read_to_string(target.join("Index.html")).unwrap();
        assert!(
            own.contains("eigene Seite"),
            "the page called Index was replaced by the contents page"
        );
        assert!(report.entry.ends_with("contents.html"), "{}", report.entry);
        assert!(
            fs::read_to_string(target.join("contents.html"))
                .unwrap()
                .contains("Index.html")
        );
        let sub = fs::read_to_string(target.join("Home").join("Sub.html")).unwrap();
        assert!(
            sub.contains("Unterseite") && !sub.contains("boese"),
            "an attachment replaced a page"
        );
        assert_eq!(
            report.files, 0,
            "the clashing attachment must not be copied"
        );

        // A destination that appears later is refused, one inside the notebook too.
        let inside = notebook.folder().join("nope");
        assert!(export(&index, &notebook, None, &inside).is_err());
        assert!(!inside.exists());
        let missing_parent = dir.path().join("fehlt").join("export");
        assert!(export(&index, &notebook, None, &missing_parent).is_err());
        assert!(!dir.path().join("fehlt").exists());
    }

    #[cfg(unix)]
    #[test]
    fn linked_attachment_folders_and_files_are_not_followed() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let notebook = Notebook::create(&dir.path().join("nb"), "Buch").unwrap();
        let home = page("Home");
        notebook.save_page(&home, "text", Expect::Missing).unwrap();
        let secret = dir.path().join("secret.txt");
        fs::write(&secret, b"geheim").unwrap();
        let folder = notebook.page_folder(&home);
        fs::create_dir_all(&folder).unwrap();
        symlink(&secret, folder.join("link.txt")).unwrap();
        let index = Index::build(&notebook, None).unwrap();
        let target = dir.path().join("export");
        let report = export(&index, &notebook, None, &target).unwrap();
        assert_eq!(report.files, 0);
        assert!(!target.join("Home").join("link.txt").exists());
    }
}
