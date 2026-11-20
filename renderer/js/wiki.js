// Recognises wiki markup line by line so the editor can style it in place.
// Pure functions without DOM access.
// Syntax rules: .project/research/wiki-formatspezifikation.md, chapter 3.

import { isTableRow } from "./table.js";

// Looking for the end of `[[`, `{{`, `**` ... in a line without one takes time
// that grows with the square of its length, and the editor scans the page on
// every key. A page can come from anywhere, so very long lines stay plain text
// (a normal paragraph is a few thousand characters).
const MAX_INLINE_LINE = 20000;

const HEADING = /^(={2,})[ \t]+(\S.*?)[ \t]*(=*)[ \t]*$/;
const VERBATIM_FENCE = /^\t*'''[ \t]*$/;
const OBJECT_OPEN = /^(\t*)\{\{\{[ \t]*([^\s:]+):(.*)$/;
const OBJECT_CLOSE = /^\t*\}\}\}[ \t]*$/;
const RULE = /^-{5,}$/;
const LIST_ITEM = /^(\t*)(\*|•|\[[ *x<>]\]|\d+\.|[A-Za-z]\.)[ \t]/;

const CHECKBOX_STATE = { " ": "open", "*": "done", x: "failed", ">": "moved", "<": "moved" };
// What a click on a checkbox in the editor turns it into: open → done → failed → open.
const CHECKBOX_CYCLE = { " ": "*", "*": "x", x: " ", ">": " ", "<": " " };

const CODE = /''(?!')(.+?)''/g;
const LINK = /\[\[(?!\[)(.+?)\]\]/g;
const BRACES = /\{\{(?!\{)(.+?)\}\}/g;
const ANCHOR = /^id:\s+(\w[\w-]+)\s*$/;
const URL = /(?<![\w/])(?:https?:\/\/|www\.)[^\s<]+/g;
const TRAILING_URL_PUNCTUATION = /[?!.,:*_~'"]+$/;
const TAG = /(?<!\S)@\w+/g;
const EXTERNAL_TARGET = /^(?:[a-z][\w+.-]*:\/\/|www\.|mailto:)/i;
const MAIL_TARGET = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
const FILE_TARGET = /^(?:file:\/|\.{0,2}[\\/]|~[\\/]|[A-Za-z]:[\\/])/;

// [class, pattern, length of the opening marker, length of the closing marker]
const FORMATS = [
    ["wk-bold", /\*\*(?!\*)(.+?)\*\*/g, 2, 2],
    ["wk-italic", /\/\/(?!\/)(.*?)(?<!:)\/\//g, 2, 2],
    ["wk-highlight", /__(?!_)(.+?)__/g, 2, 2],
    ["wk-strike", /~~(?!~)(.+?)~~/g, 2, 2],
    ["wk-sub", /_\{(?!~)(.+?)\}/g, 2, 1],
    ["wk-sup", /\^\{(?!~)(.+?)\}/g, 2, 1],
];

// The same markers as FORMATS, for text that is stripped instead of scanned.
// The italic pattern also refuses a `//` that follows a `:` (the one of `http://`).
const STRIP_FORMATS = [
    /\*\*(?!\*)(.+?)\*\*/g,
    /(?<!:)\/\/(?!\/)(.*?)(?<!:)\/\//g,
    /__(?!_)(.+?)__/g,
    /~~(?!~)(.+?)~~/g,
    /''(?!')(.+?)''/g,
    /[_^]\{(.+?)\}/g,
];

/** Heading level for a run of `=`: six or more is level 1 (largest), two is level 5. */
const levelOf = (marks) => 7 - Math.min(6, marks.length);

/**
 * Splits a heading line into its parts, or null when the line is no heading.
 * @returns {{marks: string, text: string, closing: string}|null}
 */
export function parseHeading(line) {
    const match = HEADING.exec(line);
    return match ? { marks: match[1], text: match[2], closing: match[3] } : null;
}

/** Anchor id a heading gets implicitly (format specification 3.2). */
export function headingAnchor(text) {
    return text
        .trim()
        .toLowerCase()
        .replace(/\s/g, "-")
        .replace(/[^\p{L}\p{N}_-]/gu, "");
}

/** Removes inline format markers (bold, italic, ...) and keeps the text between them. */
export function stripFormatting(text) {
    return STRIP_FORMATS.reduce((result, pattern) => result.replace(pattern, "$1"), text);
}

/** Removes inline markup so text can be shown in lists and titles. */
export function plainText(text) {
    return stripFormatting(
        text
            .replace(/\{\{id:\s+[\w-]+\s*\}\}/g, "")
            .replace(/\[\[(?!\[)([^\]|]*)\|([^\]]*)\]\]/g, "$2")
            .replace(/\[\[(?!\[)([^\]]*)\]\]/g, "$1"),
    ).trim();
}

/** Cuts the characters that never belong to a bare URL off its end. */
function trimUrl(url) {
    let trimmed = url.replace(TRAILING_URL_PUNCTUATION, "");
    const opened = (trimmed.match(/\(/g) || []).length;
    const closed = (trimmed.match(/\)/g) || []).length;
    if (trimmed.endsWith(")") && closed > opened) {
        trimmed = trimmed.slice(0, -1);
    }
    return trimmed;
}

/** "url", "file" or "page" for a link target. */
function linkKind(target) {
    if (EXTERNAL_TARGET.test(target) || MAIL_TARGET.test(target)) return "url";
    if (FILE_TARGET.test(target)) return "file";
    return "page";
}

/** `[from, to)` of every match of `pattern` in `line`. */
const spansOf = (line, pattern) => Array.from(line.matchAll(pattern), (match) => [match.index, match.index + match[0].length]);

/**
 * Finds links in one line.
 * @returns {{from: number, to: number, target: string, kind: "page"|"url"|"file", textFrom: number, textTo: number}[]}
 */
export function findLinks(line) {
    if (line.length > MAX_INLINE_LINE) return [];
    const links = [];
    const opaque = spansOf(line, CODE);
    const inside = (index) => opaque.some(([from, to]) => index >= from && index < to);

    for (const match of line.matchAll(LINK)) {
        if (inside(match.index)) continue;
        const inner = match[1].replace(/^\|+|\|+$/g, "");
        if (!inner) continue;
        const from = match.index;
        const to = from + match[0].length;
        const bar = match[1].indexOf("|", match[1].startsWith("|") ? 1 : 0);
        const hasText = bar > 0 && bar < match[1].length - 1;
        const target = (hasText ? match[1].slice(0, bar) : inner).trim();
        links.push({
            from,
            to,
            target,
            kind: linkKind(target),
            textFrom: hasText ? from + 2 + bar + 1 : from + 2,
            textTo: to - 2,
        });
        opaque.push([from, to]);
    }
    opaque.push(...spansOf(line, BRACES));
    for (const match of line.matchAll(URL)) {
        if (inside(match.index)) continue;
        const url = trimUrl(match[0]);
        if (url.length < 5) continue;
        const from = match.index;
        links.push({ from, to: from + url.length, target: url, kind: "url", textFrom: from, textTo: from + url.length });
    }
    return links.sort((a, b) => a.from - b.from);
}

/** The link under a character position, if any. */
export function linkAt(line, position) {
    return findLinks(line).find((link) => position >= link.from && position < link.to) || null;
}

/** Checkbox at the start of a list item, with the position of its state character. */
export function checkboxAt(line) {
    const match = LIST_ITEM.exec(line);
    if (!match || match[2].length !== 3 || match[2][0] !== "[") return null;
    const from = match[1].length;
    return { from, to: from + 3, state: match[2][1], next: CHECKBOX_CYCLE[match[2][1]] };
}

/**
 * List marker of a line: indentation, marker text, its kind and where the item text starts.
 * @returns {{indent: number, marker: string, type: "bullet"|"check"|"number", textFrom: number}|null}
 */
export function listMarker(line) {
    const match = LIST_ITEM.exec(line);
    if (!match) return null;
    const marker = match[2];
    const type = marker[0] === "[" ? "check" : marker === "*" || marker === "•" ? "bullet" : "number";
    return { indent: match[1].length, marker, type, textFrom: match[0].length };
}

/**
 * Parses `{{source?options|alt}}`.
 * @returns {{src: string, width: number|null, height: number|null, href: string, alt: string}|null}
 */
export function parseImage(inner) {
    if (ANCHOR.test(inner)) return null;
    const bar = inner.indexOf("|");
    const alt = bar >= 0 ? inner.slice(bar + 1) : "";
    let src = (bar >= 0 ? inner.slice(0, bar) : inner).trim();
    const options = {};
    const question = src.indexOf("?");
    if (question > 0) {
        for (const pair of src.slice(question + 1).split("&")) {
            const [name, value = ""] = pair.split("=");
            try {
                options[name] = decodeURIComponent(value);
            } catch {
                options[name] = value;
            }
        }
        src = src.slice(0, question);
    }
    if (!src) return null;
    const size = (value) => (/^\d+$/.test(value || "") ? Number(value) : null);
    return { src, width: size(options.width), height: size(options.height), href: options.href || "", alt };
}

function scanInline(line, tokens, images) {
    if (line.length > MAX_INLINE_LINE) return;
    const opaque = [];
    const blocked = (index) => opaque.some(([from, to]) => index >= from && index < to);
    const syntax = (from, to, span) => tokens.push({ from, to, cls: "wk-syntax", span });

    for (const [from, to] of spansOf(line, CODE)) {
        const span = [from, to];
        syntax(from, from + 2, span);
        tokens.push({ from: from + 2, to: to - 2, cls: "wk-code" });
        syntax(to - 2, to, span);
        opaque.push(span);
    }
    for (const link of findLinks(line)) {
        const span = [link.from, link.to];
        if (link.textFrom > link.from) {
            syntax(link.from, link.textFrom, span);
            syntax(link.textTo, link.to, span);
            // `[[target]]` shows its target as the text, so nothing inside it may be
            // formatted (`//` in `file:///...` is no italic). Only the text behind
            // a `|` can carry formatting.
            const hasOwnText = link.textFrom > link.from + 2;
            opaque.push(hasOwnText ? [link.from, link.textFrom] : span);
        } else {
            opaque.push(span);
        }
        const kindClass = link.kind === "url" ? " wk-link-url" : link.kind === "file" ? " wk-link-file" : "";
        tokens.push({ from: link.textFrom, to: link.textTo, cls: `wk-link${kindClass}`, link });
    }
    for (const match of line.matchAll(BRACES)) {
        const from = match.index;
        const to = from + match[0].length;
        if (blocked(from)) continue;
        if (ANCHOR.test(match[1])) {
            tokens.push({ from, to, cls: "wk-anchor" });
        } else {
            const image = parseImage(match[1]);
            if (!image) continue;
            tokens.push({ from, to, cls: "wk-image" });
            images.push({ from, to, ...image });
        }
        opaque.push([from, to]);
    }
    for (const [from, to] of spansOf(line, TAG)) {
        if (!blocked(from)) tokens.push({ from, to, cls: "wk-tag" });
    }
    for (const [cls, pattern, open, close] of FORMATS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(line)) !== null) {
            const from = match.index;
            const to = from + match[0].length;
            if (blocked(from) || blocked(to - 1)) {
                // A marker inside a URL or verbatim text is not markup; look
                // again right behind it instead of skipping the whole match.
                pattern.lastIndex = from + 1;
                continue;
            }
            const span = [from, to];
            syntax(from, from + open, span);
            tokens.push({ from: from + open, to: to - close, cls });
            syntax(to - close, to, span);
        }
    }
}

/** First line of a fenced block (verbatim text or an object), or null. */
function fenceOpening(line) {
    if (VERBATIM_FENCE.test(line)) return { indent: line.search(/\S/), close: VERBATIM_FENCE };
    if (OBJECT_OPEN.test(line)) return { indent: line.search(/\S/), close: OBJECT_CLOSE };
    return null;
}

/** A line of a fenced block: shown as is, only the fence lines get a dimmed marker. */
function scanFenceLine(line, fence, edge) {
    const entry = { kind: "pre", lineClass: "wk-pre", tokens: [], images: [] };
    if (edge) {
        entry.tokens.push({ from: fence.indent, to: line.trimEnd().length, cls: "wk-syntax" });
        entry.preEdge = edge;
    }
    return entry;
}

function scanHeading(line, heading, entry) {
    entry.kind = "heading";
    entry.level = levelOf(heading.marks);
    entry.lineClass = `wk-heading wk-h${entry.level}`;
    const span = [0, line.length];
    entry.tokens.push({ from: 0, to: line.indexOf(heading.text, heading.marks.length), cls: "wk-syntax", span });
    if (heading.closing) {
        const end = line.trimEnd().length;
        const textEnd = end - heading.closing.length;
        entry.tokens.push({ from: line.slice(0, textEnd).trimEnd().length, to: end, cls: "wk-syntax", span });
    }
}

function scanListItem(item, entry) {
    const to = item.indent + item.marker.length;
    const isBox = item.type === "check";
    const cls = isBox ? `wk-check wk-check-${CHECKBOX_STATE[item.marker[1]]}` : "wk-bullet";
    entry.tokens.push({ from: item.indent, to, cls });
    entry.marker = { from: item.indent, to, type: item.type, state: isBox ? item.marker[1] : "" };
    if (cls.endsWith("done") || cls.endsWith("failed")) entry.lineClass = "wk-item-closed";
}

function scanTextLine(line) {
    const entry = { kind: "text", lineClass: "", tokens: [], images: [] };
    const heading = parseHeading(line);
    if (heading) {
        scanHeading(line, heading, entry);
    } else if (RULE.test(line)) {
        entry.kind = "rule";
        entry.lineClass = "wk-rule";
        return entry;
    } else if (isTableRow(line)) {
        entry.kind = "table";
        entry.lineClass = "wk-table-source";
    } else {
        const item = listMarker(line);
        if (item) scanListItem(item, entry);
    }
    scanInline(line, entry.tokens, entry.images);
    return entry;
}

/** A table needs at least two rows; a lone `|…|` line is ordinary text. */
function groupTables(entries) {
    for (let index = 0; index < entries.length; index += 1) {
        if (entries[index].kind !== "table") continue;
        let end = index;
        while (end + 1 < entries.length && entries[end + 1].kind === "table") end += 1;
        for (let row = index; row <= end; row += 1) {
            if (end > index) {
                entries[row].table = index;
                entries[row].tableEnd = end;
            } else {
                entries[row].kind = "text";
                entries[row].lineClass = "";
            }
        }
        index = end;
    }
}

/**
 * Describes how each line should be styled.
 * @param {string[]} lines
 * @returns {{kind: string, lineClass: string, tokens: object[], images: object[], marker?: object, level?: number, table?: number, tableEnd?: number, preEdge?: string}[]}
 *   `kind` is one of text, heading, rule, pre, table. `table` is the index of
 *   the first line of the table a line belongs to, `tableEnd` its last line.
 */
export function scanDocument(lines) {
    const entries = [];
    let fence = null;
    for (const line of lines) {
        let entry;
        if (!fence) {
            fence = fenceOpening(line);
            entry = fence ? scanFenceLine(line, fence, "start") : scanTextLine(line);
        } else if (fence.close.test(line) && line.search(/\S/) === fence.indent) {
            entry = scanFenceLine(line, fence, "end");
            fence = null;
        } else {
            entry = scanFenceLine(line, fence);
        }
        entry.tokens = entry.tokens.filter((token) => token.to > token.from);
        entries.push(entry);
    }
    groupTables(entries);
    return entries;
}

/** Headings of a document for the table of contents. */
export function outline(lines) {
    const entries = [];
    scanDocument(lines).forEach((scanned, index) => {
        if (scanned.kind !== "heading") return;
        const text = plainText(parseHeading(lines[index]).text);
        entries.push({ line: index, level: scanned.level, text, anchor: headingAnchor(text) });
    });
    return entries;
}
