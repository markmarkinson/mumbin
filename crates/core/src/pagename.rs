//! Page names and their mapping to files inside a notebook folder.
//!
//! A page name is a list of parts separated by `:`; `Projects:Garden` is the
//! page `Garden` below `Projects`. The empty name is the notebook root.
//! Rules follow `.project/research/wiki-formatspezifikation.md`, section 1.3.

use std::fmt;
use std::path::{Path, PathBuf};

use unicode_normalization::UnicodeNormalization;

/// Characters that may not appear anywhere in a page name.
const FORBIDDEN: &[char] = &[
    '?', '#', '/', '\\', '*', '"', '<', '>', '|', '%', '\t', '\n', '\r',
];

/// Device names Windows reserves regardless of extension.
pub(crate) const WINDOWS_RESERVED: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// Why a string is not usable as a page name.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PageNameError {
    #[error("page name is empty")]
    Empty,
    #[error("page name contains an empty part")]
    EmptyPart,
    #[error("page name contains the forbidden character {0:?}")]
    ForbiddenChar(char),
    #[error("part {0:?} does not start with a letter or digit")]
    BadStart(String),
    #[error("part {0:?} cannot be stored as a file name on Windows")]
    NotStorable(String),
    #[error("page nesting exceeds 128 levels")]
    TooDeep,
}

/// A validated, normalised page name. The root is the empty name.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct PageName(String);

impl PageName {
    /// The notebook root, which has no page file of its own.
    pub fn root() -> Self {
        PageName(String::new())
    }

    /// Accepts only a name that is already in canonical form.
    pub fn new(name: &str) -> Result<Self, PageNameError> {
        if name.is_empty() {
            return Err(PageNameError::Empty);
        }
        if name.split(':').count() > 128 {
            return Err(PageNameError::TooDeep);
        }
        for part in name.split(':') {
            validate_part(part)?;
        }
        Ok(PageName(name.to_owned()))
    }

    /// Cleans up something a person typed or a link target: stray colons,
    /// forbidden characters and underscores (which mean spaces) are fixed
    /// instead of rejected.
    pub fn from_input(input: &str) -> Result<Self, PageNameError> {
        let parts: Vec<String> = input.split(':').filter_map(clean_part).collect();
        if parts.is_empty() {
            return Err(PageNameError::Empty);
        }
        PageName::new(&parts.join(":"))
    }

    pub fn is_root(&self) -> bool {
        self.0.is_empty()
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn parts(&self) -> impl Iterator<Item = &str> {
        self.0.split(':').filter(|part| !part.is_empty())
    }

    /// Last part, the name shown in the page tree.
    pub fn basename(&self) -> &str {
        self.0.rsplit(':').next().unwrap_or("")
    }

    /// Parent page; the parent of a top-level page is the root.
    pub fn parent(&self) -> PageName {
        match self.0.rfind(':') {
            Some(index) => PageName(self.0[..index].to_owned()),
            None => PageName::root(),
        }
    }

    /// Child page below this one. `part` must be a single valid part.
    pub fn child(&self, part: &str) -> Result<PageName, PageNameError> {
        validate_part(part)?;
        if self.parts().count() >= 128 {
            return Err(PageNameError::TooDeep);
        }
        if self.is_root() {
            Ok(PageName(part.to_owned()))
        } else {
            Ok(PageName(format!("{}:{}", self.0, part)))
        }
    }

    /// The name as the file system compares it, see [`name_key`].
    pub fn key(&self) -> String {
        name_key(&self.0)
    }

    /// True when `self` is `other` or lies below it, compared without case.
    pub fn is_within(&self, other: &PageName) -> bool {
        let (own, other) = (self.key(), other.key());
        other.is_empty()
            || own == other
            || own
                .strip_prefix(&other)
                .is_some_and(|rest| rest.starts_with(':'))
    }

    /// The name this page has after `from` was moved to `to`; a page outside `from` keeps its name.
    pub fn relocated(&self, from: &PageName, to: &PageName) -> PageName {
        if !self.is_within(from) {
            return self.clone();
        }
        self.parts()
            .skip(from.parts().count())
            .try_fold(to.clone(), |moved, part| moved.child(part))
            .unwrap_or_else(|_| self.clone())
    }

    /// Folder that holds this page's sub-pages and attachments, relative to
    /// the notebook folder. Empty for the root.
    pub fn folder_path(&self) -> PathBuf {
        self.parts().map(|part| part.replace(' ', "_")).collect()
    }

    /// Page file relative to the notebook folder; `extension` includes the dot.
    pub fn file_path(&self, extension: &str) -> PathBuf {
        let mut path = self.folder_path();
        if let Some(name) = path.file_name() {
            let mut name = name.to_os_string();
            name.push(extension);
            path.set_file_name(name);
        }
        path
    }

    /// Maps a path relative to the notebook folder back to a page name.
    ///
    /// Returns `None` unless encoding the result gives the same path again;
    /// files with spaces or other unencodable names are attachments, not pages.
    /// With `extension = ""` the path is treated as a page folder.
    pub fn from_relative_path(path: &Path, extension: &str) -> Option<PageName> {
        let mut parts = Vec::new();
        let components: Vec<_> = path.iter().collect();
        for (index, component) in components.iter().enumerate() {
            let mut text = component.to_str()?;
            if index + 1 == components.len() {
                text = text.strip_suffix(extension)?;
            }
            parts.push(text.replace('_', " "));
        }
        let name = PageName::new(&parts.join(":")).ok()?;
        let round_trip = if extension.is_empty() {
            name.folder_path()
        } else {
            name.file_path(extension)
        };
        (round_trip == path).then_some(name)
    }

    /// Key for natural, case-insensitive ordering and comparison of this name.
    pub fn sort_key(&self) -> String {
        sort_key(&self.0)
    }
}

impl fmt::Display for PageName {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

fn validate_part(part: &str) -> Result<(), PageNameError> {
    let Some(first) = part.chars().next() else {
        return Err(PageNameError::EmptyPart);
    };
    if let Some(bad) = part.chars().find(|c| FORBIDDEN.contains(c) || *c == ':') {
        return Err(PageNameError::ForbiddenChar(bad));
    }
    if !first.is_alphanumeric() {
        return Err(PageNameError::BadStart(part.to_owned()));
    }
    // An underscore would silently turn into a space on the next read, and
    // surrounding spaces cannot be told apart in the tree.
    if part.contains('_') || part != part.trim() {
        return Err(PageNameError::BadStart(part.to_owned()));
    }
    if !is_storable(part) {
        return Err(PageNameError::NotStorable(part.to_owned()));
    }
    Ok(())
}

/// Windows drops trailing dots from folder names and refuses device names.
fn is_storable(part: &str) -> bool {
    // Leave four UTF-16 units for the .txt extension on Windows.
    if part.encode_utf16().count() > 251
        || part.ends_with('.')
        || part.chars().any(char::is_control)
    {
        return false;
    }
    let stem = part.split('.').next().unwrap_or(part).trim_end();
    !WINDOWS_RESERVED.contains(&stem.to_ascii_lowercase().as_str())
}

fn clean_part(raw: &str) -> Option<String> {
    let cleaned: String = raw
        .chars()
        .filter(|c| !FORBIDDEN.contains(c) && !c.is_control())
        .map(|c| if c == '_' { ' ' } else { c })
        .collect();
    let cleaned = cleaned
        .trim_start_matches(|c: char| !c.is_alphanumeric())
        .trim_end()
        .trim_end_matches('.')
        .trim_end();
    (!cleaned.is_empty()).then(|| cleaned.to_owned())
}

/// File identity is case-insensitive on Windows, but not numerically or
/// canonically equivalent: `1`/`01` and composed/decomposed accents can coexist.
pub fn name_key(text: &str) -> String {
    text.to_lowercase()
}

/// Natural sort key with unambiguous digit runs. Numeric ordering must never
/// make distinct file names (`1` and `01`) look identical to storage operations.
pub fn sort_key(text: &str) -> String {
    let normalised: String = text.trim().nfc().collect();
    let mut key = String::with_capacity(normalised.len() + 8);
    let mut digits = String::new();
    let flush = |digits: &mut String, key: &mut String| {
        if !digits.is_empty() {
            let significant = digits.trim_start_matches('0');
            key.push('\0');
            key.push_str(&format!("{:08x}", significant.len()));
            key.push_str(significant);
            key.push('\0');
            key.push_str(&format!("{:08x}", digits.len()));
            key.push_str(digits);
            key.push('\0');
            digits.clear();
        }
    };
    for c in normalised.chars() {
        if c.is_ascii_digit() {
            digits.push(c);
        } else {
            flush(&mut digits, &mut key);
            key.extend(c.to_lowercase());
        }
    }
    flush(&mut digits, &mut key);
    key
}

#[cfg(test)]
mod tests {
    use super::*;

    fn name(text: &str) -> PageName {
        PageName::new(text).unwrap()
    }

    #[test]
    fn accepts_ordinary_names() {
        for ok in [
            "Home",
            "Projekt A:Besprechung",
            "Überblick (alt)",
            "2026:11:13",
            "a.b-c",
        ] {
            assert!(PageName::new(ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn rejects_invalid_names() {
        assert_eq!(PageName::new(""), Err(PageNameError::Empty));
        assert_eq!(PageName::new("A::B"), Err(PageNameError::EmptyPart));
        assert_eq!(PageName::new(":A"), Err(PageNameError::EmptyPart));
        assert_eq!(PageName::new("A/B"), Err(PageNameError::ForbiddenChar('/')));
        assert_eq!(PageName::new("50%"), Err(PageNameError::ForbiddenChar('%')));
        assert!(matches!(
            PageName::new("_x"),
            Err(PageNameError::BadStart(_))
        ));
        assert!(matches!(
            PageName::new("A:.hidden"),
            Err(PageNameError::BadStart(_))
        ));
        assert!(matches!(
            PageName::new("A:.."),
            Err(PageNameError::BadStart(_))
        ));
        assert!(matches!(
            PageName::new("Mein_Name"),
            Err(PageNameError::BadStart(_))
        ));
        assert!(matches!(
            PageName::new("nul"),
            Err(PageNameError::NotStorable(_))
        ));
        assert!(matches!(
            PageName::new("COM1.txt"),
            Err(PageNameError::NotStorable(_))
        ));
        assert!(matches!(
            PageName::new("Ende."),
            Err(PageNameError::NotStorable(_))
        ));
    }

    #[test]
    fn cleans_up_typed_input() {
        let cases = [
            (":Foo::Bar:", "Foo:Bar"),
            ("Mein_Name", "Mein Name"),
            ("  Foo  :  Bar ", "Foo:Bar"),
            ("a/b?c", "abc"),
            ("_x:-y", "x:y"),
            ("../../etc", "etc"),
            ("Ende.", "Ende"),
        ];
        for (input, expected) in cases {
            assert_eq!(
                PageName::from_input(input).unwrap().as_str(),
                expected,
                "{input}"
            );
        }
        assert_eq!(PageName::from_input(":::"), Err(PageNameError::Empty));
        assert_eq!(PageName::from_input("?*"), Err(PageNameError::Empty));
    }

    #[test]
    fn navigates_the_hierarchy() {
        let page = name("A:B:C");
        assert_eq!(page.basename(), "C");
        assert_eq!(page.parent(), name("A:B"));
        assert_eq!(name("A").parent(), PageName::root());
        assert_eq!(PageName::root().child("A").unwrap(), name("A"));
        assert_eq!(name("A").child("B").unwrap(), name("A:B"));
        assert!(name("A").child("B:C").is_err());
        assert!(page.is_within(&name("A:B")));
        assert!(page.is_within(&PageName::root()));
        assert!(!name("A:Bx").is_within(&name("A:B")));
        assert!(name("a:b:c").is_within(&name("A:B")), "case is ignored");
    }

    #[test]
    fn maps_names_to_paths_and_back() {
        let page = name("Projekt A:Besprechung 1");
        let file = page.file_path(".txt");
        assert_eq!(file, Path::new("Projekt_A").join("Besprechung_1.txt"));
        assert_eq!(
            page.folder_path(),
            Path::new("Projekt_A").join("Besprechung_1")
        );
        assert_eq!(
            PageName::from_relative_path(&file, ".txt"),
            Some(page.clone())
        );
        assert_eq!(
            PageName::from_relative_path(&page.folder_path(), ""),
            Some(page)
        );
    }

    #[test]
    fn files_that_do_not_round_trip_are_not_pages() {
        for path in [
            "Mein Name.txt",
            "notes.md",
            ".hidden.txt",
            "50%25.txt",
            "_x.txt",
        ] {
            assert_eq!(
                PageName::from_relative_path(Path::new(path), ".txt"),
                None,
                "{path}"
            );
        }
    }

    #[test]
    fn distinct_numeric_names_never_share_an_identity() {
        for (left, right) in [
            ("Page1", "Page01"),
            ("001", "01"),
            ("0", "000"),
            ("1:Child", "01:Child"),
        ] {
            assert_ne!(sort_key(left), sort_key(right));
        }
        let mut names = vec![
            "Page100000",
            "Page9",
            "Page10000",
            "Page10",
            "Page01",
            "Page1",
        ];
        names.sort_by_key(|name| sort_key(name));
        assert_eq!(
            names,
            [
                "Page1",
                "Page01",
                "Page9",
                "Page10",
                "Page10000",
                "Page100000"
            ]
        );
    }

    #[test]
    fn sort_key_orders_numbers_naturally_and_ignores_case() {
        let mut names = vec!["Seite 10", "seite 9", "Seite 100", "Apfel", "apfel 2"];
        names.sort_by_key(|n| sort_key(n));
        assert_eq!(
            names,
            ["Apfel", "apfel 2", "seite 9", "Seite 10", "Seite 100"]
        );
        assert_eq!(sort_key("HOME"), sort_key("home"));
        assert_eq!(sort_key("e\u{301}"), sort_key("\u{e9}"));
    }
}
