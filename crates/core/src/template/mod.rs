//! Page templates: the small template language that new pages need (format specification,
//! chapter 8).
//!
//! Supported: `[% … %]` directives with `-` white-space control; `GET`, `SET`,
//! `IF`/`ELIF`/`ELSIF`/`ELSE`, `FOR`/`FOREACH`, `END`; expressions with strings,
//! numbers, `True`/`False`/`None`, lists, attributes, calls, `and`/`or`/`not` and
//! comparisons; `strftime`, `gettext`, `len`, `range`, `place_cursor` and a few
//! string methods. Not supported (reported as an error): `BLOCK`, `INCLUDE`.
//!
//! A template is untrusted text: it can name no file and call nothing that
//! touches the system, and its work is limited in steps and in output size.

mod calendar;
mod eval;
mod expr;
mod lexer;
mod parse;
mod value;

use std::collections::BTreeMap;

use chrono::NaiveDateTime;

use crate::PageName;
use eval::Engine;
use value::Value;

const MAX_STEPS: usize = 200_000;
const MAX_OUTPUT: usize = 1 << 20;
const MAX_TEMPLATE: usize = 1 << 20;
const MAX_DEPTH: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum TemplateError {
    #[error("template: {0}")]
    Syntax(String),
    #[error("template: too much work")]
    TooBig,
}

fn syntax<T>(message: impl Into<String>) -> Result<T, TemplateError> {
    Err(TemplateError::Syntax(message.into()))
}

/// What a template makes of a page: its text and where the cursor goes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rendered {
    pub text: String,
    /// Offset in characters, `None` when the template did not place it (the end then).
    pub cursor: Option<usize>,
}

impl Rendered {
    /// The cursor as a position in UTF-16 units, which is what the editor counts in.
    pub fn cursor_utf16(&self) -> usize {
        match self.cursor {
            Some(chars) => self.text.chars().take(chars).map(char::len_utf16).sum(),
            None => self.text.encode_utf16().count(),
        }
    }
}

/// Facts about the page a template can read.
pub struct Context<'a> {
    pub page: &'a PageName,
    pub language: &'a str,
    pub now: NaiveDateTime,
}

/// The variables every template starts with: `page.name`, `page.basename`
/// and `page.section`.
fn variables(context: &Context<'_>) -> BTreeMap<String, Value> {
    let parent = context.page.parent();
    let section = if parent.is_root() {
        String::new()
    } else {
        parent.to_string()
    };
    let page = BTreeMap::from([
        ("name".to_owned(), Value::text(context.page.as_str())),
        ("basename".to_owned(), Value::text(context.page.basename())),
        ("section".to_owned(), Value::text(section)),
    ]);
    BTreeMap::from([("page".to_owned(), Value::Map(page))])
}

/// Fills a template for a new page.
pub fn render(template: &str, context: &Context<'_>) -> Result<Rendered, TemplateError> {
    if template.len() > MAX_TEMPLATE {
        return Err(TemplateError::TooBig);
    }
    let nodes = parse::parse(template)?;
    Engine::new(variables(context), context.language, context.now).run_all(&nodes)
}

/// The text a page that does not exist yet starts with. `template` is the text of the page the
/// notebook uses as its template; without one the built-in template is used. The template language
/// applies to the text; a text that does not parse is used as it is, and one that is too big is
/// ignored, so a template never stops a page from opening.
pub fn new_page(
    template: Option<&str>,
    page: &PageName,
    language: &str,
    now: NaiveDateTime,
) -> Rendered {
    let context = Context {
        page,
        language,
        now,
    };
    if let Some(text) = template.filter(|text| text.len() <= MAX_TEMPLATE) {
        return render(text, &context).unwrap_or_else(|_| Rendered {
            text: text.to_owned(),
            cursor: None,
        });
    }
    render(DEFAULT_TEMPLATE, &context).unwrap_or(Rendered {
        text: String::new(),
        cursor: None,
    })
}

/// The local date and time, for the program that has no clock of its own.
pub fn local_now() -> NaiveDateTime {
    chrono::Local::now().naive_local()
}

/// The template of new pages when the notebook names none: title and date of creation.
const DEFAULT_TEMPLATE: &str = "====== [% page.basename %] ======\n[% gettext('Created') %] [% strftime(gettext('%A %d %B %Y')) %]\n\n";

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn now() -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 11, 14)
            .unwrap()
            .and_hms_opt(9, 5, 7)
            .unwrap()
    }

    fn fill(template: &str, page: &str, language: &str) -> Result<Rendered, TemplateError> {
        let page = PageName::new(page).unwrap();
        render(
            template,
            &Context {
                page: &page,
                language,
                now: now(),
            },
        )
    }

    fn text(template: &str) -> String {
        fill(template, "Projekt:Plan", "en").unwrap().text
    }

    #[test]
    fn variables_and_text() {
        assert_eq!(
            text("a [% page.name %] b [% page.basename %] c [% page.section %]"),
            "a Projekt:Plan b Plan c Projekt"
        );
        assert_eq!(text("[% page.fehlt %]|[% unbekannt %]|"), "||");
        assert_eq!(text("ohne Anweisung\n"), "ohne Anweisung\n");
    }

    #[test]
    fn dates_follow_the_language() {
        assert_eq!(
            text("[% strftime('%A %d %B %Y') %]"),
            "Saturday 14 November 2026"
        );
        assert_eq!(
            fill("[% strftime('%A, %d. %B %Y %H:%M') %]", "X", "de")
                .unwrap()
                .text,
            "Samstag, 14. November 2026 09:05"
        );
        assert_eq!(
            text("[% strftime('%a %b %e %y %j %% %Q') %]"),
            "Sat Nov 14 26 318 % %Q"
        );
        assert_eq!(
            text("a[% strftime('%F', None) %]b"),
            "ab",
            "an unusable call writes nothing"
        );
    }

    #[test]
    fn conditions_loops_and_assignments() {
        assert_eq!(text("[% IF 1 == 1 %]ja[% ELSE %]nein[% END %]"), "ja");
        assert_eq!(
            text(
                "[% IF page.basename == 'Nope' %]a[% ELIF page.basename == 'Plan' %]b[% ELSIF True %]c[% ELSE %]d[% END %]"
            ),
            "b"
        );
        assert_eq!(
            text("[% IF not (1 > 2) and 'a' != 'b' or False %]x[% END %]"),
            "x"
        );
        assert_eq!(text("[% FOR n IN range(3) %][% n %],[% END %]"), "0,1,2,");
        assert_eq!(
            text(
                "[% FOREACH n IN ['a', 'b'] %][% loop.count %]/[% loop.size %][% IF loop.last %]![% END %] [% END %]"
            ),
            "1/2 2/2! "
        );
        assert_eq!(
            text("[% SET x = 'wert' %][% x %] [% y = x.upper() %][% y %] [% x.capitalize() %]"),
            "wert WERT Wert"
        );
        assert_eq!(text("[% IF len('abc') == 3 %]drei[% END %]"), "drei");
    }

    #[test]
    fn the_rest_of_the_language() {
        assert_eq!(
            text("[% GET page.basename %]|[% FOR n = [1, 2] %][% n %][% END %]"),
            "Plan|12"
        );
        assert_eq!(
            text("[% SET a.b = 'x' %][% a.b %] [% ['p', 'q'].1 %] [% len(['a', 'b']) %]"),
            "x q 2"
        );
        assert_eq!(text("[% range(2, 5).2 %] [% range(2, 4) %]"), "4 2 3");
        assert_eq!(
            text(
                "[% FOR n IN range(3) %][% loop.index %][% loop.first %][% loop.parity %] [% END %]"
            ),
            "0Trueeven 1Falseodd 2Falseeven "
        );
        assert_eq!(
            text(
                "[% ' Ab '.strip() %]|[% 'AB'.lower() %]|[% 'ab'.startswith('a') %]|[% 'ab'.endswith('x') %]|[% 'abab'.replace('a', 'c') %]|[% ['a'].len() %]"
            ),
            "Ab|ab|True|False|cbcb|1"
        );
        // 2026-11-14 is a Saturday in ISO week 46.
        assert_eq!(text("[% strftime('%V %W %G %u') %]"), "46 46 2026 6");
    }

    #[test]
    fn white_space_control_and_block_lines() {
        assert_eq!(text("a\n[%- 'b' -%]\nc"), "abc");
        assert_eq!(
            text("a\n[% IF True %]\nb\n[% END %]\nc\n"),
            "a\nb\nc\n",
            "block directives alone on a line leave no blank line"
        );
        assert_eq!(text("<!--[% 'x' %]-->y"), "xy");
    }

    #[test]
    fn the_cursor_is_reported_in_characters() {
        let rendered = fill("äö[% place_cursor() %]ü\n", "X", "en").unwrap();
        assert_eq!(
            (rendered.text.as_str(), rendered.cursor),
            ("äöü\n", Some(2))
        );
        assert_eq!(fill("kein Cursor", "X", "en").unwrap().cursor, None);
    }

    #[test]
    fn built_in_templates() {
        let default = fill(DEFAULT_TEMPLATE, "Neue Seite", "de").unwrap().text;
        assert_eq!(
            default,
            "====== Neue Seite ======\nErstellt Samstag, 14. November 2026\n\n"
        );
        let english = fill(DEFAULT_TEMPLATE, "New", "en").unwrap().text;
        assert_eq!(
            english,
            "====== New ======\nCreated Saturday 14 November 2026\n\n"
        );
    }

    #[test]
    fn broken_and_hostile_templates_are_refused_not_run_forever() {
        for broken in [
            "[% IF %]",
            "[% IF True %]offen",
            "[% END %]",
            "[% 'offen %]",
            "[% a b %]",
            "[% BLOCK x %][% END %]",
            "[% INCLUDE 'datei' %]",
            "x [% y",
            "[% FOR %]x[% END %]",
        ] {
            assert!(fill(broken, "X", "en").is_err(), "{broken:?}");
        }
        // Nested loops of 10 000 times 10 000 stop at the step limit.
        let bomb = "[% FOR a IN range(10000) %][% FOR b IN range(10000) %]x[% END %][% END %]";
        assert_eq!(fill(bomb, "X", "en"), Err(TemplateError::TooBig));
        // A deeply nested expression or block is a syntax error, not a stack overflow.
        let deep = format!("[% {}1{} %]", "(".repeat(5000), ")".repeat(5000));
        assert!(fill(&deep, "X", "en").is_err());
        let blocks = format!(
            "{}x{}",
            "[% IF True %]".repeat(2000),
            "[% END %]".repeat(2000)
        );
        assert!(fill(&blocks, "X", "en").is_err());
        assert_eq!(
            fill(&"x".repeat(MAX_TEMPLATE + 1), "X", "en"),
            Err(TemplateError::TooBig)
        );
    }

    #[test]
    fn new_pages_start_with_the_template_page_or_the_built_in_template() {
        let page = PageName::new("Projekt:Idee").unwrap();
        let start = |template: Option<&str>| new_page(template, &page, "en", now());

        assert_eq!(
            start(None).text,
            "====== Idee ======\nCreated Saturday 14 November 2026\n\n"
        );
        // The text of a page is the template; it may place the cursor.
        let rendered = start(Some("# [% page.name %]\n\n[% place_cursor() %]\n"));
        assert_eq!(
            (rendered.text.as_str(), rendered.cursor),
            ("# Projekt:Idee\n\n\n", Some(16))
        );
        assert_eq!(rendered.cursor_utf16(), 16);
        // A page that is just text is copied as it is.
        assert_eq!(start(Some("Zutaten:\n* \n")).text, "Zutaten:\n* \n");
        // A text that does not parse is used as it is; one that is too big is ignored.
        assert_eq!(start(Some("[% IF %]kaputt")).text, "[% IF %]kaputt");
        assert!(
            start(Some(&"x".repeat(MAX_TEMPLATE + 1)))
                .text
                .starts_with("====== Idee ======")
        );
        // The cursor counts UTF-16 units: an emoji takes two.
        let wide = Rendered {
            text: "a🙂b".to_owned(),
            cursor: Some(2),
        };
        assert_eq!(wide.cursor_utf16(), 3);
    }
}
