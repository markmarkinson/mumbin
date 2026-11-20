import test from "node:test";
import assert from "node:assert/strict";
import { createHistory } from "../renderer/js/navigation.js";
test("history retains forward path until a new page is visited", () => {
    const h = createHistory();
    h.visit("A"); h.visit("B"); h.visit("C");
    assert.equal(h.target(-1), "B");
    h.moved(-1);
    assert.equal(h.target(1), "C");
    h.visit("D");
    assert.equal(h.target(1), null);
    assert.equal(h.target(-1), "B");
    h.reset(); assert.equal(h.target(-1), null);
});

test("history follows a rename of a page and its sub-pages", () => {
    const h = createHistory();
    h.visit("Home"); h.visit("Projekte"); h.visit("Projekte:Garten"); h.visit("Projekte2");
    h.renamed("Projekte", "Arbeit");
    assert.equal(h.target(-1), "Arbeit:Garten");
    h.moved(-1); h.moved(-1);
    assert.equal(h.target(-1), "Home");
    assert.equal(h.target(1), "Arbeit:Garten");
    // "Projekte2" only shares a prefix and must not be renamed.
    h.moved(1); h.moved(1);
    assert.equal(h.target(0), "Projekte2");
});

test("history drops deleted pages and keeps a sensible position", () => {
    const h = createHistory();
    h.visit("Home"); h.visit("A"); h.visit("A:B"); h.visit("C");
    h.removed("A");
    assert.equal(h.target(-1), "Home");
    assert.equal(h.target(1), null);
    const only = createHistory();
    only.visit("A"); only.visit("A:B");
    only.removed("A");
    assert.equal(only.target(-1), null);
    assert.equal(only.target(1), null);
    only.visit("Home");
    assert.equal(only.target(-1), null);
});
