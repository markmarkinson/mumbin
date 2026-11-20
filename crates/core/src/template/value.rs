//! The values a template works with.

use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub(super) enum Value {
    Text(String),
    Int(i64),
    Bool(bool),
    None,
    List(Vec<Value>),
    Map(BTreeMap<String, Value>),
}

impl Value {
    pub(super) fn text(text: impl Into<String>) -> Value {
        Value::Text(text.into())
    }

    pub(super) fn truthy(&self) -> bool {
        match self {
            Value::Text(text) => !text.is_empty(),
            Value::Int(number) => *number != 0,
            Value::Bool(flag) => *flag,
            Value::None => false,
            Value::List(items) => !items.is_empty(),
            Value::Map(entries) => !entries.is_empty(),
        }
    }

    /// The text a value writes into the page.
    pub(super) fn show(&self) -> String {
        match self {
            Value::Text(text) => text.clone(),
            Value::Int(number) => number.to_string(),
            Value::Bool(true) => "True".to_owned(),
            Value::Bool(false) => "False".to_owned(),
            Value::None | Value::Map(_) => String::new(),
            Value::List(items) => items.iter().map(Value::show).collect::<Vec<_>>().join(" "),
        }
    }
}
