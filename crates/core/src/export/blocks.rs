//! Block structure of a page: headings, paragraphs, lists, tables, rules and
//! verbatim blocks.

use super::Targets;
use super::html::{escape, heading_anchor};
use super::inline::inline;
use crate::markup::{
    ListItem, Marker, block_fence, closes_block, heading_of, indent_of, list_item, plain_text,
};

/// Turns the wiki text of a page into an HTML fragment.
pub fn render_html(body: &str, targets: &dyn Targets) -> String {
    let lines: Vec<&str> = body.lines().collect();
    let mut output = String::with_capacity(body.len() * 2);
    let mut index = 0;
    while index < lines.len() {
        index = render_block(&lines, index, targets, &mut output);
    }
    output
}

/// Renders the block that starts at `lines[start]` and returns the index of
/// the first line behind it.
fn render_block(lines: &[&str], start: usize, targets: &dyn Targets, output: &mut String) -> usize {
    let line = lines[start];
    let (indent, content) = indent_of(line);

    if let Some(end) = verbatim_end(lines, start, indent, content) {
        let inner: Vec<&str> = lines[start + 1..end]
            .iter()
            .map(|inner| inner.strip_prefix(&"\t".repeat(indent)).unwrap_or(inner))
            .collect();
        output.push_str(&format!("<pre>{}</pre>\n", escape(&inner.join("\n"))));
        return end + 1;
    }
    if let Some((level, text)) = heading_of(line) {
        let anchor = heading_anchor(&plain_text(text));
        output.push_str(&format!("<h{level} id=\"{}\">", escape(&anchor)));
        inline(text, targets, false, output);
        output.push_str(&format!("</h{level}>\n"));
        return start + 1;
    }
    if is_rule(line) {
        output.push_str("<hr>\n");
        return start + 1;
    }
    if starts_table(lines, start) {
        let end = (start..lines.len())
            .find(|row| !is_table_row(lines[*row]))
            .unwrap_or(lines.len());
        render_table(&lines[start..end], targets, output);
        return end;
    }
    if list_item(line).is_some() {
        let items: Vec<ListItem<'_>> = lines[start..]
            .iter()
            .map_while(|candidate| list_item(candidate))
            .collect();
        render_list(&items, targets, output);
        output.push('\n');
        return start + items.len();
    }
    if content.is_empty() {
        return start + 1;
    }
    render_paragraph(lines, start, indent, targets, output)
}

/// Line of the closing fence when `content` opens a verbatim block or object
/// that is closed somewhere below.
fn verbatim_end(lines: &[&str], start: usize, indent: usize, content: &str) -> Option<usize> {
    let fence = block_fence(content)?;
    (start + 1..lines.len()).find(|candidate| closes_block(lines[*candidate], indent, fence))
}

/// Lines up to the next blank line or block; a line break stays a line break.
fn render_paragraph(
    lines: &[&str],
    start: usize,
    indent: usize,
    targets: &dyn Targets,
    output: &mut String,
) -> usize {
    match indent.min(6) {
        0 => output.push_str("<p>"),
        level => output.push_str(&format!("<p class=\"indent{level}\">")),
    }
    let mut index = start;
    while let Some(candidate) = lines.get(index) {
        if index > start && ends_paragraph(lines, index) {
            break;
        }
        if index > start {
            output.push_str("<br>\n");
        }
        inline(
            candidate.trim_end().trim_start_matches('\t'),
            targets,
            false,
            output,
        );
        index += 1;
    }
    output.push_str("</p>\n");
    index
}

fn ends_paragraph(lines: &[&str], index: usize) -> bool {
    let line = lines[index];
    let text = line.trim_end();
    text.trim().is_empty()
        || heading_of(line).is_some()
        || is_rule(line)
        || list_item(line).is_some()
        || text.trim_start_matches('\t') == "'''"
        || starts_table(lines, index)
}

fn is_rule(line: &str) -> bool {
    let text = line.trim_end();
    text.len() >= 5 && text.chars().all(|c| c == '-')
}

fn is_table_row(line: &str) -> bool {
    let trimmed = line.trim_end();
    trimmed.len() >= 2 && trimmed.starts_with('|') && trimmed.ends_with('|')
}

/// A table needs at least two rows: a single `|…|` line is text.
fn starts_table(lines: &[&str], index: usize) -> bool {
    is_table_row(lines[index]) && lines.get(index + 1).is_some_and(|next| is_table_row(next))
}

/// A list that is open while its items are written.
struct OpenList {
    indent: usize,
    numbered: bool,
}

fn render_list(items: &[ListItem<'_>], targets: &dyn Targets, output: &mut String) {
    let mut open: Vec<OpenList> = Vec::new();
    let close = |open: &mut Vec<OpenList>, output: &mut String| {
        if let Some(list) = open.pop() {
            output.push_str(if list.numbered {
                "</li></ol>"
            } else {
                "</li></ul>"
            });
        }
    };
    for item in items {
        let numbered = matches!(item.marker, Marker::Numbered(_));
        while open.last().is_some_and(|list| list.indent > item.indent) {
            close(&mut open, output);
        }
        match open.last() {
            Some(list) if list.indent == item.indent && list.numbered == numbered => {
                output.push_str("</li>");
            }
            Some(list) if list.indent == item.indent => {
                close(&mut open, output);
                open_list(item, output);
                open.push(OpenList {
                    indent: item.indent,
                    numbered,
                });
            }
            _ => {
                open_list(item, output);
                open.push(OpenList {
                    indent: item.indent,
                    numbered,
                });
            }
        }
        match item.marker {
            Marker::Checkbox(state) => {
                let (class, symbol) = match state {
                    '*' => ("done", "☑"),
                    'x' => ("dropped", "☒"),
                    '>' => ("moved", "▷"),
                    '<' => ("moved", "◁"),
                    _ => ("open", "☐"),
                };
                output.push_str(&format!(
                    "<li class=\"check {class}\"><span class=\"box\">{symbol}</span> "
                ));
            }
            Marker::Bullet | Marker::Numbered(_) => output.push_str("<li>"),
        }
        inline(item.text, targets, false, output);
    }
    while !open.is_empty() {
        close(&mut open, output);
    }
}

fn open_list(item: &ListItem<'_>, output: &mut String) {
    let Marker::Numbered(counter) = item.marker else {
        output.push_str("<ul>");
        return;
    };
    if let Ok(start) = counter.parse::<u64>() {
        output.push_str(&format!("<ol start=\"{start}\">"));
        return;
    }
    let letter = counter.chars().next().unwrap_or('a');
    let kind = if letter.is_ascii_uppercase() {
        'A'
    } else {
        'a'
    };
    let start = (letter.to_ascii_lowercase() as u8).saturating_sub(b'a') + 1;
    output.push_str(&format!("<ol type=\"{kind}\" start=\"{start}\">"));
}

fn table_cells(line: &str) -> Vec<String> {
    let trimmed = line.trim();
    let body = &trimmed[1..trimmed.len() - 1];
    let mut cells = Vec::new();
    let mut current = String::new();
    let mut characters = body.chars();
    while let Some(character) = characters.next() {
        match character {
            '\\' => match characters.next() {
                Some('n') => current.push('\n'),
                Some('t') => current.push('\t'),
                Some(other) => current.push(other),
                None => current.push('\\'),
            },
            '|' => {
                cells.push(current.trim().to_owned());
                current.clear();
            }
            other => current.push(other),
        }
    }
    cells.push(current.trim().to_owned());
    cells
}

/// Column alignments from a row like `|:--|--:|`, or none when the second
/// row is a data row.
fn table_alignments(row: Option<&&str>) -> Option<Vec<&'static str>> {
    let row = row.filter(|row| {
        row.chars()
            .all(|c| matches!(c, ' ' | '\t' | '|' | '-' | ':'))
    })?;
    Some(
        table_cells(row)
            .iter()
            .map(|cell| match (cell.starts_with(':'), cell.ends_with(':')) {
                (true, true) => "center",
                (false, true) => "right",
                (true, false) => "left",
                _ => "",
            })
            .collect(),
    )
}

fn render_table(rows: &[&str], targets: &dyn Targets, output: &mut String) {
    let headers: Vec<String> = table_cells(rows[0])
        .into_iter()
        .map(|header| match header.strip_suffix('<') {
            Some(_) => header.trim_end_matches('<').trim_end().to_owned(),
            None => header,
        })
        .collect();
    let alignments = table_alignments(rows.get(1));
    let class = |column: usize| match alignments.as_ref().and_then(|a| a.get(column)) {
        Some(align) if !align.is_empty() => format!(" class=\"{align}\""),
        _ => String::new(),
    };
    output.push_str("<table><thead><tr>");
    for (column, header) in headers.iter().enumerate() {
        output.push_str(&format!("<th{}>{}</th>", class(column), escape(header)));
    }
    output.push_str("</tr></thead><tbody>");
    let first_data_row = if alignments.is_some() { 2 } else { 1 };
    for row in &rows[first_data_row..] {
        output.push_str("<tr>");
        let cells = table_cells(row);
        for column in 0..headers.len().max(cells.len()) {
            output.push_str(&format!("<td{}>", class(column)));
            if let Some(cell) = cells.get(column) {
                for (index, part) in cell.split('\n').enumerate() {
                    if index > 0 {
                        output.push_str("<br>");
                    }
                    inline(part, targets, false, output);
                }
            }
            output.push_str("</td>");
        }
        output.push_str("</tr>");
    }
    output.push_str("</tbody></table>\n");
}

#[cfg(test)]
mod tests {
    use super::super::NoTargets;
    use super::*;

    fn html(body: &str) -> String {
        render_html(body, &NoTargets)
    }

    #[test]
    fn inline_formats() {
        assert_eq!(
            html("a **fett** //kursiv// __markiert__ ~~weg~~ ''code **roh**'' H_{2}O x^{2}"),
            "<p>a <strong>fett</strong> <em>kursiv</em> <mark>markiert</mark> <s>weg</s> <code>code **roh**</code> H<sub>2</sub>O x<sup>2</sup></p>\n"
        );
        assert_eq!(
            html("**fett //und kursiv//**"),
            "<p><strong>fett <em>und kursiv</em></strong></p>\n"
        );
        assert_eq!(html("offen ** ohne Ende"), "<p>offen ** ohne Ende</p>\n");
        assert_eq!(
            html("@tag und mail@example.org"),
            "<p><span class=\"tag\">@tag</span> und mail@example.org</p>\n"
        );
    }

    #[test]
    fn everything_from_the_page_is_escaped() {
        assert_eq!(
            html("<script>alert(1)</script> & \"x\""),
            "<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;</p>\n"
        );
        assert_eq!(
            html("== <b>Titel</b> =="),
            "<h5 id=\"btitelb\">&lt;b&gt;Titel&lt;/b&gt;</h5>\n"
        );
        assert!(!html("{{./a.png|\"><script>}}").contains("<script>"));
        assert!(!html("[[Seite|<img src=x onerror=alert(1)>]]").contains("<img"));
    }

    #[test]
    fn only_safe_addresses_become_links() {
        assert_eq!(
            html("siehe https://example.org/a_(b). Ende"),
            "<p>siehe <a href=\"https://example.org/a_(b)\" rel=\"noopener noreferrer\">https://example.org/a_(b)</a>. Ende</p>\n"
        );
        assert_eq!(
            html("[[www.example.org|Seite]]"),
            "<p><a href=\"https://www.example.org\">Seite</a></p>\n"
        );
        assert_eq!(
            html("[[a@b.de]]"),
            "<p><a href=\"mailto:a@b.de\">a@b.de</a></p>\n"
        );
        for hostile in [
            "[[javascript://x%0Aalert(1)|klick]]",
            "[[data://text/html,<script>|klick]]",
            "[[vbscript://x|klick]]",
        ] {
            let rendered = html(hostile);
            assert!(!rendered.contains("href"), "{rendered}");
            assert!(rendered.contains("klick"));
        }
        assert_eq!(
            html("http://a.de //kursiv//"),
            "<p><a href=\"http://a.de\" rel=\"noopener noreferrer\">http://a.de</a> <em>kursiv</em></p>\n"
        );
    }

    #[test]
    fn blocks() {
        assert_eq!(
            html("====== Titel ======\nErste Zeile\nzweite Zeile\n\n\tEingerückt\n-----\n"),
            "<h1 id=\"titel\">Titel</h1>\n<p>Erste Zeile<br>\nzweite Zeile</p>\n<p class=\"indent1\">Eingerückt</p>\n<hr>\n"
        );
        assert_eq!(
            html("'''\n**roh** <b>\n'''\nnach"),
            "<pre>**roh** &lt;b&gt;</pre>\n<p>nach</p>\n"
        );
        assert_eq!(
            html("{{{code: lang=\"py\"\nprint(1)\n}}}"),
            "<pre>print(1)</pre>\n"
        );
        assert_eq!(
            html("'''\nohne Ende"),
            "<p>&#39;&#39;&#39;<br>\nohne Ende</p>\n"
        );
    }

    #[test]
    fn lists_nest_and_keep_their_kind() {
        assert_eq!(
            html("* a\n\t* b\n\t* c\n* d"),
            "<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>\n"
        );
        assert_eq!(
            html("3. drei\n4. vier\n\tb. unter"),
            "<ol start=\"3\"><li>drei</li><li>vier<ol type=\"a\" start=\"2\"><li>unter</li></ol></li></ol>\n"
        );
        assert_eq!(
            html("[ ] offen\n[*] fertig\n[x] weg"),
            "<ul><li class=\"check open\"><span class=\"box\">☐</span> offen</li><li class=\"check done\"><span class=\"box\">☑</span> fertig</li><li class=\"check dropped\"><span class=\"box\">☒</span> weg</li></ul>\n"
        );
        assert_eq!(
            html("* a\n1. b"),
            "<ul><li>a</li></ul><ol start=\"1\"><li>b</li></ol>\n"
        );
        assert_eq!(html("aa. kein Punkt"), "<p>aa. kein Punkt</p>\n");
    }

    #[test]
    fn tables() {
        assert_eq!(
            html("| A | B < |\n|:--|--:|\n| **1** | x \\| y |\n| 2 |"),
            "<table><thead><tr><th class=\"left\">A</th><th class=\"right\">B</th></tr></thead><tbody><tr><td class=\"left\"><strong>1</strong></td><td class=\"right\">x | y</td></tr><tr><td class=\"left\">2</td><td class=\"right\"></td></tr></tbody></table>\n"
        );
        assert_eq!(html("| nur eine Zeile |"), "<p>| nur eine Zeile |</p>\n");
    }

    #[test]
    fn anchors_and_heading_ids() {
        assert_eq!(
            heading_anchor("Was ist ein \"Projekt\" ?"),
            "was-ist-ein-projekt-"
        );
        assert_eq!(
            html("Text {{id: ziel}} hier"),
            "<p>Text <a id=\"ziel\"></a> hier</p>\n"
        );
    }
}
