//! Randomised input against the parts that read text nobody vetted: page
//! names, page files, the wiki scanner, the HTML export, link resolution and
//! the query language. Not a coverage-guided fuzzer, but the same idea with
//! no extra tools: many generated inputs, fixed seeds so a failure repeats,
//! and properties that must hold for every input (no panic, no path that
//! leaves the notebook, no script in an export, bounded time).

use std::path::Component;
use std::time::{Duration, Instant};

use mumbin_core::export::{NoTargets, render_html};
use mumbin_core::links::PageTree;
use mumbin_core::pagefile::{EndOfLine, PageFile};
use mumbin_core::scan::{link_kind, plain_text, scan_page};
use mumbin_core::template::{Context, render};
use mumbin_core::{Expect, Index, Notebook, PageInfo, PageName};

/// Fails when `started` is longer ago than `limit`.
fn assert_within(limit: Duration, started: Instant, what: &str) {
    assert!(
        started.elapsed() < limit,
        "{what} took {:?}",
        started.elapsed()
    );
}

/// xorshift64*: small, deterministic, good enough to mix tokens.
struct Random(u64);

impl Random {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    fn below(&mut self, limit: usize) -> usize {
        (self.next() % limit as u64) as usize
    }

    fn pick<'a>(&mut self, items: &[&'a str]) -> &'a str {
        items[self.below(items.len())]
    }
}

/// Pieces of wiki text, markup and hostile content, glued together at random.
const TOKENS: &[&str] = &[
    "a",
    "b",
    "Garten",
    "Zeile",
    " ",
    "  ",
    "\t",
    "\n",
    "\n\n",
    "\r\n",
    "**",
    "//",
    "__",
    "~~",
    "''",
    "'''",
    "^{",
    "_{",
    "}",
    "{{",
    "}}",
    "{{{",
    "}}}",
    "[[",
    "]]",
    "[",
    "]",
    "|",
    "||",
    ":",
    "::",
    "+",
    "-",
    "*",
    "?",
    "#",
    "@tag",
    "@",
    "= ",
    " =",
    "====== ",
    " ======",
    "* ",
    "1. ",
    "a. ",
    "[ ] ",
    "[*] ",
    "[x] ",
    "[>] ",
    "-----",
    "| a | b |",
    "|:--|--:|",
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(2)>",
    "\"",
    "'",
    "&",
    "<",
    ">",
    "javascript:alert(1)",
    "javascript://x%0Aalert(3)",
    "data://text/html,<script>",
    "vbscript://x",
    "http://example.org/a_(b)",
    "https://x.y",
    "www.example.org",
    "mailto:a@b.de",
    "a@b.de",
    "file:///C:/x",
    "\\\\server\\share\\f",
    "C:\\x",
    "../../x",
    "./b.png",
    "{{./b.png?width=40}}",
    "{{id: x}}",
    "[[Home]]",
    "[[Projekt:Plan|Text]]",
    "[[+Unter]]",
    "[[:Abs]]",
    "[[#anker]]",
    "[[2026-11-14]]",
    "TODO: ",
    "<2026-11-20",
    ">2026-12-01",
    "!!",
    "\u{0}",
    "\u{202e}",
    "\u{feff}",
    "ä",
    "ß",
    "日本",
    "🙂",
];

/// Between `least` and `most` tokens glued together.
fn random_text(random: &mut Random, least: usize, most: usize) -> String {
    let pieces = least + random.below(most - least + 1);
    (0..pieces).map(|_| random.pick(TOKENS)).collect()
}

const QUERY_PIECES: &[&str] = &[
    "garten",
    "seite",
    "OR",
    "AND",
    "NOT",
    "-",
    "+",
    "(",
    ")",
    "\"",
    "'",
    "*",
    ":",
    "::",
    ":+",
    "name:",
    "content:",
    "section:",
    "tag:",
    "tags:",
    "linksto:",
    "linksfrom:",
    "any:",
    ":=",
    "@",
    "@tag",
    " ",
    "a*",
    "*a*a*a*a*a*a*a*b",
    "日本",
];

#[test]
fn page_names_never_lead_out_of_the_notebook() {
    let mut random = Random(0x5EED_0001);
    for _ in 0..20_000 {
        let text = random_text(&mut random, 1, 6);
        for parsed in [PageName::new(&text), PageName::from_input(&text)] {
            let Ok(name) = parsed else { continue };
            if name.is_root() {
                continue;
            }
            for part in name.parts() {
                assert!(
                    !part.is_empty() && part != "." && part != "..",
                    "bad part in {name:?} from {text:?}"
                );
                assert!(
                    !part.contains(['/', '\\', '\0', '<', '>', '|', '?', '*', '"']),
                    "{name:?} from {text:?}"
                );
            }
            let path = name.file_path(".txt");
            assert!(
                path.components()
                    .all(|component| matches!(component, Component::Normal(_))),
                "{name:?} gives the path {path:?}"
            );
        }
    }
}

#[test]
fn page_files_survive_a_round_trip() {
    let mut random = Random(0x5EED_0002);
    for _ in 0..5_000 {
        let header = random.pick(&[
            "Content-Type: text/x-mumbin-page\nPage-Format: mumbin 1\n\n",
            "Content-Type: text/x-mumbin-page\r\n\r\n",
            "",
            "x\n\n",
        ]);
        let raw = format!("{header}{}", random_text(&mut random, 0, 40));
        let Some(file) = PageFile::parse(&raw) else {
            continue;
        };
        // Writing may tidy a page once (a final line break, no control characters);
        // after that, writing and reading must not change it any more.
        let write = |file: &PageFile| file.serialise(EndOfLine::Unix);
        let once =
            PageFile::parse(&write(&file)).expect("what the program writes it can read again");
        let twice = PageFile::parse(&write(&once)).expect("and again");
        assert_eq!(
            twice.body, once.body,
            "the text keeps changing when written and read: {raw:?}"
        );
        assert_eq!(write(&twice), write(&once));
    }
}

#[test]
fn the_scanner_reads_anything_in_time() {
    let mut random = Random(0x5EED_0003);
    let started = Instant::now();
    for _ in 0..3_000 {
        let body = random_text(&mut random, 0, 80);
        let scan = scan_page(&body);
        for link in &scan.links {
            let _ = link_kind(&link.target);
        }
        let _ = plain_text(&body);
    }
    assert_within(Duration::from_secs(20), started, "scanning");
}

/// Tags and attributes an export may contain.
const TAGS: &[&str] = &[
    "p", "br", "strong", "em", "mark", "s", "code", "sub", "sup", "a", "img", "h1", "h2", "h3",
    "h4", "h5", "hr", "ul", "ol", "li", "span", "pre", "table", "thead", "tbody", "tr", "th", "td",
];
const ATTRIBUTES: &[&str] = &[
    "href", "rel", "src", "alt", "width", "id", "class", "start", "type", "title",
];

/// Reads the tags of an HTML fragment, quotes respected, and checks each one.
fn check_markup(html: &str, source: &str) {
    let chars: Vec<char> = html.chars().collect();
    let mut at = 0;
    while at < chars.len() {
        if chars[at] != '<' {
            at += 1;
            continue;
        }
        let mut end = at + 1;
        let mut quote = false;
        while end < chars.len() && (quote || chars[end] != '>') {
            if chars[end] == '"' {
                quote = !quote;
            }
            end += 1;
        }
        assert!(
            end < chars.len() && !quote,
            "a tag is not closed in {html:?} from {source:?}"
        );
        let inside: String = chars[at + 1..end].iter().collect();
        let inside = inside.trim_start_matches('/');
        let name: String = inside
            .chars()
            .take_while(char::is_ascii_alphanumeric)
            .collect();
        assert!(
            TAGS.contains(&name.as_str()),
            "tag <{name}> in {html:?} from {source:?}"
        );
        let mut rest = &inside[name.len()..];
        while let Some((attribute, tail)) = rest.trim_start().split_once('=') {
            let attribute = attribute.trim();
            assert!(
                ATTRIBUTES.contains(&attribute),
                "attribute {attribute:?} in {html:?} from {source:?}"
            );
            let tail = tail
                .strip_prefix('"')
                .unwrap_or_else(|| panic!("unquoted attribute value in {html:?} from {source:?}"));
            let close = tail
                .find('"')
                .unwrap_or_else(|| panic!("open quote in {html:?} from {source:?}"));
            let value = tail[..close].trim().to_lowercase();
            if matches!(attribute, "href" | "src") {
                assert!(
                    !value.starts_with("javascript:")
                        && !value.starts_with("data:")
                        && !value.starts_with("vbscript:")
                        && !value.starts_with("file:")
                        && !value.starts_with('\\'),
                    "dangerous {attribute}={value:?} in {html:?} from {source:?}"
                );
            }
            rest = &tail[close + 1..];
        }
        at = end + 1;
    }
}

#[test]
fn an_export_never_contains_script_or_loose_markup() {
    let mut random = Random(0x5EED_0004);
    let started = Instant::now();
    for _ in 0..3_000 {
        let body = random_text(&mut random, 0, 80);
        let html = render_html(&body, &NoTargets);
        check_markup(&html, &body);
    }
    assert_within(Duration::from_secs(20), started, "rendering");
}

#[test]
fn links_resolve_to_valid_names() {
    let pages: Vec<PageInfo> = ["Home", "Projekt", "Projekt:Plan", "Projekt:Plan:Teil"]
        .iter()
        .map(|name| PageInfo {
            name: PageName::new(name).unwrap(),
            has_content: true,
            has_children: false,
        })
        .collect();
    let tree = PageTree::new(pages);
    let mut random = Random(0x5EED_0005);
    let sources = [
        PageName::root(),
        PageName::new("Home").unwrap(),
        PageName::new("Projekt:Plan:Teil").unwrap(),
    ];
    for _ in 0..20_000 {
        let target = random_text(&mut random, 1, 6);
        let source = &sources[random.below(sources.len())];
        if let Ok(name) = tree.resolve(source, &target) {
            for part in name.parts() {
                assert!(
                    !part.is_empty() && part != ".." && !part.contains(['/', '\\']),
                    "{name:?} from {target:?}"
                );
            }
            assert!(
                name.file_path(".txt")
                    .components()
                    .all(|c| matches!(c, Component::Normal(_)))
            );
        }
    }
}

#[test]
fn any_query_is_answered_quickly() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::create(dir.path(), "Fuzz").unwrap();
    let mut random = Random(0x5EED_0006);
    for number in 0..60 {
        let name = PageName::new(&format!("Seite {number}")).unwrap();
        let body = format!(
            "{}\n{}",
            random_text(&mut random, 30, 30),
            "garten ".repeat(40)
        );
        notebook.save_page(&name, &body, Expect::Missing).unwrap();
    }
    let index = Index::build(&notebook, None).unwrap();
    let started = Instant::now();
    for _ in 0..4_000 {
        let query: String = (0..=random.below(8))
            .map(|_| random.pick(QUERY_PIECES))
            .collect::<Vec<_>>()
            .join(" ");
        let one = Instant::now();
        let _ = index.search(&query, 20);
        assert_within(Duration::from_secs(2), one, &format!("the query {query:?}"));
    }
    assert_within(Duration::from_secs(30), started, "queries");
}

#[test]
fn random_templates_are_refused_or_finished_in_time() {
    const PIECES: &[&str] = &[
        "[%",
        "%]",
        "[%-",
        "-%]",
        " ",
        "\n",
        "IF ",
        "ELIF ",
        "ELSIF ",
        "ELSE",
        "END",
        "FOR ",
        "FOREACH ",
        " IN ",
        "BLOCK x",
        "INCLUDE ",
        "SET ",
        "x",
        "y",
        "page.name",
        "page.basename",
        "strftime('%A %d %B %Y')",
        "strftime(",
        "gettext('Created')",
        "place_cursor()",
        "range(100)",
        "range(1000000)",
        "len(",
        "'",
        "\"",
        "(",
        ")",
        "[",
        "]",
        ",",
        ".",
        "=",
        "==",
        "!=",
        "<",
        ">",
        "and",
        "or",
        "not",
        "True",
        "False",
        "None",
        "1",
        "99999999999999999999",
        "x.upper()",
        "loop.count",
        "<!--",
        "-->",
        "日本",
        "🙂",
    ];
    let page = PageName::new("Projekt:Plan").unwrap();
    let now = chrono::NaiveDate::from_ymd_opt(2026, 11, 14)
        .unwrap()
        .and_hms_opt(9, 5, 7)
        .unwrap();
    let mut random = Random(0x5EED_0007);
    let started = Instant::now();
    for _ in 0..6_000 {
        let pieces = 1 + random.below(30);
        let template: String = (0..pieces).map(|_| random.pick(PIECES)).collect();
        let one = Instant::now();
        let _ = render(
            &template,
            &Context {
                page: &page,
                language: "de",
                now,
            },
        );
        assert_within(
            Duration::from_secs(2),
            one,
            &format!("the template {template:?}"),
        );
    }
    assert_within(Duration::from_secs(30), started, "templates");
}
