//! Task list across the notebook: checkbox items and lines starting with a
//! label such as TODO. Rules: `.project/research/wiki-formatspezifikation.md`,
//! chapter 6.

use chrono::{Datelike, Duration, NaiveDate, Weekday};
use serde::Serialize;

use crate::index::{Index, IndexedPage};
use crate::markup::{plain_text, tag_name};
use crate::pagename::sort_key;
use crate::scan::TaskLine;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Open,
    Done,
    Cancelled,
    Migrated,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub page: String,
    /// Zero-based line in the page body.
    pub line: usize,
    /// Task text without markup.
    pub text: String,
    pub status: TaskStatus,
    /// The task is not finished: its status is [`TaskStatus::Open`].
    pub open: bool,
    /// Number of exclamation marks, inherited from the parent task if none.
    pub priority: usize,
    pub tags: Vec<String>,
    /// ISO date `YYYY-MM-DD`, last day of the given period.
    pub due: Option<String>,
    /// ISO date `YYYY-MM-DD`, first day of the given period.
    pub start: Option<String>,
    /// Nesting below other tasks on the same page.
    pub depth: usize,
    pub waiting: bool,
    /// The line starts with a checkbox, so it can be ticked off.
    pub checkbox: bool,
}

/// A task is waiting when its text or one of its tags starts with one of these.
const WAITING_LABELS: [&str; 2] = ["waiting", "planned"];

/// First and last day of a date written as day, month or ISO week.
fn parse_period(text: &str) -> Option<(NaiveDate, NaiveDate)> {
    let text = text.trim();
    let upper = text.to_ascii_uppercase();
    match upper.find('W') {
        Some(position) => week_period(&upper[..position], &upper[position + 1..]),
        None => calendar_period(text),
    }
}

/// Week forms: 2017W07, 2017-W07, 17W07, 17-W07, optionally followed by `-D`
/// for one day of the week. `year` is what stands before the `W`.
fn week_period(year: &str, rest: &str) -> Option<(NaiveDate, NaiveDate)> {
    let year = year.trim_end_matches('-');
    if year.is_empty() || !year.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let rest = rest.trim_start_matches('K');
    let (week, day) = match rest.split_once(['-', '.']) {
        Some((week, day)) => (week, Some(day)),
        None => (rest, None),
    };
    let mut number: i32 = year.parse().ok()?;
    if year.len() == 2 {
        number += 2000;
    }
    let monday = NaiveDate::from_isoywd_opt(number, week.parse().ok()?, Weekday::Mon)?;
    match day {
        Some(day) => {
            let day: i64 = day.parse().ok()?;
            if !(0..=7).contains(&day) {
                return None;
            }
            let date = monday + Duration::days(day - 1);
            Some((date, date))
        }
        None => Some((monday, monday + Duration::days(6))),
    }
}

/// `YYYY-MM-DD` is one day, `YYYY-MM` a whole month.
fn calendar_period(text: &str) -> Option<(NaiveDate, NaiveDate)> {
    let number = |part: &str, len: usize| -> Option<u32> {
        (part.len() == len && part.chars().all(|c| c.is_ascii_digit()))
            .then(|| part.parse().ok())
            .flatten()
    };
    match text.split('-').collect::<Vec<_>>().as_slice() {
        [year, month, day] => {
            let date = NaiveDate::from_ymd_opt(
                number(year, 4)? as i32,
                number(month, 2)?,
                number(day, 2)?,
            )?;
            Some((date, date))
        }
        [year, month] => {
            let first = NaiveDate::from_ymd_opt(number(year, 4)? as i32, number(month, 2)?, 1)?;
            let next = if first.month() == 12 {
                NaiveDate::from_ymd_opt(first.year() + 1, 1, 1)?
            } else {
                NaiveDate::from_ymd_opt(first.year(), first.month() + 1, 1)?
            };
            Some((first, next - Duration::days(1)))
        }
        _ => None,
    }
}

/// Reads the date that follows a `<`, `>` or `[d:` marker.
fn date_after(text: &str) -> Option<(NaiveDate, NaiveDate)> {
    let text = text.strip_prefix(' ').unwrap_or(text);
    let end = text
        .find(|c: char| !(c.is_ascii_alphanumeric() || matches!(c, '-' | '.')))
        .unwrap_or(text.len());
    parse_period(text[..end].trim_end_matches('.'))
}

/// What a task line says about itself, and what it hands down to the tasks
/// nested below it.
#[derive(Clone)]
struct Attributes {
    priority: usize,
    tags: Vec<String>,
    due: Option<NaiveDate>,
    start: Option<NaiveDate>,
}

impl Attributes {
    fn of(text: &str) -> Self {
        let mut found = Attributes {
            priority: text.matches('!').count(),
            tags: Vec::new(),
            due: None,
            start: None,
        };
        let mut previous = ' ';
        for (index, character) in text.char_indices() {
            let rest = &text[index + character.len_utf8()..];
            match character {
                '@' if previous.is_whitespace() => {
                    if let Some(name) = tag_name(&text[index..]) {
                        found.add_tag(name.to_lowercase());
                    }
                }
                '<' if found.due.is_none() => found.due = date_after(rest).map(|(_, last)| last),
                '>' if found.start.is_none() => {
                    found.start = date_after(rest).map(|(first, _)| first);
                }
                '[' if rest.starts_with("d:") && found.due.is_none() => {
                    found.due = date_after(rest[2..].trim_start()).map(|(_, last)| last);
                }
                _ => {}
            }
            previous = character;
        }
        found
    }

    fn add_tag(&mut self, tag: String) {
        if !self.tags.contains(&tag) {
            self.tags.push(tag);
        }
    }

    /// Takes over what the line does not say itself.
    fn inherit(&mut self, parent: &Attributes) {
        if self.priority == 0 {
            self.priority = parent.priority;
        }
        for tag in &parent.tags {
            self.add_tag(tag.clone());
        }
        self.due = self.due.or(parent.due);
        self.start = self.start.or(parent.start);
    }
}

fn status_of(line: &TaskLine) -> TaskStatus {
    match line.state {
        Some('*') => TaskStatus::Done,
        Some('x') => TaskStatus::Cancelled,
        Some('>' | '<') => TaskStatus::Migrated,
        _ => TaskStatus::Open,
    }
}

fn is_waiting(text: &str, tags: &[String]) -> bool {
    let lower = text.to_lowercase();
    WAITING_LABELS.iter().any(|label| lower.starts_with(label))
        || tags
            .iter()
            .any(|tag| WAITING_LABELS.contains(&tag.as_str()))
}

fn iso(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

/// The tasks of one page in the order of its lines.
fn page_tasks(page: &IndexedPage) -> Vec<Task> {
    let mut tasks = Vec::new();
    // Open ancestors of the current line, outermost first, with their indent.
    let mut parents: Vec<(usize, Attributes)> = Vec::new();
    let mut previous_line: Option<usize> = None;
    for line in &page.scan.tasks {
        // Lines that are not adjacent do not belong to the same list.
        if previous_line.is_none_or(|previous| line.line != previous + 1) {
            parents.clear();
        }
        previous_line = Some(line.line);
        while parents
            .last()
            .is_some_and(|(indent, _)| *indent >= line.indent)
        {
            parents.pop();
        }
        let mut own = Attributes::of(&line.text);
        if let Some((_, parent)) = parents.last() {
            own.inherit(parent);
        }
        let status = status_of(line);
        let text = plain_text(&line.text);
        tasks.push(Task {
            page: page.info.name.to_string(),
            line: line.line,
            status,
            open: status == TaskStatus::Open,
            priority: own.priority,
            tags: own.tags.clone(),
            due: own.due.map(iso),
            start: own.start.map(iso),
            depth: parents.len(),
            waiting: is_waiting(&text, &own.tags),
            checkbox: line.state.is_some(),
            text,
        });
        parents.push((line.indent, own));
    }
    tasks
}

impl Index {
    /// Every task of the notebook. Open tasks come first, ordered by
    /// priority, due date and page.
    pub fn tasks(&self) -> Vec<Task> {
        // The page's sort key is worked out once per page and carried along: computing
        // it inside the comparison below allocates twice per comparison.
        let mut keyed: Vec<(String, Task)> = Vec::new();
        for page in self.pages() {
            let page_key = sort_key(page.info.name.as_str());
            keyed.extend(
                page_tasks(page)
                    .into_iter()
                    .map(|task| (page_key.clone(), task)),
            );
        }
        keyed.sort_by(|(key_a, a), (key_b, b)| {
            (!a.open, a.waiting, std::cmp::Reverse(a.priority))
                .cmp(&(!b.open, b.waiting, std::cmp::Reverse(b.priority)))
                .then_with(|| {
                    let far = "9999";
                    a.due
                        .as_deref()
                        .unwrap_or(far)
                        .cmp(b.due.as_deref().unwrap_or(far))
                })
                .then_with(|| key_a.cmp(key_b))
                .then_with(|| a.line.cmp(&b.line))
        });
        keyed.into_iter().map(|(_, task)| task).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::index_with;

    fn day(text: &str) -> NaiveDate {
        NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn periods_cover_days_months_and_weeks() {
        assert_eq!(
            parse_period("2017-02-16"),
            Some((day("2017-02-16"), day("2017-02-16")))
        );
        assert_eq!(
            parse_period("2017-02"),
            Some((day("2017-02-01"), day("2017-02-28")))
        );
        assert_eq!(
            parse_period("2024-12"),
            Some((day("2024-12-01"), day("2024-12-31")))
        );
        assert_eq!(
            parse_period("2017W07"),
            Some((day("2017-02-13"), day("2017-02-19")))
        );
        assert_eq!(
            parse_period("17-W07"),
            Some((day("2017-02-13"), day("2017-02-19")))
        );
        assert_eq!(
            parse_period("17-W07-2"),
            Some((day("2017-02-14"), day("2017-02-14")))
        );
        assert_eq!(parse_period("2017-13-01"), None);
        assert_eq!(parse_period("16/02"), None);
        assert_eq!(parse_period("bald"), None);
    }

    #[test]
    fn tasks_carry_priority_dates_tags_and_inherit_from_parents() {
        let (_dir, _notebook, index) = index_with(&[(
            "Plan",
            "[ ] Projekt !! @haus <2026-12\n\
             \t[ ] Teil eins\n\
             \t[*] Teil zwei\n\
             [x] Verworfen\n\
             \n\
             TODO: Rasen mähen >2026-11-20 [d: 2026-11-30]\n\
             [ ] Waiting auf Antwort\n",
        )]);
        let tasks = index.tasks();
        let brief: Vec<(String, TaskStatus, usize, usize, bool)> = tasks
            .iter()
            .map(|t| (t.text.clone(), t.status, t.priority, t.depth, t.waiting))
            .collect();
        assert_eq!(
            brief,
            [
                (
                    "Projekt !! @haus <2026-12".to_owned(),
                    TaskStatus::Open,
                    2,
                    0,
                    false
                ),
                ("Teil eins".to_owned(), TaskStatus::Open, 2, 1, false),
                (
                    "TODO: Rasen mähen >2026-11-20 [d: 2026-11-30]".to_owned(),
                    TaskStatus::Open,
                    0,
                    0,
                    false
                ),
                (
                    "Waiting auf Antwort".to_owned(),
                    TaskStatus::Open,
                    0,
                    0,
                    true
                ),
                ("Teil zwei".to_owned(), TaskStatus::Done, 2, 1, false),
                ("Verworfen".to_owned(), TaskStatus::Cancelled, 0, 0, false),
            ]
        );
        assert_eq!(tasks[0].due.as_deref(), Some("2026-12-31"));
        assert_eq!(
            tasks[1].due.as_deref(),
            Some("2026-12-31"),
            "inherited from the parent"
        );
        assert_eq!(tasks[1].tags, ["haus"]);
        assert_eq!(tasks[2].start.as_deref(), Some("2026-11-20"));
        assert_eq!(tasks[2].due.as_deref(), Some("2026-11-30"));
        assert!(
            tasks[0].checkbox && !tasks[2].checkbox,
            "only the TODO line has no checkbox"
        );
    }
}
