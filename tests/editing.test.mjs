import assert from "node:assert/strict";
import { test } from "node:test";

import {
    continueList,
    indentLine,
    linkMarkup,
    nextMarker,
    setHeading,
    setListMarker,
    tableMarkup,
    toggleCheckbox,
    toggleWrap,
    typedHeading,
    wordAt,
} from "../renderer/js/editing.js";
import { parseTable, tableCells } from "../renderer/js/table.js";
import { headingAnchor, outline, parseImage, plainText, scanDocument, stripFormatting } from "../renderer/js/wiki.js";

test("numbered markers count on, letters wrap from Z to a", () => {
    assert.equal(nextMarker("1."), "2.");
    assert.equal(nextMarker("9."), "10.");
    assert.equal(nextMarker("a."), "b.");
    assert.equal(nextMarker("Z."), "a.");
    assert.equal(nextMarker("z."), "A.");
});

test("Enter continues a list with the same kind of marker", () => {
    assert.deepEqual(continueList("* Punkt"), { insert: "* " });
    assert.deepEqual(continueList("\t\t* tief"), { insert: "\t\t* " });
    assert.deepEqual(continueList("[*] erledigt"), { insert: "[ ] " });
    assert.deepEqual(continueList("\t3. drei"), { insert: "\t4. " });
    assert.deepEqual(continueList("b. zwei"), { insert: "c. " });
    assert.equal(continueList("normaler Text"), null);
});

test("Enter on an empty item ends the list", () => {
    assert.deepEqual(continueList("* "), { clear: true });
    assert.deepEqual(continueList("\t[ ] "), { clear: true });
});

test("headings are written with matching markers on both sides", () => {
    assert.equal(setHeading("Titel", 1), "====== Titel ======");
    assert.equal(setHeading("Titel", 5), "== Titel ==");
    assert.equal(setHeading("=== Alt ===", 2), "===== Alt =====");
    assert.equal(setHeading("====== Titel ======", 0), "Titel");
    assert.equal(setHeading("   ", 1), "");
});

test("typed shorthand counts the other way round than the file format", () => {
    assert.equal(typedHeading("== Titel"), "====== Titel ======");
    assert.equal(typedHeading("=== Titel"), "===== Titel =====");
    assert.equal(typedHeading("====== Titel"), "== Titel ==");
    assert.equal(typedHeading("====== Titel ======"), null, "a finished heading is left alone");
    assert.equal(typedHeading("= Titel"), null);
    assert.equal(typedHeading("==Titel"), null);
});

test("list markers are set, switched and removed", () => {
    assert.equal(setListMarker("Text", "bullet"), "* Text");
    assert.equal(setListMarker("* Text", "bullet"), "Text");
    assert.equal(setListMarker("* Text", "check"), "[ ] Text");
    assert.equal(setListMarker("\t[x] Text", "bullet"), "\t* Text");
    assert.equal(setListMarker("\tText", "number", "3."), "\t3. Text");
    assert.equal(setListMarker("[*] Text", "none"), "Text");
});

test("checkbox keys set a state and open it again", () => {
    assert.equal(toggleCheckbox("[ ] a", "*"), "[*] a");
    assert.equal(toggleCheckbox("[*] a", "*"), "[ ] a");
    assert.equal(toggleCheckbox("\t[*] a", "x"), "\t[x] a");
    assert.equal(toggleCheckbox("* a", "*"), null);
});

test("indentation moves by one tab and never below zero", () => {
    assert.equal(indentLine("* a", 1), "\t* a");
    assert.equal(indentLine("\t* a", -1), "* a");
    assert.equal(indentLine("* a", -1), "* a");
});

test("inline markers wrap, and a second time unwrap", () => {
    assert.deepEqual(toggleWrap("ein Wort hier", 4, 8, "**"), { text: "ein **Wort** hier", from: 6, to: 10 });
    assert.deepEqual(toggleWrap("ein **Wort** hier", 6, 10, "**"), { text: "ein Wort hier", from: 4, to: 8 });
    assert.deepEqual(toggleWrap("ein **Wort** hier", 4, 12, "**"), { text: "ein Wort hier", from: 4, to: 8 });
    assert.deepEqual(toggleWrap("H2O", 1, 2, "_{", "}"), { text: "H_{2}O", from: 3, to: 4 });
});

test("word under the cursor", () => {
    assert.deepEqual(wordAt("ein Wörtchen hier", 6), { from: 4, to: 12 });
    assert.deepEqual(wordAt("a  b", 2), { from: 2, to: 2 });
});

test("clearing formatting keeps the words and URLs", () => {
    assert.equal(stripFormatting("**a** //b// __c__ ~~d~~ ''e'' x^{2} y_{1}"), "a b c d e x2 y1");
    assert.equal(stripFormatting("http://example.org/a //b//"), "http://example.org/a b");
});

test("links are written short when text and target agree", () => {
    assert.equal(linkMarkup("Seite"), "[[Seite]]");
    assert.equal(linkMarkup("Seite", "Seite"), "[[Seite]]");
    assert.equal(linkMarkup("Projekt:Plan", "der Plan"), "[[Projekt:Plan|der Plan]]");
});

test("a new table has a header, an alignment row and empty rows", () => {
    const lines = tableMarkup(2, 1, "Spalte").split("\n");
    assert.equal(lines.length, 3);
    assert.equal(lines[0], "| Spalte 1 | Spalte 2 |");
    assert.match(lines[1], /^\|-+\|-+\|$/);
    assert.equal(scanDocument(lines)[0].kind, "table");
});

test("tables are parsed with alignment, wrapping and escapes", () => {
    const table = parseTable(["| A | B < | C |", "|:--|--:|:-:|", "| 1 | x \\| y | z\\nz |", "| 2 |"]);
    assert.deepEqual(table.headers, ["A", "B", "C"]);
    assert.deepEqual(table.aligns, ["left", "right", "center"]);
    assert.deepEqual(table.wraps, [false, true, false]);
    assert.deepEqual(table.rows, [["1", "x | y", "z\nz"], ["2", "", ""]]);
    assert.deepEqual(tableCells("| a | b |"), ["a", "b"]);
});

test("a single line with pipes is not a table", () => {
    const scanned = scanDocument(["| nur eine Zeile |", "Text"]);
    assert.equal(scanned[0].kind, "text");
    assert.equal(scanned[0].table, undefined);
    const two = scanDocument(["| a |", "| b |", ""]);
    assert.deepEqual([two[0].table, two[1].table, two[0].tableEnd], [0, 0, 1]);
});

test("images carry source, size and alternative text; anchors are not images", () => {
    assert.deepEqual(parseImage("./bild.png?width=120&height=80|Ein Bild"), { src: "./bild.png", width: 120, height: 80, href: "", alt: "Ein Bild" });
    assert.equal(parseImage("./a.png").width, null);
    assert.equal(parseImage("id: anker"), null);
    const scanned = scanDocument(["vor {{./a.png}} und {{id: ziel}} nach"])[0];
    assert.equal(scanned.images.length, 1);
    assert.equal(scanned.tokens.some((token) => token.cls === "wk-anchor"), true);
});

test("object blocks are verbatim like fenced blocks", () => {
    const scanned = scanDocument(['{{{code: lang="python"', "**kein fett**", "}}}", "**fett**"]);
    assert.deepEqual(scanned.map((line) => line.kind), ["pre", "pre", "pre", "text"]);
    assert.equal(scanned[1].tokens.length, 0);
});

test("outline lists headings with level and anchor", () => {
    const entries = outline(["====== Erste **Seite** ======", "Text", "===== Was ist ein \"Projekt\" ? ====="]);
    assert.deepEqual(entries.map((entry) => [entry.line, entry.level, entry.text]), [[0, 1, "Erste Seite"], [2, 2, 'Was ist ein "Projekt" ?']]);
    assert.equal(headingAnchor('What is a "Project" ?'), "what-is-a-project-");
    assert.equal(headingAnchor("Link to a heading or object"), "link-to-a-heading-or-object");
});

test("plain text drops markup but keeps link text", () => {
    assert.equal(plainText("**a** [[Ziel|Text]] [[Seite]] ''c''"), "a Text Seite c");
});
