//! Export to HTML: turns wiki text into a web page and writes pages, their
//! attachments and an index into a folder outside the notebook, or renders
//! one page for printing.
//!
//! The renderer follows `.project/research/wiki-formatspezifikation.md`,
//! chapter 3. Everything taken from a page is escaped; only web, mail and
//! file addresses become links.

mod blocks;
mod html;
mod inline;
mod print;
mod site;

use serde::{Deserialize, Serialize};

pub use blocks::render_html;

/// Decides where links and pictures of the page being rendered lead. Without an
/// answer a link or picture is shown as plain text.
pub trait Targets {
    /// Address for a link to another page.
    fn page(&self, _target: &str) -> Option<String> {
        None
    }
    /// Address for a link to a file.
    fn file(&self, _target: &str) -> Option<String> {
        None
    }
    /// Address of a picture.
    fn picture(&self, _source: &str) -> Option<String> {
        None
    }
}

/// Targets that link nowhere.
pub struct NoTargets;

impl Targets for NoTargets {}

/// Words of the exported pages that are not part of the notes.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Texts {
    pub language: String,
    pub contents: String,
    pub exported: String,
    pub print_hint: String,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub pages: usize,
    pub files: usize,
    /// Folder that was written.
    pub folder: String,
    /// File to open first.
    pub entry: String,
}
