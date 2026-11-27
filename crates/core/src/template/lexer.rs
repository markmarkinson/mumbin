//! Splits the inside of a `[% … %]` directive into tokens.

use super::{TemplateError, syntax};

#[derive(Debug, Clone, PartialEq)]
pub(super) enum Token {
    Word(String),
    Text(String),
    Number(i64),
    Symbol(&'static str),
}

/// Two-character symbols come first so they win over their first character.
const SYMBOLS: [&str; 13] = [
    "==", "!=", "<=", ">=", ".", ",", "(", ")", "[", "]", "=", "<", ">",
];

pub(super) fn tokenize(source: &str) -> Result<Vec<Token>, TemplateError> {
    let chars: Vec<char> = source.chars().collect();
    let mut tokens = Vec::new();
    let mut at = 0;
    while at < chars.len() {
        let c = chars[at];
        if c.is_whitespace() {
            at += 1;
        } else if c.is_alphabetic() || c == '_' {
            let end = end_of(&chars, at, |c| c.is_alphanumeric() || c == '_');
            tokens.push(Token::Word(chars[at..end].iter().collect()));
            at = end;
        } else if c.is_ascii_digit() {
            let end = end_of(&chars, at, |c| c.is_ascii_digit());
            let digits: String = chars[at..end].iter().collect();
            let number = digits
                .parse()
                .map_err(|_| TemplateError::Syntax("number too large".into()))?;
            tokens.push(Token::Number(number));
            at = end;
        } else if c == '"' || c == '\'' {
            let (text, end) = read_string(&chars, at)?;
            tokens.push(Token::Text(text));
            at = end;
        } else {
            let ahead: String = chars[at..(at + 2).min(chars.len())].iter().collect();
            let Some(symbol) = SYMBOLS.iter().find(|symbol| ahead.starts_with(**symbol)) else {
                return syntax(format!("unexpected {c:?}"));
            };
            tokens.push(Token::Symbol(symbol));
            at += symbol.len();
        }
    }
    Ok(tokens)
}

/// Index of the first character from `start` on that `belongs` rejects.
fn end_of(chars: &[char], start: usize, belongs: fn(char) -> bool) -> usize {
    chars[start..]
        .iter()
        .position(|c| !belongs(*c))
        .map_or(chars.len(), |length| start + length)
}

/// The string that opens at `chars[start]`, and the index behind its closing
/// quote. `\n` and `\t` are escapes; a backslash before anything else
/// stands for that character.
fn read_string(chars: &[char], start: usize) -> Result<(String, usize), TemplateError> {
    let quote = chars[start];
    let mut text = String::new();
    let mut at = start + 1;
    loop {
        match chars.get(at) {
            None => return syntax("a string is not closed"),
            Some('\\') if at + 1 < chars.len() => {
                text.push(match chars[at + 1] {
                    'n' => '\n',
                    't' => '\t',
                    other => other,
                });
                at += 2;
            }
            Some(&end) if end == quote => return Ok((text, at + 1)),
            Some(&other) => {
                text.push(other);
                at += 1;
            }
        }
    }
}
