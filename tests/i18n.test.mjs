import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { appName, errorText, t } from "../renderer/js/i18n.js";
import { MODES } from "../renderer/js/tasks.js";
import { de } from "../renderer/js/texts.de.js";
import { en } from "../renderer/js/texts.en.js";

const rendererDir = new URL("../renderer/", import.meta.url);
const jsDir = new URL("js/", rendererDir);
const read = (url) => readFileSync(url, "utf8");

const sources = readdirSync(jsDir)
    .filter((name) => name.endsWith(".js") && !/^(i18n|texts\.)/.test(name))
    .map((name) => ({ name, text: read(new URL(name, jsDir)) }));
const html = read(new URL("index.html", rendererDir));
const source = (name) => sources.find((entry) => entry.name === name).text;

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test("German and English have the same keys in the same order", () => {
    assert.deepEqual(Object.keys(en), Object.keys(de));
});

test("German and English use the same placeholders", () => {
    for (const key of Object.keys(de)) assert.deepEqual(placeholders(en[key]), placeholders(de[key]), key);
});

test("no text is empty", () => {
    for (const [key, text] of [...Object.entries(de), ...Object.entries(en)]) assert.notEqual(text.trim(), "", key);
});

// Keys that are built at run time: `cmd.<id>`, `error.<code>`, `tasks.mode.<mode>` and so on.
const commandIds = [...source("actions.js").matchAll(/\{ id: "([\w.]+)"/g)].map((match) => match[1]);
const groups = [...source("actions.js").match(/const GROUPS = \[([^\]]*)\]/)[1].matchAll(/"(\w+)"/g)].map((match) => match[1]);
const numbered = (prefix) => [1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) => [`${prefix}.${n}.what`, `${prefix}.${n}.how`]);
const dynamicKeys = [
    ...commandIds.map((id) => `cmd.${id}`),
    ...[...groups, "search", "typing"].map((group) => `group.${group}`),
    ...numbered("find"),
    ...numbered("typing"),
    ...["saved", "saving", "dirty", "conflict", "new"].map((kind) => `save.${kind}`),
    ...MODES.map((mode) => `tasks.mode.${mode}`),
    ...[0, 1, 2, 3, 4].map((level) => `strength.${level}`),
    ...["title", "text", "confirm"].flatMap((part) => ["create", "unlock", "change"].map((mode) => `vault.${part}.${mode}`)),
];
// Codes of the errors the shell reports, plus the ones the window makes up itself.
const errorCodes = Object.keys(de)
    .filter((key) => key.startsWith("error."))
    .map((key) => key.slice("error.".length));

test("every dynamic key has a text", () => {
    assert.ok(commandIds.length > 50, "the command list was not found");
    for (const key of dynamicKeys) assert.ok(key in de, `missing text: ${key}`);
});

test("every error text belongs to a code that something reports", () => {
    const rust = ["../../src-tauri/src/", "../../crates/core/src/"].flatMap((dir) =>
        readdirSync(new URL(dir, jsDir), { recursive: true })
            .filter((name) => name.endsWith(".rs"))
            .map((name) => read(new URL(`${dir}${name}`, jsDir))),
    );
    const reporters = [...sources.map((entry) => entry.text), ...rust, read(new URL("i18n.js", jsDir))].join("\n");
    for (const code of errorCodes) assert.ok(reporters.includes(`"${code}"`) || code === "unknown", `no one reports error code ${code}`);
});

/** The text from `start` (just after an opening parenthesis) up to its partner. */
function callArguments(text, start) {
    let depth = 1;
    let end = start;
    while (end < text.length && depth > 0) {
        if (text[end] === "(") depth += 1;
        else if (text[end] === ")") depth -= 1;
        end += 1;
    }
    return text.slice(start, end);
}

/** Keys named in `t("…")` calls (also in conditionals) and in `data-i18n…` attributes. */
function staticReferences() {
    const keys = new Set();
    const keyLiteral = /"([a-z][\w]*(?:\.[\w]+)+)"/g;
    for (const { text } of sources) {
        for (const call of text.matchAll(/\bt\(/g)) {
            for (const literal of callArguments(text, call.index + call[0].length).matchAll(keyLiteral)) keys.add(literal[1]);
        }
    }
    for (const attribute of html.matchAll(/data-i18n[\w-]*="([^"]+)"/g)) keys.add(attribute[1]);
    return keys;
}

test("every text named in the code exists", () => {
    for (const key of staticReferences()) assert.ok(key in de, `missing text: ${key}`);
});

test("no text is unused", () => {
    const used = new Set([...staticReferences(), ...dynamicKeys, ...errorCodes.map((code) => `error.${code}`)]);
    assert.deepEqual(Object.keys(de).filter((key) => !used.has(key)), []);
});

test("t fills placeholders and falls back to the key", () => {
    assert.equal(t("no.such.key"), "no.such.key");
    assert.equal(t("move.linksFailed", { pages: "A, B" }).includes("A, B"), true);
    assert.equal(t("conflict.text").includes(appName), true);
    assert.equal(errorText({ code: "no-such-code" }), t("error.unknown"));
});
