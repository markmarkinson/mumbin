//! Matching of one search term against page text and page names.

/// Matches `pattern` against `text`; `*` stands for any run of characters
/// that `stop` does not reject. Walks forward once and, on a mismatch, goes
/// back only to the latest `*`, so many `*` in a pattern cost time in
/// proportion to the text, not to its power.
fn glob(pattern: &[char], text: &[char], stop: fn(char) -> bool) -> bool {
    let (mut p, mut t) = (0, 0);
    // Pattern position after the latest `*` and the text position it covers up to.
    let mut star: Option<(usize, usize)> = None;
    while t < text.len() {
        if pattern.get(p) == Some(&'*') {
            p += 1;
            star = Some((p, t));
        } else if pattern.get(p) == Some(&text[t]) {
            p += 1;
            t += 1;
        } else if let Some((after, covered)) = star {
            if stop(text[covered]) {
                return false;
            }
            star = Some((after, covered + 1));
            p = after;
            t = covered + 1;
        } else {
            return false;
        }
    }
    while pattern.get(p) == Some(&'*') {
        p += 1;
    }
    p == pattern.len()
}

/// Collapses everything that is not a letter or digit into single blanks.
fn words_only(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut blank = true;
    for character in text.chars() {
        if character.is_alphanumeric() {
            output.push(character);
            blank = false;
        } else if !blank {
            output.push(' ');
            blank = true;
        }
    }
    output.trim_end().to_owned()
}

/// Number of times `needle` occurs in page text. `haystack` and `needle`
/// must have the same case treatment applied.
pub(super) fn count_in_text(haystack: &str, needle: &str) -> usize {
    if needle.is_empty() {
        return 0;
    }
    if needle.contains('*') {
        return count_wildcard(haystack, needle);
    }
    if needle.chars().any(char::is_whitespace) {
        return count_phrase(haystack, needle);
    }
    haystack.matches(needle).count()
}

/// Wildcards work on whole words: the term must cover a word from start to
/// end unless a `*` leaves that side open.
fn count_wildcard(haystack: &str, needle: &str) -> usize {
    let pattern: Vec<Vec<char>> = needle
        .split_whitespace()
        .map(|part| part.chars().collect())
        .collect();
    let words: Vec<Vec<char>> = haystack
        .split_whitespace()
        .map(|word| {
            word.trim_matches(|c: char| !c.is_alphanumeric())
                .chars()
                .collect()
        })
        .collect();
    if pattern.is_empty() || words.len() < pattern.len() {
        return 0;
    }
    (0..=words.len() - pattern.len())
        .filter(|start| {
            pattern
                .iter()
                .zip(&words[*start..])
                .all(|(part, word)| glob(part, word, |_| false))
        })
        .count()
}

/// A blank in the term matches any run of blanks or punctuation.
fn count_phrase(haystack: &str, needle: &str) -> usize {
    let mut wanted = words_only(needle);
    if wanted.is_empty() {
        return 0;
    }
    if needle.starts_with(char::is_whitespace) {
        wanted.insert(0, ' ');
    }
    if needle.ends_with(char::is_whitespace) {
        wanted.push(' ');
    }
    format!(" {} ", words_only(haystack))
        .matches(&wanted)
        .count()
}

/// Where in a name the end of a name pattern has to sit.
#[derive(PartialEq)]
enum End {
    Anywhere,
    /// `::`: the name ends here, no sub-pages.
    Exact,
    /// `:+`: only sub-pages follow.
    OnlySubPages,
    /// `:`: the end of a name part, sub-pages allowed.
    AtPartBoundary,
}

/// Page-name search. Besides plain text (found anywhere, `*` not crossing a
/// `:`), the pattern may say where it sits: `::` first anchors it at the root
/// of the notebook, a single `:` first at the start of a name part; at the end,
/// `::` excludes sub-pages, `:+` wants only sub-pages and a single `:` wants
/// the end of a name part (sub-pages allowed).
pub(super) fn name_matches(name: &str, pattern: &str) -> bool {
    let (from_root, pattern) = match pattern.strip_prefix("::") {
        Some(rest) => (true, rest),
        None => (false, pattern),
    };
    let (part_start, pattern) = match pattern.strip_prefix(':') {
        Some(rest) if !from_root => (true, rest),
        _ => (false, pattern),
    };
    let (pattern, end_rule) = if let Some(rest) = pattern.strip_suffix("::") {
        (rest, End::Exact)
    } else if let Some(rest) = pattern.strip_suffix(":+") {
        (rest, End::OnlySubPages)
    } else if let Some(rest) = pattern.strip_suffix(':') {
        (rest, End::AtPartBoundary)
    } else {
        (pattern, End::Anywhere)
    };
    if pattern.is_empty() {
        return false;
    }
    if !pattern.contains('*') && !from_root && !part_start && end_rule == End::Anywhere {
        return name.contains(pattern);
    }
    let pattern: Vec<char> = pattern.chars().collect();
    let name: Vec<char> = name.chars().collect();
    // Match all permitted starting positions together. Trying every substring
    // with glob separately was cubic for long names and a failed wildcard.
    let mut reachable = vec![false; pattern.len() + 1];
    let mut next = reachable.clone();
    for at in 0..=name.len() {
        if (!from_root || at == 0) && (!part_start || at == 0 || name[at - 1] == ':') {
            reachable[0] = true;
        }
        for p in 0..pattern.len() {
            if reachable[p] && pattern[p] == '*' {
                reachable[p + 1] = true;
            }
        }
        let fits_end = match end_rule {
            End::Anywhere => true,
            End::Exact => at == name.len(),
            End::OnlySubPages => at + 1 < name.len() && name[at] == ':',
            End::AtPartBoundary => at == name.len() || name[at] == ':',
        };
        if fits_end && reachable[pattern.len()] {
            return true;
        }
        let Some(&character) = name.get(at) else {
            break;
        };
        next.fill(false);
        for p in 0..pattern.len() {
            if !reachable[p] {
                continue;
            }
            if pattern[p] == '*' && character != ':' {
                next[p] = true;
            } else if pattern[p] == character {
                next[p + 1] = true;
            }
        }
        std::mem::swap(&mut reachable, &mut next);
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn many_wildcards_do_not_blow_up() {
        let long = "a".repeat(200);
        let text: Vec<char> = long.chars().collect();
        let pattern: Vec<char> = "*a*a*a*a*a*a*a*a*a*a*a*a*b".chars().collect();
        assert!(!glob(&pattern, &text, |_| false));
        let pattern: Vec<char> = "*a*a*a*a*a*a*a*a*a*a*a*a".chars().collect();
        assert!(glob(&pattern, &text, |_| false));
        let stopped: Vec<char> = "ab:cd".chars().collect();
        assert!(!glob(&"a*d".chars().collect::<Vec<_>>(), &stopped, |c| c == ':'));
        assert!(glob(&"a*:*d".chars().collect::<Vec<_>>(), &stopped, |c| c == ':'));
    }

    #[test]
    fn long_names_and_failed_wildcards_are_bounded() {
        let name = "a".repeat(10_000);
        let start = std::time::Instant::now();
        assert!(!name_matches(&name, "*a*a*a*z"));
        assert!(name_matches(&name, "::a*::"));
        assert!(start.elapsed() < std::time::Duration::from_secs(1));
    }

    #[test]
    fn name_patterns_can_say_where_they_sit() {
        let hit = |name: &str, pattern: &str| name_matches(name, pattern);
        // Anywhere, and a `*` that does not cross a part.
        assert!(hit("projekt:idee", "idee") && hit("projekt:idee", "ekt:id"));
        assert!(hit("projekt:idee", "pro*:idee") && !hit("projekt:idee", "pro*idee"));
        // `::` first: from the root; `:` first: at the start of a part.
        assert!(hit("projekt:idee", "::projekt") && !hit("projekt:idee", "::idee"));
        assert!(hit("projekt:idee", ":idee") && !hit("projekt:idee", ":dee"));
        // `::` last: no sub-pages; `:+` last: only sub-pages; `:` last: end of a part.
        assert!(hit("projekt", "::projekt::") && !hit("projekt:idee", "::projekt::"));
        assert!(hit("projekt:idee", "::projekt:+") && !hit("projekt", "::projekt:+"));
        assert!(
            hit("projekt:idee", "::projekt:")
                && hit("projekt", "::projekt:")
                && !hit("projektplan", "::projekt:")
        );
        assert!(!hit("projekt", ""));
        assert!(!hit("projekt:idee", "::"));
    }
}
