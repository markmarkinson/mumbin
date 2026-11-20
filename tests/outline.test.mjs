import assert from "node:assert/strict";
import { test } from "node:test";

import { activeEntry, anchorLine, tocEntries } from "../renderer/js/outline.js";
import { outline } from "../renderer/js/wiki.js";

const entriesOf = (lines) => tocEntries(outline(lines));
const shape = (entries) => entries.map((entry) => `${"-".repeat(entry.depth)}${entry.text}`);

test("a single page title is not part of the table of contents", () => {
    const lines = ["====== Seite ======", "", "===== Eins =====", "x", "==== Eins a ====", "===== Zwei ====="];
    assert.deepEqual(shape(entriesOf(lines)), ["Eins", "-Eins a", "Zwei"]);
});

test("several top-level headings are all shown", () => {
    const lines = ["====== A ======", "===== a1 =====", "====== B ======", "===== b1 ====="];
    assert.deepEqual(shape(entriesOf(lines)), ["A", "-a1", "B", "-b1"]);
});

test("a title that is not the first heading stays", () => {
    const lines = ["===== Vorwort =====", "====== Titel ======", "===== Kapitel ====="];
    // Only a single title that opens the page is its name; here it comes after a section.
    assert.deepEqual(shape(entriesOf(lines)), ["Vorwort", "Titel", "-Kapitel"]);
});

test("skipped levels are one step of indentation, not two", () => {
    const lines = ["====== T ======", "===== A =====", "== tief ==", "===== B ====="];
    assert.deepEqual(shape(entriesOf(lines)), ["A", "-tief", "B"]);
});

test("no headings, no entries; headings in code blocks do not count", () => {
    assert.deepEqual(entriesOf(["nur Text", "mehr Text"]), []);
    assert.deepEqual(entriesOf([]), []);
    const lines = ["===== Echt =====", "'''", "===== Nur Beispiel =====", "'''", "===== Auch echt ====="];
    assert.deepEqual(shape(entriesOf(lines)), ["Echt", "Auch echt"]);
});

test("formatting in a heading is not shown in the table of contents", () => {
    assert.deepEqual(shape(entriesOf(["===== Ein **fetter** [[Link|Titel]] ====="])), ["Ein fetter Titel"]);
});

test("the active heading is the last one above the cursor", () => {
    const entries = entriesOf(["====== T ======", "x", "===== A =====", "x", "x", "===== B =====", "x"]);
    assert.equal(activeEntry(entries, 0), null, "before the first heading");
    assert.equal(activeEntry(entries, 2).text, "A");
    assert.equal(activeEntry(entries, 4).text, "A");
    assert.equal(activeEntry(entries, 5).text, "B");
    assert.equal(activeEntry(entries, 99).text, "B");
    assert.equal(activeEntry([], 3), null);
});

test("an anchor finds its heading however the link spells it", () => {
    const lines = ["====== Titel ======", "x", "===== Mein Abschnitt =====", "x", '===== Was ist ein "Projekt" ? =====', "x", "== Ende =="];
    assert.equal(anchorLine(lines, "Mein Abschnitt"), 2);
    assert.equal(anchorLine(lines, "mein-abschnitt"), 2);
    assert.equal(anchorLine(lines, "MEIN ABSCHNITT"), 2);
    assert.equal(anchorLine(lines, "Mein%20Abschnitt"), 2);
    assert.equal(anchorLine(lines, 'Was ist ein "Projekt" ?'), 4);
    assert.equal(anchorLine(lines, "Ende"), 6);
    assert.equal(anchorLine(lines, "gibt-es-nicht"), -1);
    assert.equal(anchorLine(lines, ""), -1);
    assert.equal(anchorLine(lines, "100%"), -1);
    // Not valid UTF-8 after decoding: must not throw.
    assert.equal(anchorLine(lines, "%E0"), -1);
});

test("explicit anchors count, headings come first, code blocks do not", () => {
    const lines = ["Text {{id: ziel-eins}} hier", "===== ziel-eins =====", "'''", "{{id: nur-beispiel}}", "'''", "{{id: Gross}}"];
    assert.equal(anchorLine(lines, "ziel-eins"), 1, "a heading with that name wins over an explicit anchor");
    assert.equal(anchorLine(lines, "Gross"), 5);
    assert.equal(anchorLine(lines, "gross"), 5);
    assert.equal(anchorLine(["{{id: abc}}"], "abc"), 0);
});
