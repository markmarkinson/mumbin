//! Template source to node tree: splitting text from directives, the
//! white-space rules, and the block structure (`IF`, `FOR`, `SET`, `GET`).

use super::expr::{Expr, parse_expression};
use super::{MAX_DEPTH, TemplateError, syntax};

#[derive(Debug, Clone, PartialEq)]
pub(super) enum Node {
    Text(String),
    Get(Expr),
    Set(Vec<String>, Expr),
    /// Conditions with their bodies, then the `ELSE` body.
    If(Vec<(Expr, Vec<Node>)>, Vec<Node>),
    For(String, Expr, Vec<Node>),
}

pub(super) fn parse(source: &str) -> Result<Vec<Node>, TemplateError> {
    let parts = tidy_block_lines(pieces(source)?);
    let mut parser = BlockParser {
        pieces: &parts,
        at: 0,
    };
    Ok(parser.nodes(&[], 0)?.0)
}

#[derive(Debug)]
enum Piece {
    Text(String),
    Directive(String),
}

/// Splits the source into text and directives and applies the white-space rules.
fn pieces(source: &str) -> Result<Vec<Piece>, TemplateError> {
    let mut out: Vec<Piece> = Vec::new();
    let mut rest = source;
    while !rest.is_empty() {
        let Some(open) = rest.find("[%") else {
            out.push(Piece::Text(rest.to_owned()));
            break;
        };
        let mut text = rest[..open].to_owned();
        let after_open = &rest[open + 2..];
        let Some(close) = after_open.find("%]") else {
            return syntax("a [% is not closed");
        };
        let mut inner = &after_open[..close];
        // The `<!--[% … %]-->` form: the comment brackets belong to the directive.
        if text.ends_with("<!--") {
            text.truncate(text.len() - "<!--".len());
        }
        rest = &after_open[close + 2..];
        if let Some(stripped) = rest.strip_prefix("-->") {
            rest = stripped;
        }
        if let Some(stripped) = inner.strip_prefix('-') {
            inner = stripped;
            trim_line_end(&mut text);
        }
        if let Some(stripped) = inner.strip_suffix('-') {
            inner = stripped;
            rest = skip_line_break(rest);
        }
        if !text.is_empty() {
            out.push(Piece::Text(text));
        }
        out.push(Piece::Directive(inner.trim().to_owned()));
    }
    Ok(out)
}

/// `[%-`: removes the blanks before the directive and the line break before them.
fn trim_line_end(text: &mut String) {
    text.truncate(text.trim_end_matches([' ', '\t']).len());
    if text.ends_with('\n') {
        text.pop();
        if text.ends_with('\r') {
            text.pop();
        }
    }
}

/// `-%]`: skips blanks and one line break.
fn skip_line_break(text: &str) -> &str {
    let trimmed = text.trim_start_matches([' ', '\t', '\r']);
    trimmed.strip_prefix('\n').unwrap_or(trimmed)
}

/// First word of a directive, which says what it is.
fn keyword_of(directive: &str) -> &str {
    directive.split_whitespace().next().unwrap_or("")
}

fn is_name(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_')
}

/// Directives that produce no text themselves.
fn is_block_directive(directive: &str) -> bool {
    matches!(
        keyword_of(directive),
        "IF" | "ELIF" | "ELSIF" | "ELSE" | "FOR" | "FOREACH" | "END" | "SET"
    ) || is_assignment(directive)
}

/// `name = expression` without a keyword: a SET.
fn is_assignment(directive: &str) -> bool {
    let Some((left, right)) = directive.split_once('=') else {
        return false;
    };
    let left_name = left.trim();
    !right.starts_with('=')
        && !left.ends_with(['!', '<', '>'])
        && !left_name.is_empty()
        && left_name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '.')
}

/// A block directive alone on its line leaves no empty line behind.
fn tidy_block_lines(mut parts: Vec<Piece>) -> Vec<Piece> {
    for at in 0..parts.len() {
        let is_block =
            matches!(&parts[at], Piece::Directive(directive) if is_block_directive(directive));
        if !(is_block && line_is_blank_before(&parts, at) && line_is_blank_after(&parts, at)) {
            continue;
        }
        if at > 0
            && let Piece::Text(text) = &mut parts[at - 1]
        {
            let keep = text.rfind('\n').map_or(0, |position| position + 1);
            text.truncate(keep);
        }
        if let Some(Piece::Text(text)) = parts.get_mut(at + 1)
            && let Some(position) = text.find('\n')
        {
            text.drain(..=position);
        }
    }
    parts
}

fn line_is_blank_before(parts: &[Piece], at: usize) -> bool {
    at == 0
        || matches!(&parts[at - 1], Piece::Text(text)
            if text.rsplit('\n').next().is_some_and(|line| line.trim().is_empty())
                && (text.contains('\n') || at == 1))
}

fn line_is_blank_after(parts: &[Piece], at: usize) -> bool {
    match parts.get(at + 1) {
        Some(Piece::Text(text)) => {
            text.split('\n')
                .next()
                .is_some_and(|line| line.trim().is_empty())
                && text.contains('\n')
        }
        Some(Piece::Directive(_)) | None => true,
    }
}

struct BlockParser<'a> {
    pieces: &'a [Piece],
    at: usize,
}

impl BlockParser<'_> {
    /// Nodes up to a directive whose first word is in `until`, which is
    /// consumed and returned. Without `until` they run to the end.
    fn nodes(
        &mut self,
        until: &[&str],
        depth: usize,
    ) -> Result<(Vec<Node>, Option<String>), TemplateError> {
        if depth > MAX_DEPTH {
            return syntax("blocks nested too deeply");
        }
        let mut nodes = Vec::new();
        let pieces = self.pieces;
        while let Some(piece) = pieces.get(self.at) {
            self.at += 1;
            let directive = match piece {
                Piece::Text(text) => {
                    if !text.is_empty() {
                        nodes.push(Node::Text(text.clone()));
                    }
                    continue;
                }
                Piece::Directive(directive) => directive,
            };
            let word = keyword_of(directive);
            if until.contains(&word) {
                return Ok((nodes, Some(directive.clone())));
            }
            nodes.push(match word {
                "IF" => self.parse_if(directive, depth)?,
                "FOR" | "FOREACH" => self.parse_for(directive, depth)?,
                "SET" => parse_set(directive["SET".len()..].trim())?,
                "GET" => Node::Get(parse_expression(directive["GET".len()..].trim())?),
                "BLOCK" | "INCLUDE" | "ELSE" | "ELIF" | "ELSIF" | "END" => {
                    return syntax(format!("{word} is not supported here"));
                }
                _ if is_assignment(directive) => parse_set(directive)?,
                _ => Node::Get(parse_expression(directive)?),
            });
        }
        if until.is_empty() {
            Ok((nodes, None))
        } else {
            syntax("a block is not closed with END")
        }
    }

    fn parse_if(&mut self, directive: &str, depth: usize) -> Result<Node, TemplateError> {
        let mut branches = Vec::new();
        let mut condition = parse_expression(directive["IF".len()..].trim())?;
        loop {
            let (body, ended_by) = self.nodes(&["ELIF", "ELSIF", "ELSE", "END"], depth + 1)?;
            branches.push((condition.clone(), body));
            let ended_by = ended_by.unwrap_or_default();
            let word = keyword_of(&ended_by);
            match word {
                "ELIF" | "ELSIF" => condition = parse_expression(ended_by[word.len()..].trim())?,
                "ELSE" => {
                    let (otherwise, _) = self.nodes(&["END"], depth + 1)?;
                    return Ok(Node::If(branches, otherwise));
                }
                _ => return Ok(Node::If(branches, Vec::new())),
            }
        }
    }

    fn parse_for(&mut self, directive: &str, depth: usize) -> Result<Node, TemplateError> {
        let head = directive[keyword_of(directive).len()..].trim();
        let Some((name, source)) = head.split_once(" IN ").or_else(|| head.split_once('=')) else {
            return syntax("FOR needs: FOR name IN list");
        };
        let name = name.trim();
        if !is_name(name) {
            return syntax("not a loop variable name");
        }
        let (body, _) = self.nodes(&["END"], depth + 1)?;
        Ok(Node::For(
            name.to_owned(),
            parse_expression(source.trim())?,
            body,
        ))
    }
}

fn parse_set(text: &str) -> Result<Node, TemplateError> {
    let Some((left, right)) = text.split_once('=') else {
        return syntax("SET needs =");
    };
    let path: Vec<String> = left.trim().split('.').map(str::to_owned).collect();
    if !path.iter().all(|part| is_name(part)) {
        return syntax("not a variable name");
    }
    Ok(Node::Set(path, parse_expression(right.trim())?))
}
