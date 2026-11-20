// The page editor: CodeMirror working directly on the wiki text.
//
// The file content is the document, unchanged. Markup is rendered in place:
// markers are hidden, bullets and checkboxes become symbols, images and
// tables are drawn. Markers reappear as soon as the cursor touches them, so
// what is edited is always exactly what is saved.

import {
    Compartment,
    EditorState,
    EditorView,
    defaultKeymap,
    drawSelection,
    history,
    historyKeymap,
    indentUnit,
    keymap,
    openSearchPanel,
    placeholder,
    search,
    searchKeymap,
    undo,
} from "../vendor/codemirror.js";
import { createWikiField } from "./decorations.js";
import * as dock from "./dock.js";
import { changeLines, wikiKeys, wrapSelection } from "./editCommands.js";
import * as editing from "./editing.js";
import { currentLanguage, t } from "./i18n.js";
import * as pages from "./pages.js";
import { pointerHandlers } from "./pointer.js";
import { state } from "./state.js";
import { $ } from "./ui.js";
import { linkAt, stripFormatting } from "./wiki.js";

const GERMAN_PHRASES = {
    Find: "Suchen",
    Replace: "Ersetzen",
    next: "weiter",
    previous: "zurück",
    all: "alle",
    "match case": "Groß-/Kleinschreibung",
    regexp: "regulärer Ausdruck",
    "by word": "ganzes Wort",
    replace: "ersetzen",
    "replace all": "alle ersetzen",
    close: "schließen",
    "current match": "aktueller Treffer",
    "replaced $ matches": "$ Treffer ersetzt",
    "replaced match on line $": "Treffer in Zeile $ ersetzt",
    "on line": "in Zeile",
};

const readOnlyExtensions = (readOnly) => [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];

const placeholderSlot = new Compartment();
const readOnlySlot = new Compartment();
const phraseSlot = new Compartment();
// `generation` changes with every loaded page; see pointer.js.
const session = { readOnly: false, generation: 0 };

const wikiField = createWikiField();
const lineKind = (view, number) => view.state.field(wikiField).scanned[number - 1]?.kind;
const phrases = () => EditorState.phrases.of(currentLanguage() === "de" ? GERMAN_PHRASES : {});
const placeholderText = () => t(state.stamp === null && state.page ? "editor.newPage" : "editor.placeholder");

const extensions = () => [
    EditorView.cspNonce.of(document.getElementById("style-nonce")?.nonce || ""),
    history(),
    readOnlySlot.of(readOnlyExtensions(session.readOnly)),
    phraseSlot.of(phrases()),
    drawSelection(),
    search({ top: true }),
    EditorView.lineWrapping,
    EditorState.tabSize.of(4),
    indentUnit.of("\t"),
    wikiKeys(session, lineKind),
    keymap.of([...historyKeymap, ...searchKeymap, ...defaultKeymap]),
    wikiField,
    pointerHandlers(session),
    placeholderSlot.of(placeholder(placeholderText())),
    EditorView.updateListener.of((update) => {
        if (update.docChanged) pages.edited();
        if (update.docChanged || update.selectionSet) dock.cursorMoved();
    }),
];

const view = new EditorView({ parent: $("editor"), state: EditorState.create({ doc: "", extensions: extensions() }) });

// Commands that change the text do nothing while the page is read-only.
const onLines = (change) => {
    if (!session.readOnly) changeLines(view, change);
};
const skipBlank = (change) => (text, index) => (text.trim() ? change(text, index) : null);
const wrap = (open, close) => () => {
    if (!session.readOnly) wrapSelection(view, open, close);
};

const commands = {
    bold: wrap("**"),
    italic: wrap("//"),
    mark: wrap("__"),
    strike: wrap("~~"),
    code: wrap("''"),
    sub: wrap("_{", "}"),
    sup: wrap("^{", "}"),
    heading: (level) => onLines(skipBlank((text) => editing.setHeading(text, level))),
    bullet: () => onLines(skipBlank((text) => editing.setListMarker(text, "bullet"))),
    check: () => onLines(skipBlank((text) => editing.setListMarker(text, "check"))),
    number: () => onLines(skipBlank((text, index) => editing.setListMarker(text, "number", `${index + 1}.`))),
    toggleCheck: (state) => onLines((text) => editing.toggleCheckbox(text, state)),
    clear() {
        const { main } = view.state.selection;
        if (main.empty || session.readOnly) return;
        view.dispatch(view.state.replaceSelection(stripFormatting(view.state.sliceDoc(main.from, main.to))));
    },
    insert(text) {
        if (session.readOnly) return;
        view.dispatch(view.state.replaceSelection(text), { userEvent: "input", scrollIntoView: true });
    },
    undo: () => undo(view),
    selectAll: () => view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } }),
    find: () => openSearchPanel(view),
};

export const editor = {
    /** Replaces the whole text and forgets the undo history of the previous page. */
    setText(text) {
        session.generation += 1;
        view.setState(EditorState.create({ doc: text, extensions: extensions() }));
    },
    /** Runs an editing command by name. */
    command(name, argument) {
        commands[name](argument);
        view.focus();
    },
    getCursor: () => ({ anchor: view.state.selection.main.anchor, head: view.state.selection.main.head }),
    setCursor(cursor) {
        if (!cursor) return;
        const clamp = (value) => Math.max(0, Math.min(view.state.doc.length, Number.isFinite(value) ? value : 0));
        view.dispatch({ selection: { anchor: clamp(cursor.anchor), head: clamp(cursor.head) }, scrollIntoView: true });
    },
    /** Moves the cursor to the end of a line (0-based) and shows the line near the top. */
    goToLine(index) {
        const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, index + 1)));
        view.dispatch({
            selection: { anchor: line.to },
            effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 24 }),
        });
        view.focus();
    },
    /** Selected text, the link under the cursor and the cursor's line. */
    context() {
        const { main } = view.state.selection;
        const line = view.state.doc.lineAt(main.head);
        const link = linkAt(line.text, Math.max(0, main.head - line.from - (main.head === line.to ? 1 : 0)));
        return {
            text: view.state.sliceDoc(main.from, main.to),
            from: main.from,
            to: main.to,
            line: line.number - 1,
            lineFrom: line.from,
            lineTo: line.to,
            lineText: line.text,
            link: link ? { ...link, from: line.from + link.from, to: line.from + link.to, text: line.text.slice(link.textFrom, link.textTo) } : null,
        };
    },
    /** Replaces a range of the document and puts the cursor behind it. */
    replaceRange(from, to, text) {
        if (session.readOnly) return;
        view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: "input" });
        view.focus();
    },
    getText: () => view.state.doc.toString(),
    setReadOnly(value) {
        session.readOnly = value;
        view.dispatch({ effects: readOnlySlot.reconfigure(readOnlyExtensions(value)) });
    },
    focus: () => view.focus(),
    /** Document position under a point of the window, or null when the point is outside the editor. */
    posAtPoint(x, y) {
        const box = view.scrollDOM.getBoundingClientRect();
        if (x < box.left || x > box.right || y < box.top || y > box.bottom) return null;
        return view.posAtCoords({ x, y }, false);
    },
    refreshPlaceholder() {
        view.dispatch({
            effects: [placeholderSlot.reconfigure(placeholder(placeholderText())), phraseSlot.reconfigure(phrases())],
        });
    },
};
