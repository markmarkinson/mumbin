import assert from "node:assert/strict";
import { test } from "node:test";

import { ancestors, isWithin, leafName, renamedName } from "../renderer/js/pagenames.js";

test("isWithin accepts the page itself and everything below, not look-alikes", () => {
    assert.equal(isWithin("Projects", "Projects"), true);
    assert.equal(isWithin("Projects:Garden", "Projects"), true);
    assert.equal(isWithin("Projects:Garden:Beds", "Projects:Garden"), true);
    assert.equal(isWithin("ProjectsX", "Projects"), false);
    assert.equal(isWithin("Projects", "Projects:Garden"), false);
});

test("leafName is the last part", () => {
    assert.equal(leafName("Projects:Garden:Beds"), "Beds");
    assert.equal(leafName("Home"), "Home");
});

test("renamedName moves a page with its parent and leaves others alone", () => {
    assert.equal(renamedName("A:B:C", "A:B", "X"), "X:C");
    assert.equal(renamedName("A:B", "A:B", "X:Y"), "X:Y");
    assert.equal(renamedName("A:BB", "A:B", "X"), "A:BB");
    assert.equal(renamedName("Other", "A", "X"), "Other");
});

test("ancestors lists the pages above, topmost first", () => {
    assert.deepEqual(ancestors("a:b:c"), ["a", "a:b"]);
    assert.deepEqual(ancestors("a:b"), ["a"]);
    assert.deepEqual(ancestors("a"), []);
});
