//! Reads the structure out of wiki text without building a document tree:
//! links, tags and task lines. The index, the search and the task
//! list work on this. Rules: `.project/research/wiki-formatspezifikation.md`,
//! chapters 3 and 6.

use std::collections::HashSet;

use crate::markup::heading_of;
pub use crate::markup::{LinkKind, link_kind, plain_text};
use crate::markup::{
    Marker, block_fence, closes_block, indent_of, is_word, link_at, list_item, split_link, tag_name,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkRef {
    /// Target as written, including an anchor part.
    pub target: String,
    pub kind: LinkKind,
    pub line: usize,
}

/// A line that may be a task: a checkbox item or a line starting with a label.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskLine {
    pub line: usize,
    /// Number of leading tabs.
    pub indent: usize,
    /// Checkbox character (` `, `*`, `x`, `>`, `<`), or `None` for a label line.
    pub state: Option<char>,
    /// Text behind the marker, with markup.
    pub text: String,
}

impl TaskLine {
    /// A line that is a task only because it starts with a label.
    fn label(line: usize, indent: usize, text: &str) -> Self {
        TaskLine {
            line,
            indent,
            state: None,
            text: text.to_owned(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PageScan {
    pub links: Vec<LinkRef>,
    /// Tags without the `@`, in order of first appearance, lower-cased, unique.
    pub tags: Vec<String>,
    pub tasks: Vec<TaskLine>,
}

/// Labels that turn a plain line into a task.
const TASK_LABELS: [&str; 2] = ["TODO", "FIXME"];

/// True when `text` starts with one of the task labels as a whole word.
fn starts_with_label(text: &str) -> bool {
    TASK_LABELS.iter().any(|label| {
        text.strip_prefix(label)
            .is_some_and(|rest| !rest.starts_with(is_word))
    })
}

/// Links and tags of one line of text.
fn scan_inline(line: &str, number: usize, scan: &mut PageScan) {
    let mut rest = line;
    let mut previous: Option<char> = None;
    let mut verbatim = false;
    let mut link_failed = false;
    while !rest.is_empty() {
        if let Some(after) = rest.strip_prefix("''") {
            verbatim = !verbatim;
            previous = Some('\'');
            rest = after;
            continue;
        }
        if !verbatim {
            if let Some((inner, after)) = link_at(rest, &mut link_failed) {
                let (target, label) = split_link(inner);
                if !target.is_empty() {
                    scan.links.push(LinkRef {
                        target: target.to_owned(),
                        kind: link_kind(target),
                        line: number,
                    });
                }
                // Tags may appear in the link text.
                if let Some(label) = label {
                    scan_inline(label, number, scan);
                }
                previous = Some(']');
                rest = after;
                continue;
            }
            if previous.is_none_or(char::is_whitespace)
                && let Some(name) = tag_name(rest)
            {
                // Duplicates are removed once per page (`scan_page`); checking
                // the list for every tag is quadratic for pages full of tags.
                scan.tags.push(name.to_lowercase());
                previous = name.chars().last();
                rest = &rest[1 + name.len()..];
                continue;
            }
        }
        let character = rest.chars().next().expect("rest is not empty");
        previous = Some(character);
        rest = &rest[character.len_utf8()..];
    }
}

/// Scans a page body (`\n` line endings).
pub fn scan_page(body: &str) -> PageScan {
    let mut scan = PageScan::default();
    // Fence and tab depth of the verbatim block or object we are inside of.
    let mut inside: Option<(&str, usize)> = None;
    for (number, line) in body.lines().enumerate() {
        let (indent, content) = indent_of(line);
        if let Some((fence, fence_indent)) = inside {
            if closes_block(line, fence_indent, fence) {
                inside = None;
            }
            continue;
        }
        if let Some(fence) = block_fence(content) {
            inside = Some((fence, indent));
            continue;
        }
        if let Some((_, text)) = heading_of(line) {
            if starts_with_label(text) {
                scan.tasks.push(TaskLine::label(number, 0, text));
            }
            scan_inline(text, number, &mut scan);
            continue;
        }
        if let Some(item) = list_item(line) {
            let state = match item.marker {
                Marker::Checkbox(state) => Some(state),
                Marker::Bullet | Marker::Numbered(_) => None,
            };
            if state.is_some() || starts_with_label(item.text) {
                scan.tasks.push(TaskLine {
                    line: number,
                    indent: item.indent,
                    state,
                    text: item.text.to_owned(),
                });
            }
        } else if starts_with_label(content) {
            scan.tasks.push(TaskLine::label(number, indent, content));
        }
        scan_inline(line, number, &mut scan);
    }
    let mut seen = HashSet::new();
    scan.tags.retain(|tag| seen.insert(tag.clone()));
    scan
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_tags_and_tasks_are_found() {
        let scan = scan_page(
            "====== Titel **fett** ======\n\
             Text mit [[Ziel|Label @imtext]] und [[https://example.org]] @Eins @eins\n\
             mail@example.org ist kein Tag\n\
             [ ] offen !\n\
             \t[*] erledigt @zwei\n\
             * TODO: Punkt\n\
             * normaler Punkt\n\
             FIXME kaputt\n\
             TODOS zählt nicht\n\
             == TODO Abschnitt ==\n",
        );
        assert_eq!(
            scan.links
                .iter()
                .map(|l| (l.target.as_str(), l.kind))
                .collect::<Vec<_>>(),
            [
                ("Ziel", LinkKind::Page),
                ("https://example.org", LinkKind::Url)
            ]
        );
        assert_eq!(scan.tags, ["imtext", "eins", "zwei"]);
        assert_eq!(
            scan.tasks
                .iter()
                .map(|t| (t.line, t.indent, t.state, t.text.as_str()))
                .collect::<Vec<_>>(),
            [
                (3, 0, Some(' '), "offen !"),
                (4, 1, Some('*'), "erledigt @zwei"),
                (5, 0, None, "TODO: Punkt"),
                (7, 0, None, "FIXME kaputt"),
                (9, 0, None, "TODO Abschnitt"),
            ]
        );
    }

    #[test]
    fn verbatim_text_and_objects_are_skipped() {
        let scan = scan_page(
            "'''\n[[Nicht]] @nicht\n[ ] nicht\n'''\n\
             ''[[Auch nicht]] @nein'' aber [[Doch]]\n\
             {{{code: lang=\"x\"\n[[Nein]]\n}}}\n\
             [[Ende]]\n",
        );
        assert_eq!(
            scan.links
                .iter()
                .map(|l| l.target.as_str())
                .collect::<Vec<_>>(),
            ["Doch", "Ende"]
        );
        assert!(scan.tags.is_empty());
        assert!(scan.tasks.is_empty());
    }
}
