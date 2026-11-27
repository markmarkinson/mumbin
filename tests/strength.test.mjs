import assert from "node:assert/strict";
import { test } from "node:test";
import { passphraseStrength } from "../renderer/js/strength.js";

const level = (text) => passphraseStrength(text).level;

test("the worst passphrases are very weak", () => {
    for (const text of ["", "passwort", "Passwort", "password1", "12345678", "11111111", "abcd1234", "qwertzui", "Passwort123"]) {
        assert.equal(level(text), 0, `${text} should be very weak`);
    }
});

test("keyboard and alphabet runs do not count as long", () => {
    assert.ok(level("abcdefghijklmnop") <= 1);
    assert.ok(level("1234567890123456") <= 1);
});

test("a short sentence is fair, a long one is strong", () => {
    assert.ok(level("ein langer geheimer Satz") >= 2);
    assert.equal(level("Der gelbe Hund trinkt jeden Morgen kalten Tee am Fenster"), 4);
});

test("more words are never weaker, and a repeated word adds almost nothing", () => {
    const a = passphraseStrength("gelber Hund trinkt Tee").bits;
    const b = passphraseStrength("gelber Hund trinkt Tee am Morgen").bits;
    assert.ok(b > a);
    assert.ok(passphraseStrength("Haus Haus Haus Haus").bits < passphraseStrength("Haus Baum Fluss Wolke").bits);
});

test("random mixed characters are good", () => {
    assert.ok(level("k9#Qx!2vLpR7") >= 3);
});

test("a word with a year behind it is weaker than its length suggests", () => {
    assert.ok(level("Sommer2026!") <= 2);
});

test("accents and umlauts are fine, and the same text normalises the same", () => {
    assert.equal(passphraseStrength("Café mit Gebäck am Morgen").bits, passphraseStrength("Café mit Gebäck am Morgen").bits);
});
