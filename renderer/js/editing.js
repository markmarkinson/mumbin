// Text transformations behind the editor's keys and toolbar. Pure functions
// on single lines, so they can be tested without a browser.

import { listMarker, parseHeading } from "./wiki.js";

const TYPED_HEADING = /^(={2,7})[ \t]+(\S.*?)[ \t]*$/;

/** Marker that follows `marker` in a numbered list (1. → 2., a. → b., Z. → a.). */
export function nextMarker(marker) {
    const body = marker.slice(0, -1);
    if (/^\d+$/.test(body)) return `${Number(body) + 1}.`;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const index = letters.indexOf(body);
    return index < 0 ? marker : `${letters[(index + 1) % letters.length]}.`;
}

/**
 * What Enter does at the end of a list item.
 * @returns {{insert: string}|{clear: true}|null} text to insert after the
 *   line break, `clear` when an empty item ends the list, or null for a
 *   normal line break.
 */
export function continueList(line) {
    const item = listMarker(line);
    if (!item) return null;
    if (line.slice(item.textFrom).trim() === "") return { clear: true };
    const indent = "\t".repeat(item.indent);
    if (item.type === "check") return { insert: `${indent}[ ] ` };
    if (item.type === "number") return { insert: `${indent}${nextMarker(item.marker)} ` };
    return { insert: `${indent}* ` };
}

/** Turns a line into a heading of `level` (1 largest to 5); 0 removes the heading. */
export function setHeading(line, level) {
    const text = (parseHeading(line)?.text ?? line).replace(/^\t+/, "");
    if (!text.trim()) return "";
    if (!level) return text;
    const marks = "=".repeat(7 - Math.min(5, Math.max(1, level)));
    return `${marks} ${text.trim()} ${marks}`;
}

/**
 * Typed shorthand: `== Title` followed by Enter becomes a level 1 heading,
 * `=== Title` level 2 and so on. Lines that already carry closing markers
 * are real headings and stay as they are.
 */
export function typedHeading(line) {
    const match = TYPED_HEADING.exec(line);
    if (!match || /=\s*$/.test(line)) return null;
    return setHeading(match[2], Math.min(5, match[1].length - 1));
}

/**
 * Sets or removes the list marker of a line.
 * @param {"bullet"|"check"|"number"|"none"} kind
 */
export function setListMarker(line, kind, number = "1.") {
    const item = listMarker(line);
    const indent = /^\t*/.exec(line)[0];
    const text = item ? line.slice(item.textFrom) : line.slice(indent.length);
    const marker = { bullet: "* ", check: "[ ] ", number: `${number} `, none: "" }[kind];
    // The same kind again takes the marker off.
    return item?.type === kind ? indent + text : indent + marker + text;
}

/**
 * Sets the checkbox of a line to `state` ("*" done, "x" failed, ">" moved);
 * a box already in that state is opened again. Null when the line has no box.
 */
export function toggleCheckbox(line, state) {
    const item = listMarker(line);
    if (!item || item.type !== "check") return null;
    const next = item.marker[1] === state ? " " : state;
    return `${line.slice(0, item.indent)}[${next}]${line.slice(item.indent + 3)}`;
}

/** Adds or removes one level of indentation. */
export function indentLine(line, delta) {
    if (delta > 0) return `\t${line}`;
    return line.startsWith("\t") ? line.slice(1) : line;
}

/**
 * Wraps `text[from..to]` in markers, or removes them when the range already
 * carries them (inside or directly outside the selection).
 * @returns {{text: string, from: number, to: number}} new text and selection
 */
export function toggleWrap(text, from, to, open, close = open) {
    const selected = text.slice(from, to);
    if (selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length) {
        const inner = selected.slice(open.length, selected.length - close.length);
        return { text: text.slice(0, from) + inner + text.slice(to), from, to: from + inner.length };
    }
    if (text.slice(from - open.length, from) === open && text.slice(to, to + close.length) === close) {
        return {
            text: text.slice(0, from - open.length) + selected + text.slice(to + close.length),
            from: from - open.length,
            to: to - open.length,
        };
    }
    return {
        text: text.slice(0, from) + open + selected + close + text.slice(to),
        from: from + open.length,
        to: to + open.length,
    };
}

/** Range of the word around `position`, or an empty range when there is none. */
export function wordAt(text, position) {
    const isWord = (char) => char !== undefined && /[\p{L}\p{N}_]/u.test(char);
    let from = position;
    let to = position;
    while (from > 0 && isWord(text[from - 1])) from -= 1;
    while (to < text.length && isWord(text[to])) to += 1;
    return { from, to };
}

/** Builds the wiki text of a link. */
export function linkMarkup(target, text = "") {
    const cleanTarget = target.trim();
    const cleanText = text.trim();
    return cleanText && cleanText !== cleanTarget ? `[[${cleanTarget}|${cleanText}]]` : `[[${cleanTarget}]]`;
}

/** Builds an empty table with the given number of columns and rows. */
export function tableMarkup(columns, rows, headerLabel = "Spalte") {
    const head = Array.from({ length: columns }, (_, index) => ` ${headerLabel} ${index + 1} `);
    const line = (cells) => `|${cells.join("|")}|`;
    const lines = [line(head), line(head.map((cell) => "-".repeat(cell.length)))];
    for (let row = 0; row < rows; row += 1) lines.push(line(head.map((cell) => " ".repeat(cell.length))));
    return lines.join("\n");
}
