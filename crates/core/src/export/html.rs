//! HTML building blocks shared by the export and the print page: escaping,
//! heading ids, web addresses and the page skeleton with its style sheet.

pub(super) fn escape(text: &str) -> String {
    let mut output = String::with_capacity(text.len() + 16);
    for character in text.chars() {
        match character {
            '&' => output.push_str("&amp;"),
            '<' => output.push_str("&lt;"),
            '>' => output.push_str("&gt;"),
            '"' => output.push_str("&quot;"),
            '\'' => output.push_str("&#39;"),
            other => output.push(other),
        }
    }
    output
}

/// Id a heading gets, so `Page#heading` links can point at it.
pub(super) fn heading_anchor(text: &str) -> String {
    text.trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_whitespace() { '-' } else { c })
        .filter(|c| c.is_alphanumeric() || matches!(c, '-' | '_'))
        .collect()
}

/// Web address that may be used as a link target, or `None`.
pub(super) fn safe_url(target: &str) -> Option<String> {
    let lower = target.to_ascii_lowercase();
    if ["https://", "http://", "ftp://", "mailto:"]
        .iter()
        .any(|scheme| lower.starts_with(scheme))
    {
        Some(target.to_owned())
    } else if lower.starts_with("www.") {
        Some(format!("https://{target}"))
    } else {
        None
    }
}

const STYLE: &str = "\
:root{color-scheme:light dark;--bg:#fbfaf9;--text:#1c1917;--soft:#6b6460;--line:#e2ddd9;--accent:#c40812;--code:#f1eeeb;--mark:#fde68a}\
@media (prefers-color-scheme:dark){:root{--bg:#141010;--text:#f5f5f5;--soft:#a3a3a1;--line:#362929;--accent:#ff4d57;--code:#201919;--mark:#6b5a12}}\
*{box-sizing:border-box}\
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 'Segoe UI',system-ui,sans-serif}\
main,nav,footer,.hint{max-width:820px;margin:0 auto;padding:0 24px}\
nav{padding-top:20px;font-size:13px;color:var(--soft)}\
nav a{color:var(--soft)}\
main{padding-top:8px;padding-bottom:40px}\
footer{padding-bottom:32px;font-size:12px;color:var(--soft);border-top:1px solid var(--line);padding-top:14px}\
h1,h2,h3,h4,h5{line-height:1.25;margin:1.4em 0 .5em}\
h1{font-size:2em}h2{font-size:1.55em}h3{font-size:1.3em}h4{font-size:1.1em}h5{font-size:1em;color:var(--soft)}\
a{color:var(--accent)}\
p{margin:.7em 0}\
.indent1{margin-left:2em}.indent2{margin-left:4em}.indent3{margin-left:6em}.indent4{margin-left:8em}.indent5{margin-left:10em}.indent6{margin-left:12em}\
ul,ol{padding-left:1.6em;margin:.5em 0}\
li.check{list-style:none;margin-left:-1.4em}\
li.done,li.dropped{color:var(--soft)}\
li.dropped{text-decoration:line-through}\
.box{font-size:1.1em}\
code,pre{font-family:Consolas,'Cascadia Mono',monospace;font-size:.92em;background:var(--code);border-radius:4px}\
code{padding:1px 4px}\
pre{padding:12px 14px;overflow:auto;white-space:pre-wrap}\
mark{background:var(--mark);color:inherit;border-radius:3px;padding:0 2px}\
table{border-collapse:collapse;margin:1em 0}\
th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}\
th{background:var(--code)}\
.right{text-align:right}.center{text-align:center}\
img{max-width:100%;height:auto}\
hr{border:0;border-top:1px solid var(--line);margin:1.6em 0}\
.tag{color:#b45309;font-weight:600}\
.nolink{border-bottom:1px dotted var(--soft)}\
.tree,.tree ul{list-style:none;padding-left:1.2em}.tree{padding-left:0}\
.hint{margin-top:16px;padding:10px 24px;font-size:13px;color:var(--soft)}\
@media print{nav,footer,.hint{display:none}body{background:#fff;color:#000}main{max-width:none;padding:0}a{color:inherit;text-decoration:none}}";

/// A complete page. `title`, `language` and the texts are escaped here;
/// `navigation`, `content` and `footer` are HTML that is already safe.
pub(super) fn document(
    language: &str,
    title: &str,
    navigation: &str,
    content: &str,
    footer: &str,
) -> String {
    format!(
        "<!DOCTYPE html>\n<html lang=\"{}\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>{}</title>\n<style>{STYLE}</style>\n</head>\n<body>\n{navigation}<main>\n{content}</main>\n{footer}</body>\n</html>\n",
        escape(language),
        escape(title),
    )
}
