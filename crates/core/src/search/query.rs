//! The query language: words and phrases, `AND`/`OR`/`NOT`, `+`/`-`, groups
//! and keywords such as `Content:` or `Tag:`, parsed into a tree.

/// Where a term has to match.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Field {
    Any,
    Content,
    Name,
    Section,
    Tag,
    Tags,
    LinksFrom,
    LinksTo,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Node {
    Match {
        field: Field,
        text: String,
        exact_case: bool,
    },
    Not(Box<Node>),
    And(Vec<Node>),
    Or(Vec<Node>),
}

impl Node {
    fn matching(field: Field, text: impl Into<String>, exact_case: bool) -> Node {
        Node::Match {
            field,
            text: text.into(),
            exact_case,
        }
    }

    fn not(node: Node) -> Node {
        Node::Not(Box::new(node))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Word(String),
    Phrase(String),
    Open,
    Close,
}

/// Groups nest at most this deep; the rest of a deeper query is dropped.
const MAX_DEPTH: usize = 64;

fn tokenize(query: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut characters = query.chars().peekable();
    while let Some(character) = characters.next() {
        match character {
            c if c.is_whitespace() => {}
            '(' => tokens.push(Token::Open),
            ')' => tokens.push(Token::Close),
            '"' | '\'' => {
                let mut phrase = String::new();
                for next in characters.by_ref() {
                    if next == character {
                        break;
                    }
                    phrase.push(next);
                }
                tokens.push(Token::Phrase(phrase));
            }
            _ => {
                let mut word = String::from(character);
                while let Some(next) = characters.peek() {
                    if next.is_whitespace() || matches!(next, '(' | ')' | '"') {
                        break;
                    }
                    word.push(*next);
                    characters.next();
                    // A keyword ends at its colon so its value may be a phrase.
                    if word.ends_with(':') && keyword(&word[..word.len() - 1]).is_some() {
                        if characters.peek() == Some(&'=') {
                            word.push('=');
                            characters.next();
                        }
                        break;
                    }
                }
                tokens.push(Token::Word(word));
            }
        }
    }
    tokens
}

fn keyword(name: &str) -> Option<Field> {
    Some(match name.to_ascii_lowercase().as_str() {
        "content" | "text" => Field::Content,
        "name" => Field::Name,
        "section" | "namespace" => Field::Section,
        "tag" => Field::Tag,
        "tags" => Field::Tags,
        "linksfrom" | "links" => Field::LinksFrom,
        "linksto" => Field::LinksTo,
        "any" => Field::Any,
        _ => return None,
    })
}

/// Parses a query. Stray operators and unbalanced groups are tolerated.
pub(super) fn parse(query: &str) -> Node {
    Parser {
        tokens: tokenize(query),
        position: 0,
        depth: 0,
    }
    .query()
}

struct Parser {
    tokens: Vec<Token>,
    position: usize,
    depth: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.position)
    }

    fn next(&mut self) -> Option<Token> {
        let token = self.tokens.get(self.position).cloned();
        self.position += 1;
        token
    }

    /// Terms joined by OR form a group; the groups are joined by AND.
    fn query(&mut self) -> Node {
        let mut groups: Vec<Vec<Node>> = Vec::new();
        let mut join_with_or = false;
        while let Some(token) = self.peek() {
            match token {
                Token::Close => break,
                Token::Word(word) if word.eq_ignore_ascii_case("and") => {
                    self.position += 1;
                }
                Token::Word(word) if word.eq_ignore_ascii_case("or") => {
                    self.position += 1;
                    join_with_or = !groups.is_empty();
                }
                _ => {
                    let Some(term) = self.term() else { continue };
                    match groups.last_mut() {
                        Some(group) if join_with_or => group.push(term),
                        _ => groups.push(vec![term]),
                    }
                    join_with_or = false;
                }
            }
        }
        let mut nodes: Vec<Node> = groups
            .into_iter()
            .map(|mut group| {
                if group.len() == 1 {
                    group.remove(0)
                } else {
                    Node::Or(group)
                }
            })
            .collect();
        if nodes.len() == 1 {
            nodes.remove(0)
        } else {
            Node::And(nodes)
        }
    }

    /// The next term, or `None` for a stray token.
    fn term(&mut self) -> Option<Node> {
        let token = self.next()?;
        self.term_from(token)
    }

    /// The term `token` starts. Past [`MAX_DEPTH`] the rest of the query is
    /// dropped.
    fn term_from(&mut self, token: Token) -> Option<Node> {
        if self.depth >= MAX_DEPTH {
            self.position = self.tokens.len();
            return None;
        }
        self.depth += 1;
        let node = match token {
            Token::Open => {
                let inner = self.query();
                if self.peek() == Some(&Token::Close) {
                    self.position += 1;
                }
                Some(inner)
            }
            Token::Close => None,
            Token::Phrase(text) => {
                (!text.is_empty()).then(|| Node::matching(Field::Any, text, false))
            }
            Token::Word(word) => self.word_term(word),
        };
        self.depth -= 1;
        node
    }

    fn word_term(&mut self, word: String) -> Option<Node> {
        if word.eq_ignore_ascii_case("not") || word == "-" {
            return self.term().map(Node::not);
        }
        if word == "+" {
            return self.term();
        }
        if let Some(rest) = word.strip_prefix('-').filter(|rest| !rest.is_empty()) {
            return self.term_from(Token::Word(rest.to_owned())).map(Node::not);
        }
        if let Some(rest) = word.strip_prefix('+').filter(|rest| !rest.is_empty()) {
            return self.term_from(Token::Word(rest.to_owned()));
        }
        let (head, exact_case) = match word.strip_suffix(":=") {
            Some(head) => (head, true),
            None => (word.strip_suffix(':').unwrap_or(""), false),
        };
        if let Some(field) = keyword(head) {
            return self.keyword_value(field, exact_case);
        }
        // `name:value` written without a blank.
        if let Some((head, value)) = word.split_once(':')
            && let Some(field) = keyword(head)
            && !value.is_empty()
        {
            return Some(match value.strip_prefix('=') {
                Some(value) => Node::matching(field, value, true),
                None => Node::matching(field, value, false),
            });
        }
        if word.starts_with('@') && word.len() > 1 {
            return Some(Node::matching(Field::Tags, word, false));
        }
        Some(Node::matching(Field::Any, word, false))
    }

    /// Value of a keyword: a word, a phrase, or `(a -b)`.
    fn keyword_value(&mut self, field: Field, exact_case: bool) -> Option<Node> {
        let node = |text: &str| Node::matching(field, text, exact_case);
        match self.next()? {
            Token::Word(text) | Token::Phrase(text) => Some(node(&text)),
            Token::Close => None,
            Token::Open => {
                let mut parts = Vec::new();
                while let Some(token) = self.next() {
                    match token {
                        Token::Close => break,
                        Token::Open => {}
                        Token::Phrase(text) => parts.push(node(&text)),
                        Token::Word(text) => match text.strip_prefix('-') {
                            Some(rest) if !rest.is_empty() => parts.push(Node::not(node(rest))),
                            _ => parts.push(node(text.trim_start_matches('+'))),
                        },
                    }
                }
                Some(Node::And(parts))
            }
        }
    }
}
