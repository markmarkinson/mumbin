import assert from "node:assert/strict";
import { test } from "node:test";

import { formatSize, insertTextFor, insertionText, intersect, paddedInsertion, pictureType, toggleTag } from "../renderer/js/attachments.js";

test("sizes are rounded to a readable unit", () => {
    assert.equal(formatSize(0, "en"), "0 B");
    assert.equal(formatSize(512, "en"), "512 B");
    assert.equal(formatSize(1536, "en"), "1.5 KB");
    assert.equal(formatSize(1536, "de"), "1,5 KB");
    assert.equal(formatSize(5 * 1024 * 1024, "en"), "5.0 MB");
    assert.equal(formatSize(undefined, "en"), "0 B");
    assert.equal(formatSize(3 * 1024 ** 4, "en"), "3,072.0 GB");
});

test("pictures are inserted as pictures, other files as links", () => {
    assert.equal(insertTextFor({ name: "bild.png", isImage: true }), "{{./bild.png}}");
    assert.equal(insertTextFor({ name: "Plan 2026.pdf", isImage: false }), "[[./Plan 2026.pdf]]");
});

test("names the link syntax cannot carry are refused", () => {
    for (const name of ["a|b.pdf", "a]b.pdf", "a}b.png", "a\nb.pdf"]) {
        assert.equal(insertTextFor({ name, isImage: name.endsWith("png") }), null, name);
    }
});

test("only pages with every selected tag remain", () => {
    assert.deepEqual(intersect([["A", "B", "C"], ["C", "B"], ["B", "C", "D"]]), ["B", "C"]);
    assert.deepEqual(intersect([["A", "A", "B"]]), ["A", "B"]);
    assert.deepEqual(intersect([["A"], ["B"]]), []);
    assert.deepEqual(intersect([]), []);
});

test("selecting a tag twice clears it", () => {
    assert.deepEqual(toggleTag([], "@Garten"), ["garten"]);
    assert.deepEqual(toggleTag(["garten"], "wichtig"), ["garten", "wichtig"]);
    assert.deepEqual(toggleTag(["garten", "wichtig"], "GARTEN"), ["wichtig"]);
});

test("an insertion never glues itself to the text next to it", () => {
    assert.equal(paddedInsertion("abc def", 3, "[[x]]"), " [[x]]");
    assert.equal(paddedInsertion("abcdef", 3, "[[x]]"), " [[x]] ");
    assert.equal(paddedInsertion("abc def", 4, "[[x]]"), "[[x]] ");
    assert.equal(paddedInsertion("abc\ndef", 4, "[[x]]"), "[[x]] "); // start of a line, text follows
    assert.equal(paddedInsertion("", 0, "[[x]]"), "[[x]]");
    assert.equal(paddedInsertion("abc\n", 4, "[[x]]"), "[[x]]");
    assert.equal(paddedInsertion("[[a]]", 5, "[[b]]"), " [[b]]");
});

test("several links stay on one line unless the line is empty", () => {
    const links = ["[[a]]", "{{b.png}}"];
    assert.equal(insertionText("Text hier", 5, links), "[[a]] {{b.png}} ");
    assert.equal(insertionText("==== Titel ====", 5, links), "[[a]] {{b.png}} ");
    assert.equal(insertionText("eins\n\nzwei", 5, links), "[[a]]\n{{b.png}}");
    assert.equal(insertionText("", 0, links), "[[a]]\n{{b.png}}");
    assert.equal(insertionText("   \nx", 1, links), "[[a]]\n{{b.png}}");
    assert.equal(insertionText("Text\nnext", 0, ["[[a]]"]), "[[a]] ");
    assert.equal(insertionText("\nText", 0, links), "[[a]]\n{{b.png}}");
});

test("pictures are told apart by their file extension", () => {
    assert.equal(pictureType("a.PNG"), "image/png");
    assert.equal(pictureType("Urlaub 1.jpeg"), "image/jpeg");
    assert.equal(pictureType("a.txt"), null);
    assert.equal(pictureType("png"), null);
    assert.equal(pictureType("a.constructor"), null);
});
