//! Expressions: parsing the text of a directive into a tree.

use super::lexer::{Token, tokenize};
use super::value::Value;
use super::{MAX_DEPTH, TemplateError, syntax};

#[derive(Debug, Clone, PartialEq)]
pub(super) enum Expr {
    Literal(Value),
    Var(String),
    Attr(Box<Expr>, String),
    Call(Box<Expr>, Vec<Expr>),
    List(Vec<Expr>),
    Not(Box<Expr>),
    /// `and` / `or`: the value of one of the operands, not a plain boolean.
    Logic(Box<Expr>, Logic, Box<Expr>),
    Compare(Box<Expr>, Comparison, Box<Expr>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Logic {
    And,
    Or,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Comparison {
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
}

/// Longer symbols first, they share their first character with shorter ones.
const COMPARISONS: [(&str, Comparison); 6] = [
    ("==", Comparison::Eq),
    ("!=", Comparison::Ne),
    ("<=", Comparison::Le),
    (">=", Comparison::Ge),
    ("<", Comparison::Lt),
    (">", Comparison::Gt),
];

pub(super) fn parse_expression(source: &str) -> Result<Expr, TemplateError> {
    let mut parser = ExprParser {
        tokens: tokenize(source)?,
        at: 0,
        depth: 0,
    };
    let expr = parser.expression()?;
    match parser.tokens.get(parser.at) {
        Some(token) => syntax(format!("unexpected {token:?}")),
        None => Ok(expr),
    }
}

struct ExprParser {
    tokens: Vec<Token>,
    at: usize,
    depth: usize,
}

impl ExprParser {
    fn peek_word(&self) -> Option<&str> {
        match self.tokens.get(self.at) {
            Some(Token::Word(word)) => Some(word),
            _ => None,
        }
    }

    /// Takes the next token when it is the symbol `wanted`.
    fn symbol(&mut self, wanted: &'static str) -> bool {
        let found = self.tokens.get(self.at) == Some(&Token::Symbol(wanted));
        self.at += usize::from(found);
        found
    }

    /// Takes the next token when it is the word `wanted`.
    fn keyword(&mut self, wanted: &str) -> bool {
        let found = self.peek_word() == Some(wanted);
        self.at += usize::from(found);
        found
    }

    fn expression(&mut self) -> Result<Expr, TemplateError> {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            return syntax("expression nested too deeply");
        }
        let result = self.or();
        self.depth -= 1;
        result
    }

    fn or(&mut self) -> Result<Expr, TemplateError> {
        let mut left = self.and()?;
        while self.keyword("or") {
            left = Expr::Logic(Box::new(left), Logic::Or, Box::new(self.and()?));
        }
        Ok(left)
    }

    fn and(&mut self) -> Result<Expr, TemplateError> {
        let mut left = self.not()?;
        while self.keyword("and") {
            left = Expr::Logic(Box::new(left), Logic::And, Box::new(self.not()?));
        }
        Ok(left)
    }

    fn not(&mut self) -> Result<Expr, TemplateError> {
        if self.keyword("not") {
            return Ok(Expr::Not(Box::new(self.not()?)));
        }
        self.comparison()
    }

    fn comparison(&mut self) -> Result<Expr, TemplateError> {
        let left = self.postfix()?;
        for (symbol, comparison) in COMPARISONS {
            if self.symbol(symbol) {
                let right = self.postfix()?;
                return Ok(Expr::Compare(Box::new(left), comparison, Box::new(right)));
            }
        }
        Ok(left)
    }

    /// An atom followed by any number of `.name`, `.0` and `(arguments)`.
    fn postfix(&mut self) -> Result<Expr, TemplateError> {
        let mut expr = self.atom()?;
        loop {
            if self.symbol(".") {
                let name = match self.tokens.get(self.at).cloned() {
                    Some(Token::Word(name)) => name,
                    Some(Token::Number(index)) => index.to_string(),
                    _ => return syntax("a name must follow ."),
                };
                self.at += 1;
                expr = Expr::Attr(Box::new(expr), name);
            } else if self.symbol("(") {
                let arguments = self.items(")")?;
                expr = Expr::Call(Box::new(expr), arguments);
            } else {
                return Ok(expr);
            }
        }
    }

    fn atom(&mut self) -> Result<Expr, TemplateError> {
        let token = self.tokens.get(self.at).cloned();
        self.at += 1;
        Ok(match token {
            Some(Token::Text(text)) => Expr::Literal(Value::Text(text)),
            Some(Token::Number(number)) => Expr::Literal(Value::Int(number)),
            Some(Token::Word(word)) => match word.as_str() {
                "True" => Expr::Literal(Value::Bool(true)),
                "False" => Expr::Literal(Value::Bool(false)),
                "None" => Expr::Literal(Value::None),
                _ => Expr::Var(word),
            },
            Some(Token::Symbol("(")) => {
                let inner = self.expression()?;
                if !self.symbol(")") {
                    return syntax("a ( is not closed");
                }
                inner
            }
            Some(Token::Symbol("[")) => Expr::List(self.items("]")?),
            other => return syntax(format!("unexpected {other:?} in an expression")),
        })
    }

    /// Comma separated expressions up to the closing symbol, which is taken.
    /// A comma before the closing symbol is allowed.
    fn items(&mut self, close: &'static str) -> Result<Vec<Expr>, TemplateError> {
        let mut items = Vec::new();
        while !self.symbol(close) {
            if !items.is_empty() && !self.symbol(",") {
                return syntax("expected , between items");
            }
            if self.symbol(close) {
                break;
            }
            items.push(self.expression()?);
            if self.at >= self.tokens.len() {
                return syntax(format!("a bracket is not closed, expected {close}"));
            }
        }
        Ok(items)
    }
}
