// Editing commands applied to the CodeMirror view: the keys of the wiki editor
// (Enter, Tab, Backspace, `[] `) and the line and selection helpers behind the
// toolbar. The text transformations themselves live in editing.js.

import { EditorView, Prec, keymap } from "../vendor/codemirror.js";
import * as editing from "./editing.js";
import { listMarker } from "./wiki.js";

const lineInfo = (view) => {
    const { main } = view.state.selection;
    return { main, line: view.state.doc.lineAt(main.head) };
};

/** Applies `change(text, index)` to every line the selection touches; null or the same text leaves a line alone. */
export function changeLines(view, change) {
    const { main } = view.state.selection;
    const first = view.state.doc.lineAt(main.from).number;
    const last = view.state.doc.lineAt(main.to).number;
    const changes = [];
    for (let number = first; number <= last; number += 1) {
        const line = view.state.doc.line(number);
        // A selection that ends at the start of a line does not include it.
        if (number > first && number === last && main.to === line.from) continue;
        const next = change(line.text, number - first);
        if (next !== null && next !== line.text) changes.push({ from: line.from, to: line.to, insert: next });
    }
    if (changes.length) view.dispatch({ changes, userEvent: "input" });
}

/** Wraps the selection (or the word at the cursor) in inline markers, or takes them off again. */
export function wrapSelection(view, open, close = open) {
    const { main } = view.state.selection;
    if (main.empty) {
        const line = view.state.doc.lineAt(main.head);
        const word = editing.wordAt(line.text, main.head - line.from);
        if (word.from === word.to) {
            view.dispatch({
                changes: { from: main.head, insert: open + close },
                selection: { anchor: main.head + open.length },
                userEvent: "input",
            });
            return;
        }
        const result = editing.toggleWrap(line.text, word.from, word.to, open, close);
        // The cursor stays where it was in the word. Selecting the word
        // instead would let the next key press replace it.
        const offset = main.head - line.from - word.from;
        view.dispatch({
            changes: { from: line.from, to: line.to, insert: result.text },
            selection: { anchor: line.from + result.from + offset },
            userEvent: "input",
        });
        return;
    }
    const changes = [];
    let anchor = main.from;
    let head = main.to;
    let shift = 0;
    const first = view.state.doc.lineAt(main.from).number;
    const last = view.state.doc.lineAt(main.to).number;
    for (let number = first; number <= last; number += 1) {
        const line = view.state.doc.line(number);
        const from = Math.max(main.from, line.from) - line.from;
        const to = Math.min(main.to, line.to) - line.from;
        if (line.text.slice(from, to).trim() === "") continue;
        const result = editing.toggleWrap(line.text, from, to, open, close);
        changes.push({ from: line.from, to: line.to, insert: result.text });
        if (number === first) anchor = line.from + result.from + shift;
        shift += result.text.length - line.text.length;
        if (number === last) head = line.from + result.to + shift - (result.text.length - line.text.length);
    }
    if (changes.length) view.dispatch({ changes, selection: { anchor, head }, userEvent: "input" });
}

/**
 * Enter: `== Title` becomes a heading, a list item continues the list, an
 * empty item ends it. `lineKind(view, number)` is the scanned kind of a line;
 * inside verbatim blocks and tables Enter stays a plain line break.
 */
function onEnter(view, session, lineKind) {
    const { main, line } = lineInfo(view);
    if (!main.empty || session.readOnly) return false;
    const kind = lineKind(view, line.number);
    if (!kind || kind === "pre" || kind === "table") return false;

    if (main.head === line.to) {
        const heading = editing.typedHeading(line.text);
        if (heading) {
            view.dispatch({
                changes: { from: line.from, to: line.to, insert: `${heading}\n` },
                selection: { anchor: line.from + heading.length + 1 },
                userEvent: "input",
                scrollIntoView: true,
            });
            return true;
        }
    }
    const item = listMarker(line.text);
    if (!item || main.head < line.from + item.textFrom) return false;
    const next = editing.continueList(line.text);
    if (next.clear) {
        view.dispatch({
            changes: { from: line.from, to: line.to, insert: "" },
            selection: { anchor: line.from },
            userEvent: "delete",
        });
        return true;
    }
    const insert = `\n${next.insert}`;
    view.dispatch({
        changes: { from: main.head, insert },
        selection: { anchor: main.head + insert.length },
        userEvent: "input",
        scrollIntoView: true,
    });
    return true;
}

/** Tab indents list items and selected lines; elsewhere it types a tab character. */
function onTab(view, session, delta) {
    if (session.readOnly) return false;
    const { main, line } = lineInfo(view);
    const multi = view.state.doc.lineAt(main.from).number !== view.state.doc.lineAt(main.to).number;
    const inIndent = main.empty && /^\t*$/.test(line.text.slice(0, main.head - line.from));
    if (multi || listMarker(line.text) || delta < 0 || (inIndent && line.text.trim() !== "")) {
        changeLines(view, (text) => (text.trim() === "" && multi ? null : editing.indentLine(text, delta)));
        return true;
    }
    view.dispatch(view.state.replaceSelection("\t"), { userEvent: "input", scrollIntoView: true });
    return true;
}

/** Backspace right behind a list marker lifts the item one level or removes the marker. */
function onBackspace(view, session) {
    const { main, line } = lineInfo(view);
    if (!main.empty || session.readOnly) return false;
    const item = listMarker(line.text);
    if (!item || main.head !== line.from + item.textFrom) return false;
    const next = item.indent > 0 ? editing.indentLine(line.text, -1) : editing.setListMarker(line.text, "none");
    const removed = line.text.length - next.length;
    view.dispatch({
        changes: { from: line.from, to: line.to, insert: next },
        selection: { anchor: main.head - removed },
        userEvent: "delete",
    });
    return true;
}

/** `[] ` or `() ` typed at the start of a line becomes an open checkbox. */
const checkboxShorthand = (session) =>
    EditorView.inputHandler.of((view, from, to, text) => {
        if (text !== " " || from !== to || session.readOnly) return false;
        const line = view.state.doc.lineAt(from);
        const before = line.text.slice(0, from - line.from);
        const match = /^(\t*)(\[\]|\(\))$/.exec(before);
        if (!match) return false;
        const insert = `${match[1]}[ ] `;
        view.dispatch({
            changes: { from: line.from, to: from, insert },
            selection: { anchor: line.from + insert.length },
            userEvent: "input.type",
        });
        return true;
    });

/**
 * Keys and typing shortcuts of the wiki editor.
 * @param {{readOnly: boolean}} session
 * @param {(view: EditorView, lineNumber: number) => string|undefined} lineKind
 */
export function wikiKeys(session, lineKind) {
    return [
        Prec.high(
            keymap.of([
                { key: "Enter", run: (view) => onEnter(view, session, lineKind) },
                { key: "Tab", run: (view) => onTab(view, session, 1) },
                { key: "Shift-Tab", run: (view) => onTab(view, session, -1) },
                { key: "Backspace", run: (view) => onBackspace(view, session) },
            ]),
        ),
        checkboxShorthand(session),
    ];
}
