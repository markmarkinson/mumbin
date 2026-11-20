import assert from "node:assert/strict";
import { test } from "node:test";

import { menuEntries, protectionOf } from "../renderer/js/protection.js";

const facts = (changes = {}) => ({ sealed: false, own: false, ownOpen: false, encrypted: false, ...changes });
const offered = (entries) => Object.keys(entries).filter((name) => entries[name]);

test("a plain page can be encrypted with the vault or get a password of its own", () => {
    assert.deepEqual(offered(menuEntries(facts())), ["toggleEncrypted", "protectPage"]);
    assert.equal(protectionOf(facts()), "none");
});

test("a page of the vault is decrypted, not given a second protection", () => {
    assert.deepEqual(offered(menuEntries(facts({ encrypted: true }))), ["toggleEncrypted"]);
    assert.equal(protectionOf(facts({ encrypted: true })), "vault");
});

test("a page with its own password offers what fits it and never the vault", () => {
    // `encrypted` is true for such a page as well (it is stored encrypted); the vault does not apply.
    assert.deepEqual(offered(menuEntries(facts({ own: true, encrypted: true }))), ["changePagePassword", "removePageProtection"]);
    assert.deepEqual(offered(menuEntries(facts({ own: true, encrypted: true, ownOpen: true }))), ["changePagePassword", "removePageProtection", "lockPage"]);
    assert.equal(protectionOf(facts({ own: true })), "own-locked");
    assert.equal(protectionOf(facts({ own: true, ownOpen: true })), "own-open");
});

test("a notebook that is encrypted as a whole offers no choice per page", () => {
    assert.deepEqual(offered(menuEntries(facts({ sealed: true, encrypted: true }))), []);
    assert.equal(protectionOf(facts({ sealed: true, encrypted: true })), "none");
});

test("no state offers two entries that contradict each other", () => {
    for (const sealed of [false, true]) {
        for (const own of [false, true]) {
            for (const ownOpen of [false, true]) {
                for (const encrypted of [false, true]) {
                    const entries = menuEntries({ sealed, own, ownOpen, encrypted });
                    assert.ok(!(entries.protectPage && entries.removePageProtection), "protect and remove together");
                    assert.ok(!(entries.toggleEncrypted && entries.changePagePassword), "vault and own password together");
                    assert.ok(!(entries.lockPage && !entries.changePagePassword), "lock without a password");
                }
            }
        }
    }
});
