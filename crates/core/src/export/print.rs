//! One page as a single HTML document with its pictures embedded, made for
//! printing from a browser.

use super::html::{document, escape};
use super::{Targets, Texts, render_html};
use crate::crypto::{Keys, base64_encode};
use crate::{Index, Notebook, PageName};

/// Pictures up to this size are embedded into a page made for printing.
const MAX_EMBEDDED_PICTURE: u64 = 8 * 1024 * 1024;

impl Index {
    /// `body` is the text of `page` as the editor shows it; with keys the
    /// pictures of an encrypted page are embedded too.
    pub fn print_html_with<'k>(
        &self,
        notebook: &Notebook,
        page: &PageName,
        body: &str,
        texts: &Texts,
        keys: impl Into<Keys<'k>>,
    ) -> String {
        let targets = PrintTargets {
            notebook,
            page,
            keys: keys.into(),
        };
        let content = render_html(body, &targets);
        let hint = format!("<p class=\"hint\">{}</p>\n", escape(&texts.print_hint));
        let title = format!("{} · {}", page.basename(), notebook.name());
        document(&texts.language, &title, &hint, &content, "")
    }
}

/// Links lead nowhere on paper; pictures are embedded as `data:` addresses.
struct PrintTargets<'a> {
    notebook: &'a Notebook,
    page: &'a PageName,
    keys: Keys<'a>,
}

impl Targets for PrintTargets<'_> {
    fn picture(&self, source: &str) -> Option<String> {
        let path = self.notebook.resolve_file(self.page, source)?;
        let bytes = self
            .notebook
            .read_picture(self.page, source, self.keys)
            .ok()?;
        if bytes.len() as u64 > MAX_EMBEDDED_PICTURE {
            return None;
        }
        let kind = match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            "svg" => "image/svg+xml",
            "ico" => "image/x-icon",
            "avif" => "image/avif",
            _ => return None,
        };
        Some(format!("data:{kind};base64,{}", base64_encode(&bytes)))
    }
}
