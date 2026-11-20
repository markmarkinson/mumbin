//! Notebook search with the query language of the format specification,
//! chapter 5: words and phrases, `AND`/`OR`/`NOT`, `+`/`-`, groups and the
//! keywords `Content:`, `Name:`, `Section:`, `Tag:`, `Tags:`, `LinksFrom:`,
//! `LinksTo:` and `Any:`.

mod query;
mod text;

use serde::Serialize;

use crate::PageName;
use crate::index::{Index, IndexedPage};
use crate::markup::{heading_of, plain_text};
use query::{Field, Node, parse};
use text::{count_in_text, name_matches};

/// Queries longer than this are not run.
const MAX_QUERY_LEN: usize = 4096;
/// What a hit in a name or a tag is worth; a hit in the text counts once per
/// occurrence.
const NAME_OR_TAG_SCORE: usize = 10;
/// Characters of the preview line.
const PREVIEW_LEN: usize = 180;

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SearchHit {
    pub name: String,
    pub preview: String,
}

#[derive(Debug, Serialize, Default)]
pub struct SearchResults {
    pub hits: Vec<SearchHit>,
    pub total: usize,
}

/// Score of `node` for `page`; zero means no match.
fn score(index: &Index, node: &Node, page: &IndexedPage) -> usize {
    match node {
        Node::Not(inner) => usize::from(score(index, inner, page) == 0),
        Node::And(parts) => {
            let mut total = 0;
            for part in parts {
                match score(index, part, page) {
                    0 => return 0,
                    part_score => total += part_score,
                }
            }
            total
        }
        Node::Or(parts) => parts.iter().map(|part| score(index, part, page)).sum(),
        Node::Match {
            field,
            text,
            exact_case,
        } => field_score(index, *field, text, *exact_case, page),
    }
}

fn field_score(
    index: &Index,
    field: Field,
    text: &str,
    exact_case: bool,
    page: &IndexedPage,
) -> usize {
    let weigh = |hit: bool| if hit { NAME_OR_TAG_SCORE } else { 0 };
    match field {
        Field::Any => {
            let tag = text.trim_start_matches('@').to_lowercase();
            field_score(index, Field::Name, text, exact_case, page)
                + field_score(index, Field::Content, text, exact_case, page)
                + weigh(page.scan.tags.contains(&tag))
        }
        Field::Content if exact_case => count_in_text(&page.body, text),
        Field::Content => count_in_text(&page.lower, &text.to_lowercase()),
        Field::Name => {
            let name = page.info.name.as_str();
            weigh(if exact_case {
                name_matches(name, text)
            } else {
                name_matches(&name.to_lowercase(), &text.to_lowercase())
            })
        }
        Field::Section => usize::from(in_section(page, text)),
        Field::Tag => weigh(
            page.scan
                .tags
                .contains(&text.trim_matches('@').to_lowercase()),
        ),
        Field::Tags => weigh(has_tag_like(page, text)),
        Field::LinksFrom => usize::from(is_linked_from(index, page, text)),
        Field::LinksTo => usize::from(links_to(page, text)),
    }
}

/// The page is the named section or lies below it.
fn in_section(page: &IndexedPage, section: &str) -> bool {
    let Ok(section) = PageName::from_input(section) else {
        return false;
    };
    page.info.name.is_within(&section)
}

/// `@tag` finds tags that start with it, `@tag@` only that tag.
fn has_tag_like(page: &IndexedPage, text: &str) -> bool {
    let exact = text.len() > 1 && text.ends_with('@');
    let tag = text.trim_matches('@').to_lowercase();
    page.scan.tags.iter().any(|own| {
        if exact {
            *own == tag
        } else {
            own.starts_with(&tag)
        }
    })
}

/// The named page links to `page`.
fn is_linked_from(index: &Index, page: &IndexedPage, source: &str) -> bool {
    let Ok(source) = PageName::from_input(source) else {
        return false;
    };
    let own = page.info.name.key();
    index
        .page(&source)
        .is_some_and(|source| source.links.iter().any(|target| target.key() == own))
}

/// `page` links to the named page.
fn links_to(page: &IndexedPage, target: &str) -> bool {
    let Ok(target) = PageName::from_input(target) else {
        return false;
    };
    let wanted = target.key();
    page.links.iter().any(|link| link.key() == wanted)
}

/// First positive plain term of the query, for the preview line.
fn preview_term(node: &Node) -> Option<String> {
    match node {
        Node::Match {
            field: Field::Any | Field::Content,
            text,
            ..
        } => Some(text.trim().trim_matches('*').to_lowercase()),
        Node::Match { .. } | Node::Not(_) => None,
        Node::And(parts) | Node::Or(parts) => parts.iter().find_map(preview_term),
    }
}

fn preview(page: &IndexedPage, term: Option<&str>) -> String {
    let line = term
        .filter(|term| !term.is_empty())
        .and_then(|term| {
            page.body
                .lines()
                .find(|line| line.to_lowercase().contains(term))
        })
        .or_else(|| {
            // Without a hit in the text, show the first line that is not the title.
            page.body
                .lines()
                .filter(|line| !line.trim().is_empty())
                .find(|line| heading_of(line).is_none())
        })
        .unwrap_or("");
    plain_text(line).chars().take(PREVIEW_LEN).collect()
}

impl Index {
    /// Runs `query` and returns at most `limit` hits, best first.
    pub fn search(&self, query: &str, limit: usize) -> SearchResults {
        if query.len() > MAX_QUERY_LEN || query.trim().is_empty() {
            return SearchResults::default();
        }
        let node = parse(query);
        let term = preview_term(&node);
        let mut hits: Vec<(usize, &IndexedPage)> = self
            .pages()
            .iter()
            .filter(|page| page.info.has_content)
            .filter_map(|page| {
                let score = score(self, &node, page);
                (score > 0).then_some((score, page))
            })
            .collect();
        hits.sort_by(|a, b| {
            b.0.cmp(&a.0)
                .then_with(|| a.1.info.name.sort_key().cmp(&b.1.info.name.sort_key()))
        });
        SearchResults {
            total: hits.len(),
            hits: hits
                .into_iter()
                .take(limit)
                .map(|(_, page)| SearchHit {
                    name: page.info.name.to_string(),
                    preview: preview(page, term.as_deref()),
                })
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::notebook_with;

    #[test]
    fn deep_queries_are_bounded() {
        let index = Index::default();
        for query in [
            "(".repeat(4000),
            "-".repeat(4000),
            "NOT ".repeat(1000),
            "x".repeat(100_000),
        ] {
            assert_eq!(index.search(&query, 10).total, 0);
        }
    }

    fn notebook() -> (tempfile::TempDir, Index) {
        let (dir, notebook) = notebook_with(&[
            (
                "Home",
                "Überblick Garten. Monday is a day. [[Projekt:Idee]] @home",
            ),
            (
                "Projekt:Idee",
                "GARTEN Plan für die days im daylight @homework @garten",
            ),
            ("Projekt:Haus", "Das Haus, nicht der Garten! [[:Home]]"),
            ("Garten", "Titel passt"),
            ("Leer:Unter", "nichts"),
        ]);
        std::fs::write(notebook.folder().join("attachment.txt"), "Garten").unwrap();
        let index = Index::build(&notebook, None).unwrap();
        (dir, index)
    }

    fn names(index: &Index, query: &str) -> Vec<String> {
        let mut found: Vec<String> = index
            .search(query, 200)
            .hits
            .into_iter()
            .map(|hit| hit.name)
            .collect();
        found.sort();
        found
    }

    #[test]
    fn plain_words_match_names_and_content_without_case() {
        let (_dir, index) = notebook();
        assert_eq!(
            names(&index, "garten"),
            ["Garten", "Home", "Projekt:Haus", "Projekt:Idee"]
        );
        assert_eq!(names(&index, "überblick"), ["Home"]);
        assert_eq!(names(&index, "  "), Vec::<String>::new());
        assert_eq!(names(&index, "fehlt"), Vec::<String>::new());
        assert_eq!(index.search("garten", 2).total, 4);
        assert_eq!(index.search("garten", 2).hits.len(), 2);
        // Tag and text together outrank a name alone; a name outranks text alone.
        let ranked: Vec<String> = index
            .search("garten", 4)
            .hits
            .into_iter()
            .map(|hit| hit.name)
            .collect();
        assert_eq!(ranked[..2], ["Projekt:Idee", "Garten"]);
    }

    #[test]
    fn operators_groups_and_negation() {
        let (_dir, index) = notebook();
        assert_eq!(names(&index, "garten haus"), ["Projekt:Haus"]);
        assert_eq!(names(&index, "garten AND haus"), ["Projekt:Haus"]);
        assert_eq!(names(&index, "überblick OR titel"), ["Garten", "Home"]);
        assert_eq!(
            names(&index, "garten -haus"),
            ["Garten", "Home", "Projekt:Idee"]
        );
        assert_eq!(
            names(&index, "garten NOT haus"),
            ["Garten", "Home", "Projekt:Idee"]
        );
        assert_eq!(
            names(&index, "garten (überblick OR plan)"),
            ["Home", "Projekt:Idee"]
        );
        assert_eq!(names(&index, "\"nicht der garten\""), ["Projekt:Haus"]);
        assert_eq!(
            names(&index, "\"haus nicht\""),
            ["Projekt:Haus"],
            "a blank spans punctuation"
        );
        assert_eq!(
            names(&index, "OR garten AND"),
            names(&index, "garten"),
            "stray operators are ignored"
        );
    }

    #[test]
    fn wildcards_bind_to_word_boundaries() {
        let (_dir, index) = notebook();
        assert_eq!(names(&index, "content: day"), ["Home", "Projekt:Idee"]);
        assert_eq!(names(&index, "content: *day"), ["Home"]);
        assert_eq!(names(&index, "content: day*"), ["Home", "Projekt:Idee"]);
        assert_eq!(names(&index, "content: dayl*"), ["Projekt:Idee"]);
    }

    #[test]
    fn keywords() {
        let (_dir, index) = notebook();
        assert_eq!(names(&index, "name: idee"), ["Projekt:Idee"]);
        assert_eq!(names(&index, "Name:garten"), ["Garten"]);
        assert_eq!(names(&index, "content:=GARTEN"), ["Projekt:Idee"]);
        assert_eq!(
            names(&index, "section: Projekt"),
            ["Projekt:Haus", "Projekt:Idee"]
        );
        assert_eq!(
            names(&index, "namespace: projekt garten"),
            ["Projekt:Haus", "Projekt:Idee"]
        );
        assert_eq!(names(&index, "tag: home"), ["Home"]);
        assert_eq!(names(&index, "@home"), ["Home", "Projekt:Idee"]);
        assert_eq!(names(&index, "@home@"), ["Home"]);
        assert_eq!(names(&index, "linksto: Home"), ["Projekt:Haus"]);
        assert_eq!(names(&index, "linksfrom: Home"), ["Projekt:Idee"]);
        assert_eq!(names(&index, "name:(projekt -haus)"), ["Projekt:Idee"]);
        assert_eq!(names(&index, "kein:schluessel"), Vec::<String>::new());
    }

    #[test]
    fn preview_shows_the_matching_line_without_markup() {
        let (_dir, index) = notebook();
        let hit = &index.search("überblick", 10).hits[0];
        assert_eq!(
            hit.preview,
            "Überblick Garten. Monday is a day. Projekt:Idee @home"
        );
    }

    #[test]
    fn name_patterns_work_in_a_search() {
        let (_dir, index) = notebook();
        assert_eq!(
            names(&index, "name: ::projekt:+"),
            ["Projekt:Haus", "Projekt:Idee"]
        );
        assert_eq!(names(&index, "name: ::garten::"), ["Garten"]);
        assert_eq!(names(&index, "name: :haus"), ["Projekt:Haus"]);
        assert_eq!(
            names(&index, "name: ::leer:+"),
            ["Leer:Unter"],
            "only the sub-page of a page without content"
        );
    }
}
