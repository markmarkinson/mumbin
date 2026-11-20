// End-to-end check against the real exe: typing is saved to the page file,
// untouched pages are never rewritten, and the foreign header survives.
// Run with `npm run test:e2e` (builds nothing: build the exe first).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readPageFile } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";

await scenario("basic", "typing saved, header kept, other pages untouched", async (t) => {
    const notebook = t.notebook();
    const otherFile = path.join(notebook, "Zweite_Seite.txt");
    const before = { home: readPageFile(notebook, "Home"), otherTime: fs.statSync(otherFile).mtimeMs };
    const app = await t.launch({ notebook });

    // The picture sits at the end of the page and is only drawn once scrolled
    // into view. It must be really loaded, not just a broken frame.
    await app.evaluate("document.querySelector('.cm-scroller').scrollTop = 1e6");
    await app.waitFor("(document.querySelector('.cm-content .wk-img img')?.naturalWidth ?? 0) > 0", { timeout: 8000 });

    // 1. Simply viewing pages must not touch any file.
    await app.settle();
    assert.equal(readPageFile(notebook, "Home"), before.home, "opening a page rewrote it");
    assert.equal(fs.statSync(otherFile).mtimeMs, before.otherTime, "another page was touched");

    // 2. Typing at the end of the page is saved by Ctrl+S.
    await app.toEnd();
    await app.type("\nE2E-Zeile mit **fett**\n");
    await app.save();
    const after = readPageFile(notebook, "Home");
    assert.ok(after.includes("E2E-Zeile mit **fett**"), "typed text is not on disk");
    assert.ok(after.startsWith("Content-Type: text/x-mumbin-page"), "page header lost");
    assert.ok(after.includes(before.home.split(/\r?\n/)[3]), "original content lost");
    assert.equal(after.includes("\r\n") && after.replaceAll("\r\n", "").includes("\n"), false, "mixed line endings");

    // 3. The other page is still untouched.
    assert.equal(fs.statSync(otherFile).mtimeMs, before.otherTime, "saving touched another page");
    app.expectConsoleErrors();
});
