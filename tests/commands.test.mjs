import assert from "node:assert/strict";
import { test } from "node:test";

import {
    clampFontSize,
    dateTexts,
    matchesShortcut,
    neighbourPage,
    parseShortcut,
    rankEntries,
    shortcutLabel,
} from "../renderer/js/commands.js";
import { parentName } from "../renderer/js/pagenames.js";

const key = (key, code, modifiers = {}) => ({ key, code, ctrlKey: false, shiftKey: false, altKey: false, ...modifiers });

test("shortcuts are parsed into modifiers and a key", () => {
    assert.deepEqual(parseShortcut("Ctrl+Shift+P"), { ctrl: true, shift: true, alt: false, key: "p" });
    assert.deepEqual(parseShortcut("Alt+Left"), { ctrl: false, shift: false, alt: true, key: "arrowleft" });
    assert.deepEqual(parseShortcut("F2"), { ctrl: false, shift: false, alt: false, key: "f2" });
    assert.deepEqual(parseShortcut("Ctrl+Comma"), { ctrl: true, shift: false, alt: false, key: "," });
});

test("a shortcut matches only with exactly its modifiers", () => {
    assert.equal(matchesShortcut(key("b", "KeyB", { ctrlKey: true }), "Ctrl+B"), true);
    assert.equal(matchesShortcut(key("B", "KeyB", { ctrlKey: true, shiftKey: true }), "Ctrl+B"), false);
    assert.equal(matchesShortcut(key("B", "KeyB", { ctrlKey: true, shiftKey: true }), "Ctrl+Shift+B"), true);
    assert.equal(matchesShortcut(key("b", "KeyB"), "Ctrl+B"), false);
    assert.equal(matchesShortcut(key("b", "KeyB", { ctrlKey: true, altKey: true }), "Ctrl+B"), false);
    assert.equal(matchesShortcut(key("F12", "F12", { shiftKey: true }), "Shift+F12"), true);
    assert.equal(matchesShortcut(key("F12", "F12"), "Shift+F12"), false);
    assert.equal(matchesShortcut(key("ArrowLeft", "ArrowLeft", { altKey: true }), "Alt+Left"), true);
    assert.equal(matchesShortcut(key("PageDown", "PageDown", { altKey: true }), "Alt+PgDn"), true);
});

test("letters and digits follow the physical key, whatever the layout prints", () => {
    // Alt+D prints "ð" on some layouts; Ctrl+1 prints "!" with Shift.
    assert.equal(matchesShortcut(key("ð", "KeyD", { altKey: true }), "Alt+D"), true);
    assert.equal(matchesShortcut(key("1", "Digit1", { ctrlKey: true }), "Ctrl+1"), true);
    assert.equal(matchesShortcut(key("1", "Numpad1", { ctrlKey: true }), "Ctrl+1"), true);
    assert.equal(matchesShortcut(key("2", "Digit2", { ctrlKey: true }), "Ctrl+1"), false);
});

test("plus and minus work on the main block and the number pad", () => {
    assert.equal(matchesShortcut(key("+", "BracketRight", { ctrlKey: true }), "Ctrl+Plus"), true);
    assert.equal(matchesShortcut(key("=", "Equal", { ctrlKey: true }), "Ctrl+Plus"), true);
    assert.equal(matchesShortcut(key("+", "Equal", { ctrlKey: true, shiftKey: true }), "Ctrl+Plus"), true);
    assert.equal(matchesShortcut(key("+", "NumpadAdd", { ctrlKey: true }), "Ctrl+Plus"), true);
    assert.equal(matchesShortcut(key("-", "Slash", { ctrlKey: true }), "Ctrl+Minus"), true);
    assert.equal(matchesShortcut(key("-", "NumpadSubtract", { ctrlKey: true }), "Ctrl+Minus"), true);
    assert.equal(matchesShortcut(key("0", "Digit0", { ctrlKey: true }), "Ctrl+0"), true);
});

test("shortcut labels use the key names of the language", () => {
    assert.equal(shortcutLabel("Ctrl+Shift+P", "de"), "Strg+Umschalt+P");
    assert.equal(shortcutLabel("Alt+Home", "de"), "Alt+Pos1");
    assert.equal(shortcutLabel("Alt+PgUp", "de"), "Alt+Bild↑");
    assert.equal(shortcutLabel("Ctrl+Shift+P", "en"), "Ctrl+Shift+P");
    assert.equal(shortcutLabel("Ctrl+Plus", "en"), "Ctrl++");
    assert.equal(shortcutLabel(undefined, "de"), "");
});

test("the palette needs every typed word and prefers the start of a name", () => {
    const entries = ["Projekte", "Projekte:Garten", "Garten", "Archiv:Gartenplan 2025", "Home"].map((text) => ({ text }));
    const texts = (query) => rankEntries(query, entries).map((entry) => entry.text);
    assert.deepEqual(texts("gart"), ["Garten", "Projekte:Garten", "Archiv:Gartenplan 2025"]);
    assert.deepEqual(texts("proj gart"), ["Projekte:Garten"]);
    assert.deepEqual(texts("xyz"), []);
    assert.deepEqual(texts(""), entries.map((entry) => entry.text));
    assert.deepEqual(texts("2025 plan"), ["Archiv:Gartenplan 2025"]);
    assert.equal(rankEntries("", entries, 2).length, 2);
});

test("date texts cover the common ways to write a day", () => {
    const date = new Date(2026, 10, 3, 9, 5);
    // The long form comes from the system's locale data, whose punctuation
    // differs between versions; only its parts are checked.
    const german = dateTexts(date, "de");
    assert.deepEqual(
        [german[0], german[1], german[3], german[4], german[5], german[6]],
        ["03.11.2026", "03.11.2026 09:05", "2026-11-03", "2026-11-03 09:05", "09:05", "[d: 2026-11-03]"],
    );
    assert.equal(german.length, 7);
    assert.match(german[2], /^Dienstag,? 3\. November 2026$/);
    assert.equal(dateTexts(date, "en")[0], "03/11/2026");
    assert.match(dateTexts(date, "en")[2], /^Tuesday,? 3 November 2026$/);
});

test("parents and neighbours in the page list", () => {
    assert.equal(parentName("A:B:C"), "A:B");
    assert.equal(parentName("A"), "");
    const names = ["A", "A:B", "C"];
    assert.equal(neighbourPage(names, "A:B", 1), "C");
    assert.equal(neighbourPage(names, "A:B", -1), "A");
    assert.equal(neighbourPage(names, "C", 1), null);
    assert.equal(neighbourPage(names, "A", -1), null);
    assert.equal(neighbourPage(names, "Fehlt", 1), "A");
    assert.equal(neighbourPage([], "A", 1), null);
});

test("the text size stays within sensible bounds", () => {
    assert.equal(clampFontSize(15), 15);
    assert.equal(clampFontSize("20"), 20);
    assert.equal(clampFontSize(3), 11);
    assert.equal(clampFontSize(99), 26);
    assert.equal(clampFontSize("abc"), 15);
});
