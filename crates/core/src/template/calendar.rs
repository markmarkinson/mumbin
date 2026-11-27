//! Dates in the language of the interface: `strftime` and the few words the
//! built-in template translates.

use chrono::{Datelike, NaiveDateTime, Timelike};

const MONTHS_DE: [&str; 12] = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
];
const DAYS_DE: [&str; 7] = [
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag",
    "Sonntag",
];

fn is_german(language: &str) -> bool {
    language.starts_with("de")
}

/// Words of the interface language the built-in templates use.
pub(super) fn translate(language: &str, text: &str) -> String {
    if !is_german(language) {
        return text.to_owned();
    }
    match text {
        "Created" => "Erstellt",
        "%A %d %B %Y" => "%A, %d. %B %Y",
        other => other,
    }
    .to_owned()
}

fn abbreviation(name: &str) -> String {
    name.chars().take(3).collect()
}

/// `strftime` for the codes templates use, with day and month names in the
/// interface language. Unknown codes are written as they are.
pub(super) fn strftime(format: &str, when: NaiveDateTime, language: &str) -> String {
    let date = when.date();
    // English names come from chrono, German ones from the tables above.
    let (weekday, month) = if is_german(language) {
        (
            DAYS_DE[date.weekday().num_days_from_monday() as usize].to_owned(),
            MONTHS_DE[date.month0() as usize].to_owned(),
        )
    } else {
        (date.format("%A").to_string(), date.format("%B").to_string())
    };
    let mut out = String::new();
    let mut chars = format.chars();
    while let Some(c) = chars.next() {
        if c != '%' {
            out.push(c);
            continue;
        }
        let Some(code) = chars.next() else {
            out.push('%');
            break;
        };
        match code {
            'A' => out.push_str(&weekday),
            'a' => out.push_str(&abbreviation(&weekday)),
            'B' => out.push_str(&month),
            'b' => out.push_str(&abbreviation(&month)),
            'd' => out.push_str(&format!("{:02}", date.day())),
            'e' => out.push_str(&format!("{:2}", date.day())),
            'm' => out.push_str(&format!("{:02}", date.month())),
            'Y' => out.push_str(&date.year().to_string()),
            'y' => out.push_str(&format!("{:02}", date.year().rem_euclid(100))),
            'H' => out.push_str(&format!("{:02}", when.hour())),
            'M' => out.push_str(&format!("{:02}", when.minute())),
            'S' => out.push_str(&format!("{:02}", when.second())),
            'j' => out.push_str(&format!("{:03}", date.ordinal())),
            'V' | 'W' => out.push_str(&format!("{:02}", date.iso_week().week())),
            'G' => out.push_str(&date.iso_week().year().to_string()),
            'u' => out.push_str(&(date.weekday().num_days_from_monday() + 1).to_string()),
            'F' => out.push_str(&date.format("%Y-%m-%d").to_string()),
            'T' => out.push_str(&when.format("%H:%M:%S").to_string()),
            '%' => out.push('%'),
            other => {
                out.push('%');
                out.push(other);
            }
        }
    }
    out
}
