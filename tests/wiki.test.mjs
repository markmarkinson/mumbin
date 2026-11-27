import assert from "node:assert/strict";
import { test } from "node:test";

import {
    checkboxAt,
    findLinks,
    linkAt,
    scanDocument,
} from "../renderer/js/wiki.js";

const classesOf = (line) => scanDocument([line])[0];
const headingLevel = (line) => {
    const [scanned] = scanDocument([line]);
    return scanned.kind === "heading" ? scanned.level : 0;
};
const tokenText = (line, cls) =>
    classesOf(line)
        .tokens.filter((token) => token.cls.split(" ").includes(cls))
        .map((token) => line.slice(token.from, token.to));

test("six equal signs are the largest heading, two the smallest", () => {
    assert.equal(headingLevel("====== Titel ======"), 1);
    assert.equal(headingLevel("===== Titel ====="), 2);
    assert.equal(headingLevel("== Titel =="), 5);
    assert.equal(headingLevel("======= Titel ======="), 1);
    assert.equal(headingLevel("== Titel"), 5);
    assert.equal(headingLevel("= Titel ="), 0);
    assert.equal(headingLevel("==Titel=="), 0);
    assert.equal(headingLevel(" == Titel =="), 0);
});

test("heading lines get a class and dimmed markers", () => {
    const line = "==== Abschnitt ====";
    assert.equal(classesOf(line).lineClass, "wk-heading wk-h3");
    // The blank next to each marker belongs to it, so hiding the markers
    // leaves the heading text flush with the margin.
    assert.deepEqual(tokenText(line, "wk-syntax"), ["==== ", " ===="]);
    assert.deepEqual(tokenText("== Kurz", "wk-syntax"), ["== "]);
});

test("inline formats are recognised with their markers", () => {
    assert.deepEqual(tokenText("a **fett** b", "wk-bold"), ["fett"]);
    assert.deepEqual(tokenText("a //kursiv// b", "wk-italic"), ["kursiv"]);
    assert.deepEqual(tokenText("a __markiert__ b", "wk-highlight"), ["markiert"]);
    assert.deepEqual(tokenText("a ~~weg~~ b", "wk-strike"), ["weg"]);
    assert.deepEqual(tokenText("H_{2}O und x^{2}", "wk-sub"), ["2"]);
    assert.deepEqual(tokenText("H_{2}O und x^{2}", "wk-sup"), ["2"]);
    assert.deepEqual(tokenText("a **b** c **d**", "wk-bold"), ["b", "d"]);
});

test("verbatim text is not parsed further", () => {
    const line = "siehe ''**kein fett** [[kein link]]'' hier";
    assert.deepEqual(tokenText(line, "wk-code"), ["**kein fett** [[kein link]]"]);
    assert.deepEqual(tokenText(line, "wk-bold"), []);
    assert.deepEqual(findLinks(line), []);
});

test("a URL does not start italics", () => {
    const line = "http://example.org/a und //kursiv//";
    assert.deepEqual(tokenText(line, "wk-italic"), ["kursiv"]);
    assert.deepEqual(tokenText(line, "wk-link-url"), ["http://example.org/a"]);
});

test("links expose target and visible text", () => {
    const line = "x [[Projekt:Plan|der Plan]] y [[Home]] z";
    const links = findLinks(line);
    assert.equal(links.length, 2);
    assert.equal(links[0].target, "Projekt:Plan");
    assert.equal(line.slice(links[0].textFrom, links[0].textTo), "der Plan");
    assert.equal(links[1].target, "Home");
    assert.equal(line.slice(links[1].textFrom, links[1].textTo), "Home");
    assert.equal(linkAt(line, 5).target, "Projekt:Plan");
    assert.equal(linkAt(line, 0), null);
});

test("bare URLs lose trailing punctuation and unbalanced brackets", () => {
    assert.equal(findLinks("siehe https://example.org/a.")[0].target, "https://example.org/a");
    assert.equal(findLinks("(siehe https://example.org/a)")[0].target, "https://example.org/a");
    assert.equal(findLinks("https://de.wikipedia.org/wiki/A_(B)")[0].target, "https://de.wikipedia.org/wiki/A_(B)");
    assert.equal(findLinks("www.example.org, ok")[0].target, "www.example.org");
    assert.equal(findLinks("[[https://example.org|Seite]]")[0].kind, "url");
    assert.equal(findLinks("[[https://example.org|Seite]]").length, 1);
});

test("tags need whitespace before the @", () => {
    assert.deepEqual(tokenText("@wichtig und mail@example.org @zwei", "wk-tag"), ["@wichtig", "@zwei"]);
});

test("list markers and checkboxes", () => {
    assert.deepEqual(tokenText("* Punkt", "wk-bullet"), ["*"]);
    assert.deepEqual(tokenText("\t1. Punkt", "wk-bullet"), ["1."]);
    assert.deepEqual(tokenText("a. Punkt", "wk-bullet"), ["a."]);
    assert.deepEqual(tokenText("aa. kein Punkt", "wk-bullet"), []);
    assert.deepEqual(tokenText("[ ] offen", "wk-check-open"), ["[ ]"]);
    assert.deepEqual(tokenText("\t[*] fertig", "wk-check-done"), ["[*]"]);
    assert.equal(classesOf("[x] abgebrochen").lineClass, "wk-item-closed");
    assert.deepEqual(tokenText("[] keine Checkbox", "wk-check"), []);
    assert.deepEqual(checkboxAt("\t[ ] offen"), { from: 1, to: 4, state: " ", next: "*" });
    assert.equal(checkboxAt("[*] x").next, "x");
    assert.equal(checkboxAt("[x] x").next, " ");
    assert.equal(checkboxAt("* x"), null);
});

test("verbatim blocks span lines and end at the matching fence", () => {
    const scanned = scanDocument(["vor", "'''", "**roh**", "== keine Überschrift ==", "'''", "**fett**"]);
    assert.deepEqual(
        scanned.map((line) => line.lineClass),
        ["", "wk-pre", "wk-pre", "wk-pre", "wk-pre", ""],
    );
    assert.equal(scanned[2].tokens.length, 0);
    assert.equal(scanned[5].tokens.some((token) => token.cls === "wk-bold"), true);
});

test("horizontal rule needs five dashes", () => {
    assert.equal(classesOf("-----").lineClass, "wk-rule");
    assert.equal(classesOf("----").lineClass, "");
});

test("the target of a link is never formatted, even with // in it", () => {
    // Real line from dropping files: file addresses carry //, which looked like italics.
    const line = "[[./a.pdf]][[file:///C:/Users/x/a.pdf]]{{./b.png}}[[file:///C:/Users/x/b.png]]";
    const [scanned] = scanDocument([line]);
    assert.deepEqual(scanned.tokens.filter((token) => token.cls.includes("wk-italic")), []);
    assert.equal(scanned.tokens.filter((token) => token.cls.includes("wk-link")).length, 3);
    // Text behind a | is still formatted, the target is not.
    const [text] = scanDocument(["[[file:///C:/x|ein //kursiver// Name]]"]);
    assert.deepEqual(text.tokens.filter((token) => token.cls === "wk-italic").map((token) => token.from), [21]);
    // Bare addresses keep their //.
    const [bare] = scanDocument(["https://example.org/a und //kursiv//"]);
    assert.equal(bare.tokens.filter((token) => token.cls === "wk-italic").length, 1);
});

test("a hostile line cannot freeze the scanner", () => {
    // Measured before the limit existed: 200 000 characters of "[[a ]" took 2.1 s per scan.
    const lines = ["[[a ]".repeat(40000), "{{a ".repeat(50000), "//a:".repeat(50000), "_{a ".repeat(50000), "http://a ".repeat(25000)];
    for (const line of lines) {
        const start = performance.now();
        scanDocument([line]);
        findLinks(line);
        const took = performance.now() - start;
        assert.ok(took < 300, `${line.slice(0, 8)}... took ${Math.round(took)} ms`);
    }
    // Ordinary long paragraphs keep their formatting.
    const paragraph = `${"Satz mit Text. ".repeat(400)}**fett** [[Seite]]`;
    const [scanned] = scanDocument([paragraph]);
    assert.ok(scanned.tokens.some((token) => token.cls === "wk-bold"));
    assert.equal(findLinks(paragraph).length, 1);
});
