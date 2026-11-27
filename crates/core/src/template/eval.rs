//! Running a parsed template: scopes, expressions and the built-in functions.
//! The work is limited in steps and output size.

use std::collections::BTreeMap;

use chrono::NaiveDateTime;

use super::calendar::{strftime, translate};
use super::expr::{Comparison, Expr, Logic};
use super::parse::Node;
use super::value::Value;
use super::{MAX_OUTPUT, MAX_STEPS, Rendered, TemplateError};

/// Longest list `range` makes.
const MAX_RANGE: i64 = 10_000;

pub(super) struct Engine<'a> {
    /// Innermost scope last; `SET` writes to the innermost one.
    scopes: Vec<BTreeMap<String, Value>>,
    language: &'a str,
    now: NaiveDateTime,
    output: String,
    /// Byte offset in `output` where `place_cursor()` was called first.
    cursor: Option<usize>,
    steps: usize,
}

impl<'a> Engine<'a> {
    pub(super) fn new(
        variables: BTreeMap<String, Value>,
        language: &'a str,
        now: NaiveDateTime,
    ) -> Self {
        Engine {
            scopes: vec![variables],
            language,
            now,
            output: String::new(),
            cursor: None,
            steps: 0,
        }
    }

    pub(super) fn run_all(mut self, nodes: &[Node]) -> Result<Rendered, TemplateError> {
        self.run(nodes)?;
        let cursor = self
            .cursor
            .map(|bytes| self.output[..bytes.min(self.output.len())].chars().count());
        Ok(Rendered {
            text: self.output,
            cursor,
        })
    }

    fn spend(&mut self) -> Result<(), TemplateError> {
        self.steps += 1;
        if self.steps > MAX_STEPS || self.output.len() > MAX_OUTPUT {
            return Err(TemplateError::TooBig);
        }
        Ok(())
    }

    fn lookup(&self, name: &str) -> Value {
        self.scopes
            .iter()
            .rev()
            .find_map(|scope| scope.get(name))
            .cloned()
            .unwrap_or(Value::None)
    }

    fn run(&mut self, nodes: &[Node]) -> Result<(), TemplateError> {
        for node in nodes {
            self.spend()?;
            match node {
                Node::Text(text) => self.output.push_str(text),
                Node::Get(expr) => {
                    let value = self.eval(expr)?;
                    self.output.push_str(&value.show());
                }
                Node::Set(path, expr) => {
                    let value = self.eval(expr)?;
                    self.assign(path, value);
                }
                Node::If(branches, otherwise) => self.run_if(branches, otherwise)?,
                Node::For(name, source, body) => self.run_for(name, source, body)?,
            }
        }
        Ok(())
    }

    fn run_if(
        &mut self,
        branches: &[(Expr, Vec<Node>)],
        otherwise: &[Node],
    ) -> Result<(), TemplateError> {
        for (condition, body) in branches {
            if self.eval(condition)?.truthy() {
                return self.run(body);
            }
        }
        self.run(otherwise)
    }

    fn run_for(&mut self, name: &str, source: &Expr, body: &[Node]) -> Result<(), TemplateError> {
        let Value::List(items) = self.eval(source)? else {
            return Ok(());
        };
        let size = items.len();
        for (index, item) in items.into_iter().enumerate() {
            self.spend()?;
            let scope = BTreeMap::from([
                (name.to_owned(), item),
                ("loop".to_owned(), loop_state(index, size)),
            ]);
            self.scopes.push(scope);
            let result = self.run(body);
            self.scopes.pop();
            result?;
        }
        Ok(())
    }

    /// `name = value` or `object.attribute = value` in the innermost scope.
    fn assign(&mut self, path: &[String], value: Value) {
        let Some(scope) = self.scopes.last_mut() else {
            return;
        };
        match path {
            [name] => {
                scope.insert(name.clone(), value);
            }
            [name, attribute] => {
                if let Value::Map(entries) = scope
                    .entry(name.clone())
                    .or_insert_with(|| Value::Map(BTreeMap::new()))
                {
                    entries.insert(attribute.clone(), value);
                }
            }
            _ => {}
        }
    }

    fn eval(&mut self, expr: &Expr) -> Result<Value, TemplateError> {
        self.spend()?;
        Ok(match expr {
            Expr::Literal(value) => value.clone(),
            Expr::Var(name) => self.lookup(name),
            Expr::List(items) => Value::List(self.eval_all(items)?),
            Expr::Not(inner) => Value::Bool(!self.eval(inner)?.truthy()),
            Expr::Attr(base, name) => attribute(self.eval(base)?, name),
            Expr::Logic(left, logic, right) => {
                let left = self.eval(left)?;
                // The result is the operand that decides, as in Python.
                if left.truthy() == (*logic == Logic::Or) {
                    left
                } else {
                    self.eval(right)?
                }
            }
            Expr::Compare(left, comparison, right) => {
                let left = self.eval(left)?;
                let right = self.eval(right)?;
                Value::Bool(compare(&left, *comparison, &right))
            }
            Expr::Call(callee, arguments) => {
                let arguments = self.eval_all(arguments)?;
                match &**callee {
                    Expr::Var(name) => self.call(name, &arguments),
                    Expr::Attr(base, method) => {
                        let receiver = self.eval(base)?;
                        call_method(&receiver, method, &arguments)
                    }
                    _ => Value::None,
                }
            }
        })
    }

    fn eval_all(&mut self, exprs: &[Expr]) -> Result<Vec<Value>, TemplateError> {
        exprs.iter().map(|expr| self.eval(expr)).collect()
    }

    fn call(&mut self, name: &str, arguments: &[Value]) -> Value {
        match (name, arguments) {
            ("place_cursor", _) => {
                self.cursor.get_or_insert(self.output.len());
                Value::None
            }
            ("strftime", [Value::Text(format)]) => {
                Value::text(strftime(format, self.now, self.language))
            }
            ("gettext", [Value::Text(text)]) => Value::text(translate(self.language, text)),
            ("len", [Value::Text(text)]) => Value::Int(text.chars().count() as i64),
            ("len", [Value::List(items)]) => Value::Int(items.len() as i64),
            ("range", [Value::Int(end)]) => {
                Value::List((0..(*end).clamp(0, MAX_RANGE)).map(Value::Int).collect())
            }
            ("range", [Value::Int(start), Value::Int(end)]) => Value::List(
                (*start..(*end).min(start.saturating_add(MAX_RANGE)))
                    .map(Value::Int)
                    .collect(),
            ),
            _ => Value::None,
        }
    }
}

/// The `loop` variable inside `FOR`.
fn loop_state(index: usize, size: usize) -> Value {
    let number = |value: usize| Value::Int(value as i64);
    Value::Map(BTreeMap::from([
        ("first".to_owned(), Value::Bool(index == 0)),
        ("last".to_owned(), Value::Bool(index + 1 == size)),
        ("index".to_owned(), number(index)),
        ("count".to_owned(), number(index + 1)),
        ("size".to_owned(), number(size)),
        (
            "parity".to_owned(),
            Value::text(if index.is_multiple_of(2) {
                "even"
            } else {
                "odd"
            }),
        ),
    ]))
}

/// `base.name`: an entry of a map or an element of a list.
fn attribute(base: Value, name: &str) -> Value {
    match base {
        Value::Map(entries) => entries.get(name).cloned().unwrap_or(Value::None),
        Value::List(items) => name
            .parse::<usize>()
            .ok()
            .and_then(|index| items.get(index).cloned())
            .unwrap_or(Value::None),
        _ => Value::None,
    }
}

fn call_method(receiver: &Value, name: &str, arguments: &[Value]) -> Value {
    match (receiver, name) {
        (Value::Text(text), "upper") => Value::text(text.to_uppercase()),
        (Value::Text(text), "lower") => Value::text(text.to_lowercase()),
        (Value::Text(text), "capitalize") => {
            let mut chars = text.chars();
            Value::text(chars.next().map_or_else(String::new, |first| {
                first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase()
            }))
        }
        (Value::Text(text), "strip") => Value::text(text.trim()),
        (Value::Text(text), "startswith") => Value::Bool(
            matches!(arguments, [Value::Text(prefix)] if text.starts_with(prefix.as_str())),
        ),
        (Value::Text(text), "endswith") => Value::Bool(
            matches!(arguments, [Value::Text(suffix)] if text.ends_with(suffix.as_str())),
        ),
        (Value::Text(text), "replace") => match arguments {
            [Value::Text(from), Value::Text(to)] if !from.is_empty() => {
                Value::text(text.replace(from.as_str(), to))
            }
            _ => receiver.clone(),
        },
        (Value::List(items), "len") => Value::Int(items.len() as i64),
        _ => Value::None,
    }
}

fn compare(left: &Value, comparison: Comparison, right: &Value) -> bool {
    use std::cmp::Ordering;
    let ordering = match (left, right) {
        (Value::Int(a), Value::Int(b)) => Some(a.cmp(b)),
        (Value::Text(a), Value::Text(b)) => Some(a.cmp(b)),
        _ => None,
    };
    match comparison {
        Comparison::Eq => left == right,
        Comparison::Ne => left != right,
        Comparison::Lt => ordering == Some(Ordering::Less),
        Comparison::Le => matches!(ordering, Some(Ordering::Less | Ordering::Equal)),
        Comparison::Gt => ordering == Some(Ordering::Greater),
        Comparison::Ge => matches!(ordering, Some(Ordering::Greater | Ordering::Equal)),
    }
}
