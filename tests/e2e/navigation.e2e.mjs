// End-to-end check of navigation, search and the conflict dialog in the real exe.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readPageFile } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";

await scenario("navigation", "links, back/home, backlinks, search, conflict", async (t) => {
    const notebook = t.notebook();
    const app = await t.launch({ notebook });
    const link = (text) => app.clickText(".cm-content .wk-link", text);

    // Following a link in the text opens that page.
    await link("Projekte");
    await app.waitForPage("Projekte");

    // A link inside a page: Projekte -> Projekte:Garten.
    await link("Projekte:Garten");
    await app.waitForPage("Garten");

    // Back returns to the previous page, Home goes to the start page.
    await app.back();
    await app.waitForPage("Projekte");
    await app.home();
    await app.waitForPage("Home");

    // Backlinks list the pages that link here.
    // The list follows the page a moment after it has opened.
    await app.waitFor("document.getElementById('backlinks').textContent.includes('Projekte')");

    // Search finds a page by its text.
    await app.click("#search-input");
    await app.type("Tomaten");
    await app.press("Enter");
    await app.waitFor("document.querySelector('#search-results')?.textContent.includes('Garten')");

    // Up to here nothing may have logged an error. The conflict below logs one on purpose.
    app.expectConsoleErrors();

    // A change from outside is reported instead of being overwritten.
    await app.openFromTree("Zweite Seite");
    await app.toEnd();
    await app.type("meine Zeile\n");
    fs.appendFileSync(path.join(notebook, "Zweite_Seite.txt"), "von aussen\r\n");
    await app.press("s", { ctrl: true });
    await app.waitFor("!document.querySelector('#conflict')?.hidden", { timeout: 8000 });
    const onDisk = readPageFile(notebook, "Zweite Seite");
    assert.ok(onDisk.includes("von aussen") && !onDisk.includes("meine Zeile"), "conflict overwrote the foreign change");

    // Keeping my version resolves it.
    await app.click("#btn-keep-mine");
    await app.waitFor("document.querySelector('#conflict')?.hidden === true", { timeout: 8000 });
    assert.ok(readPageFile(notebook, "Zweite Seite").includes("meine Zeile"), "kept version not saved");
});
