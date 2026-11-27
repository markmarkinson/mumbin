//! Inline markup of one line: formats, code, links, pictures, anchors, tags
//! and bare web addresses.

use super::Targets;
use super::html::{escape, safe_url};
use crate::markup::{LinkKind, image_at, is_word, link_at, link_kind, split_link, tag_name};

/// Lines longer than this are written as plain text. Looking for closing
/// markers costs time that grows with the square of the line length.
const MAX_MARKUP_LINE: usize = 20_000;

/// Opening marker, closing marker, element and whether the closing marker
/// may follow a colon (`//` would end at the `//` of a web address).
const FORMATS: [(&str, &str, &str, bool); 6] = [
    ("//", "//", "em", true),
    ("**", "**", "strong", false),
    ("__", "__", "mark", false),
    ("_{", "}", "sub", false),
    ("^{", "}", "sup", false),
    ("~~", "~~", "s", false),
];

/// Renders one line of text with inline markup. Inside a link text no
/// further links or pictures are made.
pub(super) fn inline(text: &str, targets: &dyn Targets, inside_link: bool, output: &mut String) {
    if text.len() > MAX_MARKUP_LINE {
        output.push_str(&escape(text));
        return;
    }
    let mut line = Line {
        targets,
        inside_link,
        output,
        plain: String::new(),
        rest: text,
        previous: None,
        link_failed: false,
        image_failed: false,
    };
    while !line.rest.is_empty() {
        let handled = line.bare_url()
            || line.code()
            || line.link()
            || line.picture_or_anchor()
            || line.tag()
            || line.format();
        if !handled {
            line.plain_character();
        }
    }
    line.flush();
}

/// The line being rendered, with what is left of it. Every `try`-style method
/// either renders the construct at the front of `rest` and returns `true`, or
/// leaves everything as it was.
struct Line<'a, 'o> {
    targets: &'a dyn Targets,
    inside_link: bool,
    output: &'o mut String,
    /// Text not yet escaped and written.
    plain: String,
    rest: &'a str,
    /// Character before `rest`, for the rules that depend on it.
    previous: Option<char>,
    /// A search for the closing `]]` or `}}` came up empty; see [`link_at`].
    link_failed: bool,
    image_failed: bool,
}

impl<'a> Line<'a, '_> {
    fn flush(&mut self) {
        if !self.plain.is_empty() {
            self.output.push_str(&escape(&self.plain));
            self.plain.clear();
        }
    }

    /// Writes finished HTML and moves on to `rest`.
    fn emit(&mut self, html: &str, rest: &'a str, last: Option<char>) {
        self.flush();
        self.output.push_str(html);
        self.rest = rest;
        self.previous = last;
    }

    fn plain_character(&mut self) {
        let character = self.rest.chars().next().expect("rest is not empty");
        self.plain.push(character);
        self.previous = Some(character);
        self.rest = &self.rest[character.len_utf8()..];
    }

    fn bare_url(&mut self) -> bool {
        let at_word_start = self.previous.is_none_or(|c| !is_word(c) && c != '/');
        if self.inside_link || !at_word_start {
            return false;
        }
        let Some(length) = bare_url_length(self.rest) else {
            return false;
        };
        let address = &self.rest[..length];
        let html = match safe_url(address) {
            Some(href) => format!(
                "<a href=\"{}\" rel=\"noopener noreferrer\">{}</a>",
                escape(&href),
                escape(address)
            ),
            None => escape(address),
        };
        self.emit(&html, &self.rest[length..], address.chars().last());
        true
    }

    fn code(&mut self) -> bool {
        let Some(after) = self.rest.strip_prefix("''") else {
            return false;
        };
        if after.starts_with('\'') {
            return false;
        }
        let Some(end) = closing(after, "''", false) else {
            return false;
        };
        let html = format!("<code>{}</code>", escape(&after[..end]));
        self.emit(&html, &after[end + 2..], Some('\''));
        true
    }

    fn link(&mut self) -> bool {
        if self.inside_link {
            return false;
        }
        let Some((inner, after)) = link_at(self.rest, &mut self.link_failed) else {
            return false;
        };
        let (target, label) = split_link(inner);
        if target.is_empty() {
            return false;
        }
        let label = label.map_or(target, |label| label.trim_matches('|'));
        let mut shown = String::new();
        inline(label, self.targets, true, &mut shown);
        let html = match self.href(target) {
            Some(href) => format!("<a href=\"{}\">{shown}</a>", escape(&href)),
            None => format!("<span class=\"nolink\">{shown}</span>"),
        };
        self.emit(&html, after, Some(']'));
        true
    }

    fn href(&self, target: &str) -> Option<String> {
        match link_kind(target) {
            LinkKind::Page => self.targets.page(target),
            LinkKind::Url => safe_url(target),
            LinkKind::Mail if target.to_ascii_lowercase().starts_with("mailto:") => {
                Some(target.to_owned())
            }
            LinkKind::Mail => Some(format!("mailto:{target}")),
            LinkKind::File => self.targets.file(target),
            LinkKind::Interwiki => None,
        }
    }

    fn picture_or_anchor(&mut self) -> bool {
        let Some((inner, after)) =
            image_at(self.rest, &mut self.image_failed).filter(|_| !self.rest.starts_with("{{{"))
        else {
            return false;
        };
        let html = if let Some(name) = anchor_name(inner) {
            format!("<a id=\"{}\"></a>", escape(name))
        } else if let Some(picture) = parse_picture(inner).filter(|_| !self.inside_link) {
            picture_html(&picture, self.targets)
        } else {
            return false;
        };
        self.emit(&html, after, Some('}'));
        true
    }

    fn tag(&mut self) -> bool {
        if !self.previous.is_none_or(char::is_whitespace) {
            return false;
        }
        let Some(name) = tag_name(self.rest) else {
            return false;
        };
        let html = format!("<span class=\"tag\">@{}</span>", escape(name));
        self.emit(&html, &self.rest[1 + name.len()..], name.chars().last());
        true
    }

    fn format(&mut self) -> bool {
        for (open, close, element, not_after_colon) in FORMATS {
            let Some(after) = self.rest.strip_prefix(open) else {
                continue;
            };
            if after.starts_with(open.chars().next().expect("markers are not empty"))
                || (open == "//" && self.previous == Some(':'))
            {
                continue;
            }
            let Some(end) = closing(after, close, not_after_colon) else {
                continue;
            };
            let mut html = format!("<{element}>");
            inline(&after[..end], self.targets, self.inside_link, &mut html);
            html.push_str(&format!("</{element}>"));
            self.emit(&html, &after[end + close.len()..], close.chars().last());
            return true;
        }
        false
    }
}

/// Length of a bare web address at the start of `text`, without trailing
/// punctuation that belongs to the sentence.
fn bare_url_length(text: &str) -> Option<usize> {
    let start: String = text
        .chars()
        .take(8)
        .collect::<String>()
        .to_ascii_lowercase();
    if !["https://", "http://", "www."]
        .iter()
        .any(|scheme| start.starts_with(scheme))
    {
        return None;
    }
    let mut end = text
        .char_indices()
        .find(|(_, c)| c.is_whitespace() || *c == '<')
        .map_or(text.len(), |(index, _)| index);
    while let Some(last) = text[..end].chars().last() {
        let candidate = &text[..end];
        let unbalanced =
            last == ')' && candidate.matches(')').count() > candidate.matches('(').count();
        if !(unbalanced
            || matches!(
                last,
                '?' | '!' | '.' | ',' | ':' | '*' | '_' | '~' | '\'' | '"'
            ))
        {
            break;
        }
        end -= last.len_utf8();
    }
    (end > 7 || (start.starts_with("www.") && end > 5)).then_some(end)
}

/// Position of the closing marker of an inline format in `text`.
fn closing(text: &str, marker: &str, not_after_colon: bool) -> Option<usize> {
    let mut from = 0;
    while let Some(found) = text[from..].find(marker) {
        let position = from + found;
        if position > 0 && !(not_after_colon && text[..position].ends_with(':')) {
            return Some(position);
        }
        from = position + marker.len();
    }
    None
}

struct Picture<'a> {
    source: &'a str,
    width: Option<u32>,
    height: Option<u32>,
    alt: &'a str,
}

fn parse_picture(inner: &str) -> Option<Picture<'_>> {
    let (address, alt) = inner.split_once('|').unwrap_or((inner, ""));
    let address = address.trim();
    let (source, options) = match address.find('?') {
        Some(position) if position > 0 => (&address[..position], &address[position + 1..]),
        _ => (address, ""),
    };
    if source.is_empty() {
        return None;
    }
    let number = |name: &str| {
        options
            .split('&')
            .find_map(|pair| pair.strip_prefix(name)?.strip_prefix('='))
            .and_then(|value| value.parse::<u32>().ok())
            .filter(|value| (1..=20_000).contains(value))
    };
    Some(Picture {
        source,
        width: number("width"),
        height: number("height"),
        alt,
    })
}

fn picture_html(picture: &Picture<'_>, targets: &dyn Targets) -> String {
    let Some(source) = targets.picture(picture.source) else {
        let shown = if picture.alt.is_empty() {
            picture.source
        } else {
            picture.alt
        };
        return format!("<span class=\"nolink\">[{}]</span>", escape(shown));
    };
    let mut html = format!(
        "<img src=\"{}\" alt=\"{}\"",
        escape(&source),
        escape(picture.alt)
    );
    for (name, size) in [("width", picture.width), ("height", picture.height)] {
        if let Some(size) = size {
            html.push_str(&format!(" {name}=\"{size}\""));
        }
    }
    html.push('>');
    html
}

/// Name of an anchor written as `{{id: name}}`.
fn anchor_name(inner: &str) -> Option<&str> {
    let name = inner.strip_prefix("id:")?;
    if !name.starts_with(char::is_whitespace) {
        return None;
    }
    let name = name.trim();
    (name.len() >= 2 && name.chars().all(|c| is_word(c) || c == '-')).then_some(name)
}
