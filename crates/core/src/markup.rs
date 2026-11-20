//! The wiki syntax that more than one part of the core reads: lines, verbatim
//! blocks, headings, list items, tags, links and the plain-text form of
//! inline markup. The page scanner (index, tasks), the search preview and the
//! HTML export all go through these rules, so they cannot drift apart.
//! Rules: `.project/research/wiki-formatspezifikation.md`, chapter 3.

/// What a link target points at, decided by its shape alone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkKind {
    Page,
    Url,
    Mail,
    File,
    Interwiki,
}

pub(crate) fn is_word(character: char) -> bool {
    character.is_alphanumeric() || character == '_'
}

/// Number of leading tabs and the text behind them, white space at the end of
/// the line ignored.
pub(crate) fn indent_of(line: &str) -> (usize, &str) {
    let trimmed = line.trim_end();
    let content = trimmed.trim_start_matches('\t');
    (trimmed.len() - content.len(), content)
}

/// Closing line of the verbatim block or object that starts with `content`.
pub(crate) fn block_fence(content: &str) -> Option<&'static str> {
    if content == "'''" {
        Some("'''")
    } else if content.starts_with("{{{") && content.contains(':') {
        Some("}}}")
    } else {
        None
    }
}

/// Whether `line` closes a block opened with `fence` at tab depth `indent`.
pub(crate) fn closes_block(line: &str, indent: usize, fence: &str) -> bool {
    let (line_indent, content) = indent_of(line);
    line_indent == indent && content == fence
}

/// Decides the kind of a link target (format specification 3.10).
pub fn link_kind(target: &str) -> LinkKind {
    let lower = target.to_ascii_lowercase();
    if lower.starts_with("file:/") {
        return LinkKind::File;
    }
    if let Some(position) = target.find("://")
        && position > 0
        && target[..position]
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
    {
        return LinkKind::Url;
    }
    if lower.starts_with("mailto:") || looks_like_mail(target) {
        return LinkKind::Mail;
    }
    if lower.starts_with("www.") && target.matches('.').count() >= 2 {
        return LinkKind::Url;
    }
    if is_file_path(target) {
        return LinkKind::File;
    }
    if let Some((key, rest)) = target.split_once('?')
        && !key.is_empty()
        && !rest.is_empty()
        && key
            .chars()
            .all(|c| is_word(c) || matches!(c, '+' | '-' | '.'))
    {
        return LinkKind::Interwiki;
    }
    LinkKind::Page
}

fn is_file_path(target: &str) -> bool {
    let bytes = target.as_bytes();
    let drive = bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/');
    drive
        || target.starts_with("\\\\")
        || ["/", "./", "../", ".\\", "..\\", "~"]
            .iter()
            .any(|prefix| target.starts_with(prefix))
}

fn looks_like_mail(target: &str) -> bool {
    let address = target.split('?').next().unwrap_or("");
    let Some((local, domain)) = address.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && local
            .chars()
            .all(|c| is_word(c) || matches!(c, '.' | '-' | '+'))
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && domain.chars().all(|c| is_word(c) || matches!(c, '.' | '-'))
}

/// Heading level and text of a line, if it is a heading.
pub(crate) fn heading_of(line: &str) -> Option<(u8, &str)> {
    let marks = line.len() - line.trim_start_matches('=').len();
    if marks < 2 {
        return None;
    }
    let rest = &line[marks..];
    if !rest.starts_with([' ', '\t']) {
        return None;
    }
    let text = rest.trim().trim_end_matches('=').trim_end();
    if text.is_empty() {
        return None;
    }
    Some((7 - marks.min(6) as u8, text))
}

/// The marker in front of a list item.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Marker<'a> {
    Bullet,
    /// Check box with its state character (` `, `*`, `x`, `>`, `<`).
    Checkbox(char),
    /// First marker of a numbered or lettered list, without the dot.
    Numbered(&'a str),
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ListItem<'a> {
    /// Number of leading tabs.
    pub indent: usize,
    pub marker: Marker<'a>,
    /// Text behind the marker, with markup.
    pub text: &'a str,
}

/// The list item a line makes, if it is one.
pub(crate) fn list_item(line: &str) -> Option<ListItem<'_>> {
    let content = line.trim_start_matches('\t');
    let indent = line.len() - content.len();
    // A check box marker holds a blank itself, so it is cut by length.
    let split = if content.starts_with('[')
        && content.is_char_boundary(3)
        && content[3..].starts_with([' ', '\t'])
    {
        3
    } else {
        content.find([' ', '\t'])?
    };
    let (marker, text) = (&content[..split], content[split..].trim_start());
    let marker = match marker {
        "*" | "•" => Marker::Bullet,
        "[ ]" => Marker::Checkbox(' '),
        "[*]" => Marker::Checkbox('*'),
        "[x]" => Marker::Checkbox('x'),
        "[>]" => Marker::Checkbox('>'),
        "[<]" => Marker::Checkbox('<'),
        _ => {
            let counter = marker.strip_suffix('.')?;
            let numbered = !counter.is_empty() && counter.chars().all(|c| c.is_ascii_digit());
            let lettered = counter.len() == 1 && counter.chars().all(|c| c.is_ascii_alphabetic());
            if !(numbered || lettered) {
                return None;
            }
            Marker::Numbered(counter)
        }
    };
    Some(ListItem {
        indent,
        marker,
        text,
    })
}

/// Name of the tag that starts with the `@` at the front of `rest`.
pub(crate) fn tag_name(rest: &str) -> Option<&str> {
    let name = rest.strip_prefix('@')?;
    let end = name.find(|c| !is_word(c)).unwrap_or(name.len());
    (end > 0).then(|| &name[..end])
}

/// Text between `[[` and `]]` at the front of `rest`, and what follows. A
/// third `[` makes it no link. `failed` remembers that no closing `]]` is
/// left: it is then missing for every later opening too, and searching
/// again from each of them would be quadratic.
pub(crate) fn link_at<'a>(rest: &'a str, failed: &mut bool) -> Option<(&'a str, &'a str)> {
    let after = rest
        .strip_prefix("[[")
        .filter(|after| !after.starts_with('['))?;
    if *failed {
        return None;
    }
    let Some(end) = after.find("]]") else {
        *failed = true;
        return None;
    };
    Some((&after[..end], &after[end + 2..]))
}

/// Target and optional label of the text inside `[[…]]`.
pub(crate) fn split_link(inner: &str) -> (&str, Option<&str>) {
    let inner = inner.trim_matches('|');
    match inner.split_once('|') {
        Some((target, label)) => (target.trim(), Some(label)),
        None => (inner.trim(), None),
    }
}

/// Removes inline markup so text reads the way it is displayed.
pub fn plain_text(text: &str) -> String {
    const MARKERS: [&str; 5] = ["**", "//", "__", "~~", "''"];
    let mut output = String::with_capacity(text.len());
    let mut rest = text;
    let (mut link_failed, mut image_failed) = (false, false);
    while !rest.is_empty() {
        if let Some((inner, after)) = link_at(rest, &mut link_failed) {
            let (target, label) = split_link(inner);
            output.push_str(label.unwrap_or(target));
            rest = after;
        } else if let Some((_, after)) = image_at(rest, &mut image_failed) {
            rest = after;
        } else if let Some(marker) = MARKERS.iter().find(|marker| rest.starts_with(**marker)) {
            // `//` behind a colon belongs to a URL scheme.
            if *marker == "//" && output.ends_with(':') {
                output.push_str(marker);
            }
            rest = &rest[2..];
        } else {
            let character = rest.chars().next().expect("rest is not empty");
            output.push(character);
            rest = &rest[character.len_utf8()..];
        }
    }
    output.trim().to_owned()
}

/// Text between `{{` and `}}` at the front of `rest`, and what follows; see
/// [`link_at`] for `failed`.
pub(crate) fn image_at<'a>(rest: &'a str, failed: &mut bool) -> Option<(&'a str, &'a str)> {
    let after = rest.strip_prefix("{{")?;
    if *failed {
        return None;
    }
    let Some(end) = after.find("}}") else {
        *failed = true;
        return None;
    };
    Some((&after[..end], &after[end + 2..]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn link_kinds_follow_the_shape_of_the_target() {
        for (target, kind) in [
            ("Seite", LinkKind::Page),
            (":Projekt:Plan", LinkKind::Page),
            ("+Unterseite", LinkKind::Page),
            ("Seite#anker", LinkKind::Page),
            ("https://example.org/a?b=c", LinkKind::Url),
            ("www.example.org", LinkKind::Url),
            ("mailto:a@example.org", LinkKind::Mail),
            ("a.b@example.org", LinkKind::Mail),
            ("./bild.png", LinkKind::File),
            ("../a/b.pdf", LinkKind::File),
            ("/dokumente/a.pdf", LinkKind::File),
            ("~/notiz.txt", LinkKind::File),
            ("C:\\Daten\\a.txt", LinkKind::File),
            ("file:///C:/a.txt", LinkKind::File),
            ("\\\\server\\share", LinkKind::File),
            ("wp?Berlin", LinkKind::Interwiki),
        ] {
            assert_eq!(link_kind(target), kind, "{target}");
        }
    }

    #[test]
    fn plain_text_keeps_words_and_urls() {
        assert_eq!(
            plain_text("**a** //b// [[Z|Text]] [[Seite]] ''c'' http://x.org {{./b.png}}"),
            "a b Text Seite c http://x.org"
        );
    }

    #[test]
    fn list_items_know_their_marker() {
        let marker = |line| list_item(line).map(|item| (item.indent, item.marker, item.text));
        assert_eq!(marker("\t* Punkt"), Some((1, Marker::Bullet, "Punkt")));
        assert_eq!(marker("• Punkt"), Some((0, Marker::Bullet, "Punkt")));
        assert_eq!(
            marker("[*]\terledigt"),
            Some((0, Marker::Checkbox('*'), "erledigt"))
        );
        assert_eq!(
            marker("12. zwölf"),
            Some((0, Marker::Numbered("12"), "zwölf"))
        );
        assert_eq!(
            marker("b. Buchstabe"),
            Some((0, Marker::Numbered("b"), "Buchstabe"))
        );
        for not_a_list in ["*kein Punkt", "aa. zwei", "1a. x", "[?] x", "text", ""] {
            assert_eq!(marker(not_a_list), None, "{not_a_list:?}");
        }
    }

    #[test]
    fn tags_links_and_fences_are_recognised() {
        assert_eq!(tag_name("@tag_1 rest"), Some("tag_1"));
        assert_eq!(tag_name("@ nope"), None);
        let mut failed = false;
        assert_eq!(link_at("[[A|B]] x", &mut failed), Some(("A|B", " x")));
        assert_eq!(link_at("[[[A]]", &mut failed), None);
        assert!(!failed);
        assert_eq!(link_at("[[offen", &mut failed), None);
        assert!(failed);
        assert_eq!(split_link("|Ziel | Text|"), ("Ziel", Some(" Text")));
        assert_eq!(split_link(" Ziel "), ("Ziel", None));
        assert_eq!(block_fence("'''"), Some("'''"));
        assert_eq!(block_fence("{{{code: lang=\"x\""), Some("}}}"));
        assert_eq!(block_fence("{{{kein Objekt"), None);
        assert!(closes_block("\t}}}  ", 1, "}}}"));
        assert!(!closes_block("}}}", 1, "}}}"));
    }
}
