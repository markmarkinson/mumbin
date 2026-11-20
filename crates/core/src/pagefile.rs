//! The on-disk form of a wiki page: a block of header lines, one blank line,
//! then the wiki text.
//!
//! Only the header is interpreted here. The body is handed to the editor as
//! written, so a page that is opened and saved without edits keeps its text
//! byte for byte.
//!
//! The header: `Content-Type: text/x-mumbin-page`, `Page-Format: mumbin 1`, `Creation-Date`
//! (decision E-027).

/// First header line every wiki page file must carry.
const CONTENT_TYPE: &str = "text/x-mumbin-page";
/// Format version written into every saved page.
const WIKI_FORMAT: &str = "mumbin 1";

const HEADER_CONTENT_TYPE: &str = "Content-Type";
const HEADER_WIKI_FORMAT: &str = "Page-Format";
const HEADER_CREATION_DATE: &str = "Creation-Date";
/// Written by very old versions; the file's own timestamp replaces it.
const HEADER_MODIFICATION_DATE: &str = "Modification-Date";

/// Line ending used when writing a page.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum EndOfLine {
    /// CRLF, the default on Windows.
    #[default]
    Dos,
    /// LF.
    Unix,
}

/// A parsed page file. Line endings in `body` are always `\n`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageFile {
    /// Headers other than `Content-Type` and `Page-Format`, in file order.
    pub extra_headers: Vec<(String, String)>,
    /// The `Page-Format` value found in the file, if any.
    pub format: Option<String>,
    pub body: String,
}

impl PageFile {
    /// The body is sealed text (header `Encrypted: swenc1`, `swenc2` or `swenc3`), not wiki text.
    pub fn is_encrypted(&self) -> bool {
        self.has_marker(crate::crypto::PAGE_HEADER_VALUE)
            || self.has_marker(crate::crypto::names::PAGE_HEADER_VALUE2)
            || self.is_own_password()
    }

    /// The page has a password of its own (`Encrypted: swenc3`) and needs no vault.
    pub fn is_own_password(&self) -> bool {
        self.has_marker(crate::crypto::PAGE_HEADER_VALUE3)
    }

    fn has_marker(&self, value: &str) -> bool {
        self.extra_headers
            .iter()
            .any(|(name, found)| name == crate::crypto::PAGE_HEADER && found == value)
    }

    /// Sets the header that marks the page as encrypted (`Encrypted: swenc1`, `swenc2` when
    /// the name is sealed too, `swenc3` for a password of the page's own), or removes it with `None`.
    pub fn set_encryption_marker(&mut self, value: Option<&str>) {
        self.extra_headers
            .retain(|(name, _)| name != crate::crypto::PAGE_HEADER);
        if let Some(value) = value {
            self.extra_headers
                .push((crate::crypto::PAGE_HEADER.to_owned(), value.to_owned()));
        }
    }

    /// A new page created now, with a `Creation-Date` header.
    pub fn new(body: &str, created: chrono::DateTime<chrono::Local>) -> Self {
        let stamp = created.format("%Y-%m-%dT%H:%M:%S%:z").to_string();
        PageFile {
            extra_headers: vec![(HEADER_CREATION_DATE.to_owned(), stamp)],
            format: Some(WIKI_FORMAT.to_owned()),
            body: normalise_text(body),
        }
    }

    /// Parses file content. Returns `None` when the file does not start with
    /// the wiki content type and therefore is an attachment, not a page.
    pub fn parse(raw: &str) -> Option<Self> {
        let text = normalise_text(raw);
        let mut lines = text.split_inclusive('\n');
        let mut consumed = 0;

        let first = lines.next()?;
        let (name, value) = split_header(first)?;
        if name != HEADER_CONTENT_TYPE || value != CONTENT_TYPE {
            return None;
        }
        consumed += first.len();

        let mut format = None;
        let mut extra_headers: Vec<(String, String)> = Vec::new();
        let mut last_was_format = false;
        for line in lines {
            let content = line.trim_end_matches('\n');
            if let Some((name, value)) = split_header(content) {
                last_was_format = name == HEADER_WIKI_FORMAT;
                if last_was_format {
                    format = Some(value.to_owned());
                } else {
                    extra_headers.push((name.to_owned(), value.to_owned()));
                }
            } else if content.starts_with([' ', '\t']) && !content.trim().is_empty() {
                // Continuation of the previous header value.
                let target = if last_was_format {
                    format.as_mut()
                } else {
                    extra_headers.last_mut().map(|(_, value)| value)
                };
                match target {
                    Some(value) => {
                        value.push('\n');
                        value.push_str(content.trim());
                    }
                    None => break,
                }
            } else {
                if content.trim().is_empty() {
                    consumed += line.len();
                }
                break;
            }
            consumed += line.len();
        }
        extra_headers.retain(|(name, _)| name != HEADER_MODIFICATION_DATE);

        Some(PageFile {
            extra_headers,
            format,
            body: text[consumed..].to_owned(),
        })
    }

    /// True when the header block of `raw` marks a wiki page. Cheap check for
    /// directory listings: only the first line matters.
    pub fn looks_like_page(first_bytes: &[u8]) -> bool {
        let text = String::from_utf8_lossy(first_bytes);
        let line = text
            .trim_start_matches('\u{feff}')
            .lines()
            .next()
            .unwrap_or("");
        split_header(line) == Some((HEADER_CONTENT_TYPE, CONTENT_TYPE))
    }

    /// Serialises the page. The body always ends with a line ending.
    pub fn serialise(&self, end_of_line: EndOfLine) -> String {
        let mut out = String::with_capacity(self.body.len() + 128);
        push_header(&mut out, HEADER_CONTENT_TYPE, CONTENT_TYPE);
        push_header(&mut out, HEADER_WIKI_FORMAT, WIKI_FORMAT);
        for (name, value) in &self.extra_headers {
            push_header(&mut out, name, value);
        }
        out.push('\n');
        out.push_str(&self.body);
        if !self.body.is_empty() && !self.body.ends_with('\n') {
            out.push('\n');
        }
        match end_of_line {
            EndOfLine::Unix => out,
            EndOfLine::Dos => out.replace('\n', "\r\n"),
        }
    }

    pub fn creation_date(&self) -> Option<&str> {
        self.extra_headers
            .iter()
            .find(|(name, _)| name == HEADER_CREATION_DATE)
            .map(|(_, value)| value.as_str())
    }
}

/// Removes a byte order mark and NUL characters and unifies line endings.
pub fn normalise_text(raw: &str) -> String {
    let raw = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    let mut text = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\0' => {}
            '\r' => {
                if chars.peek() != Some(&'\n') {
                    text.push('\n');
                }
            }
            '\u{2028}' => text.push('\n'),
            '\u{2029}' => text.push(' '),
            other => text.push(other),
        }
    }
    text
}

/// Splits `Name: value`; the name consists of word characters and `-`.
fn split_header(line: &str) -> Option<(&str, &str)> {
    let line = line.trim_end_matches('\n');
    let (name, rest) = line.split_once(':')?;
    let valid_name = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-');
    if !valid_name || !rest.starts_with([' ', '\t']) {
        return None;
    }
    Some((name, rest.trim()))
}

fn push_header(out: &mut String, name: &str, value: &str) {
    out.push_str(name);
    out.push_str(": ");
    out.push_str(&value.replace('\n', "\n\t"));
    out.push('\n');
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "Content-Type: text/x-mumbin-page\nPage-Format: mumbin 1\nCreation-Date: 2026-11-13T14:05:09+01:00\n\n====== Home ======\n\nHallo **Welt**\n";

    #[test]
    fn parses_a_standard_page() {
        let page = PageFile::parse(SAMPLE).unwrap();
        assert_eq!(page.format.as_deref(), Some("mumbin 1"));
        assert_eq!(page.creation_date(), Some("2026-11-13T14:05:09+01:00"));
        assert_eq!(page.body, "====== Home ======\n\nHallo **Welt**\n");
    }

    #[test]
    fn unchanged_page_round_trips_byte_for_byte() {
        let page = PageFile::parse(SAMPLE).unwrap();
        assert_eq!(page.serialise(EndOfLine::Unix), SAMPLE);
        let dos = SAMPLE.replace('\n', "\r\n");
        assert_eq!(
            PageFile::parse(&dos).unwrap().serialise(EndOfLine::Dos),
            dos
        );
    }

    #[test]
    fn files_without_the_content_type_are_not_pages() {
        assert!(PageFile::parse("Just some notes\n").is_none());
        assert!(PageFile::parse("").is_none());
        assert!(PageFile::parse("Content-Type: text/plain\n\nx\n").is_none());
        assert!(
            PageFile::parse("Page-Format: mumbin 1\nContent-Type: text/x-mumbin-page\n").is_none()
        );
        assert!(PageFile::looks_like_page(
            b"\xef\xbb\xbfContent-Type: text/x-mumbin-page\r\nWiki"
        ));
        assert!(!PageFile::looks_like_page(
            b"Content-Type: text/x-mumbin-pages"
        ));
    }

    #[test]
    fn tolerates_bom_nul_and_odd_line_separators() {
        let raw = "\u{feff}Content-Type: text/x-mumbin-page\r\n\r\na\0b\u{2028}c\u{2029}d\r\n";
        let page = PageFile::parse(raw).unwrap();
        assert_eq!(page.body, "ab\nc d\n");
    }

    #[test]
    fn keeps_unknown_headers_and_drops_modification_date() {
        let raw = "Content-Type: text/x-mumbin-page\nPage-Format: mumbin 0\nCreation-Date: Unknown\nModification-Date: Sat, 01 Jan 2011\nX-Custom: a\n b\n\nText\n";
        let page = PageFile::parse(raw).unwrap();
        assert_eq!(page.format.as_deref(), Some("mumbin 0"));
        assert_eq!(
            page.extra_headers,
            vec![
                ("Creation-Date".to_owned(), "Unknown".to_owned()),
                ("X-Custom".to_owned(), "a\nb".to_owned()),
            ]
        );
        assert_eq!(
            page.serialise(EndOfLine::Unix),
            "Content-Type: text/x-mumbin-page\nPage-Format: mumbin 1\nCreation-Date: Unknown\nX-Custom: a\n\tb\n\nText\n"
        );
    }

    #[test]
    fn header_block_ends_at_first_non_header_line() {
        let raw =
            "Content-Type: text/x-mumbin-page\nPage-Format: mumbin 1\nNo header here\n\nmore\n";
        let page = PageFile::parse(raw).unwrap();
        assert_eq!(page.body, "No header here\n\nmore\n");
        let headers_only = PageFile::parse("Content-Type: text/x-mumbin-page\n").unwrap();
        assert_eq!(headers_only.body, "");
        assert!(headers_only.body.trim().is_empty());
    }

    #[test]
    fn body_that_looks_like_a_header_survives() {
        let raw =
            "Content-Type: text/x-mumbin-page\nPage-Format: mumbin 1\n\nNote: remember this\n";
        let page = PageFile::parse(raw).unwrap();
        assert_eq!(page.body, "Note: remember this\n");
        assert_eq!(page.serialise(EndOfLine::Unix), raw);
    }

    #[test]
    fn new_page_gets_creation_date_and_trailing_newline() {
        use chrono::TimeZone;
        let when = chrono::Local
            .with_ymd_and_hms(2026, 11, 13, 14, 5, 9)
            .unwrap();
        let page = PageFile::new("Hallo", when);
        let text = page.serialise(EndOfLine::Unix);
        assert!(text.starts_with("Content-Type: text/x-mumbin-page\nPage-Format: mumbin 1\nCreation-Date: 2026-11-13T14:05:09"));
        assert!(text.ends_with("\n\nHallo\n"));
        let date = page.creation_date().unwrap();
        assert_eq!(date.len(), "2026-11-13T14:05:09+01:00".len());
    }

    #[test]
    fn the_encryption_header_says_which_kind_of_protection_a_page_has() {
        for (value, encrypted, own) in [
            ("swenc1", true, false),
            ("swenc2", true, false),
            ("swenc3", true, true),
            ("swenc4", false, false),
        ] {
            let raw = format!(
                "Content-Type: text/x-mumbin-page\nPage-Format: mumbin 1\nEncrypted: {value}\n\nSWENC\n"
            );
            let page = PageFile::parse(&raw).unwrap();
            assert_eq!(
                (page.is_encrypted(), page.is_own_password()),
                (encrypted, own)
            );
        }
        let mut page = PageFile::parse(SAMPLE).unwrap();
        page.set_encryption_marker(Some("swenc3"));
        assert!(page.is_own_password());
        page.set_encryption_marker(None);
        assert!(!page.is_encrypted());
    }
}
