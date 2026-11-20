// Turns the scanned page into CodeMirror decorations: markers are hidden or
// dimmed, bullets, checkboxes, pictures and tables are drawn. Markup that the
// cursor or selection touches stays raw so it can be edited.

import { Decoration, EditorView, StateField } from "../vendor/codemirror.js";
import { BoxWidget, BulletWidget, ImageWidget, TableWidget } from "./widgets.js";
import { scanDocument } from "./wiki.js";

const scan = (state) => scanDocument(state.doc.toString().split("\n"));

/** Decorations of a table block, or null while the selection touches it (then it stays raw source). */
function tableBlock(state, entry, from, touches) {
    const to = state.doc.line(entry.tableEnd + 1).to;
    if (touches(from, to)) return null;
    return Decoration.replace({ widget: new TableWidget(state.sliceDoc(from, to)), block: true }).range(from, to);
}

function addToken({ ranges, atomic }, token, entry, base, touches) {
    const from = base + token.from;
    const to = base + token.to;
    if (token.cls === "wk-syntax") {
        const hide = token.span && !touches(base + token.span[0], base + token.span[1]);
        ranges.push(hide ? Decoration.replace({}).range(from, to) : Decoration.mark({ class: "wk-syntax" }).range(from, to));
    } else if (entry.marker && token.from === entry.marker.from && entry.marker.type !== "number") {
        const widget = entry.marker.type === "check" ? new BoxWidget(entry.marker.state) : new BulletWidget();
        const range = Decoration.replace({ widget }).range(from, to);
        ranges.push(range);
        atomic.push(range);
    } else if (token.cls === "wk-image") {
        const image = entry.images.find((candidate) => candidate.from === token.from);
        if (image && !touches(from, to)) {
            ranges.push(Decoration.replace({ widget: new ImageWidget(image) }).range(from, to));
        } else {
            ranges.push(Decoration.mark({ class: "wk-syntax" }).range(from, to));
        }
    } else {
        ranges.push(Decoration.mark({ class: token.cls }).range(from, to));
    }
}

function lineClasses(entry, touched) {
    const classes = [];
    if (entry.kind === "rule") classes.push(touched ? "wk-rule-raw" : "wk-rule");
    else if (entry.lineClass) classes.push(entry.lineClass);
    if (entry.preEdge) classes.push(`wk-pre-${entry.preEdge}`);
    if (entry.marker) classes.push("wk-item");
    return classes;
}

function build(state, scanned) {
    const out = { ranges: [], atomic: [] };
    const selected = state.selection.ranges.map((range) => [range.from, range.to]);
    const touches = (from, to) => selected.some(([start, end]) => start <= to && end >= from);
    let skipUntil = -1;

    scanned.forEach((entry, index) => {
        if (index <= skipUntil || index >= state.doc.lines) return;
        const line = state.doc.line(index + 1);
        const base = line.from;

        if (entry.table !== undefined) {
            const block = entry.table === index ? tableBlock(state, entry, base, touches) : null;
            if (block) {
                out.ranges.push(block);
                skipUntil = entry.tableEnd;
            } else {
                out.ranges.push(Decoration.line({ class: "wk-table-source" }).range(base));
            }
            return;
        }

        const classes = lineClasses(entry, touches(base, line.to));
        if (classes.length) out.ranges.push(Decoration.line({ class: classes.join(" ") }).range(base));
        for (const token of entry.tokens) addToken(out, token, entry, base, touches);
    });
    return { scanned, decorations: Decoration.set(out.ranges, true), atomic: Decoration.set(out.atomic, true) };
}

/**
 * The editor state field that scans the page and decorates it. The text is
 * scanned again only when it changes; moving the cursor just redraws.
 */
export function createWikiField() {
    return StateField.define({
        create: (state) => build(state, scan(state)),
        update(value, transaction) {
            if (transaction.docChanged) return build(transaction.state, scan(transaction.state));
            if (transaction.selection) return build(transaction.state, value.scanned);
            return value;
        },
        provide: (field) => [
            EditorView.decorations.from(field, (value) => value.decorations),
            EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
        ],
    });
}
