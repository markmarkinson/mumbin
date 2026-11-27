// End-to-end check of the outline (table of contents) and of links that name a
// place in a page (`Seite#Abschnitt`), in the real exe.

import assert from "node:assert/strict";
import { writePage } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";
import { sleep } from "./wait.mjs";

const filler = (count) => Array.from({ length: count }, (_, index) => `Zeile ${index + 1} mit etwas Text.`).join("\r\n");

await scenario("outline", "outline list, jump, follows cursor and text, anchor links", async (t) => {
    const notebook = t.notebook();
    writePage(notebook, "Gliederung", [
        "====== Handbuch ======",
        "===== Einleitung =====", filler(40),
        "===== Bedienung =====", filler(40),
        "==== Menüs ====", filler(40),
        "=== Kontextmenü ===", filler(40),
        "'''", "===== Nur Beispiel =====", "'''",
        "===== Anhang =====", "{{id: marke-eins}} Text mit Anker", filler(40),
        "",
    ]);
    writePage(notebook, "Ohne", ["Nur Text, keine einzige Überschrift.", filler(5), ""]);
    writePage(notebook, "Anker", [
        "====== Anker ======",
        "[[Gliederung#Bedienung]]",
        "[[Gliederung#marke-eins]]",
        "[[Gliederung#Gibt es nicht]]",
        "[[#Unten]]",
        filler(60),
        "===== Unten =====",
        "Das Ende der Seite.",
        "",
    ]);
    const app = await t.launch({ notebook });

    const items = () => app.texts("#outline-list .outline-item");
    const indents = () => app.evaluate("[...document.querySelectorAll('#outline-list .outline-item')].map((e) => parseInt(e.style.paddingLeft, 10))");
    const active = () => app.texts("#outline-list .outline-item.active");
    const waitActive = (heading) => app.waitFor(`document.querySelector('#outline-list .outline-item.active')?.textContent === ${JSON.stringify(heading)}`, { timeout: 5000 });

    /** True when a line containing `text` is inside the visible part of the editor. */
    const lineInView = (text) =>
        app.evaluate(`(() => {
            const line = [...document.querySelectorAll('.cm-line')].find((e) => e.textContent.includes(${JSON.stringify(text)}));
            if (!line) return false;
            const box = document.querySelector('.cm-scroller').getBoundingClientRect();
            const r = line.getBoundingClientRect();
            return r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
        })()`);

    async function clickLink(text) {
        // Back in a page the view may be scrolled to where the cursor was.
        await app.evaluate("document.querySelector('.cm-scroller').scrollTop = 0");
        await sleep(250);
        await app.clickText(".cm-content .wk-link", text);
    }

    // ── The list ──────────────────────────────────────────────────────────
    await app.openFromTree("Gliederung", { timeout: 10000 });
    await app.openDock("outline");
    await app.waitFor("document.querySelectorAll('#outline-list .outline-item').length > 0");
    assert.deepEqual(await items(), ["Einleitung", "Bedienung", "Menüs", "Kontextmenü", "Anhang"], "the single page title, or a heading inside a code block, is listed");
    assert.deepEqual(await indents(), [10, 10, 24, 38, 10], "indentation does not follow the heading levels");
    assert.deepEqual(await active(), [], "a heading is marked while the cursor is above all of them");

    // ── A click goes to the heading and marks it ──────────────────────────
    await app.click("#outline-list .outline-item:nth-child(3)");
    await app.waitForCount("#outline-list .outline-item.active", 1);
    assert.deepEqual(await active(), ["Menüs"]);
    assert.ok(await lineInView("Menüs"), "the heading is not in view after the click");

    // ── The mark follows the cursor ───────────────────────────────────────
    await app.toEnd({ click: false });
    await waitActive("Anhang");
    await app.press("Home", { ctrl: true });
    await app.waitForCount("#outline-list .outline-item.active", 0);

    // ── The list follows the text ─────────────────────────────────────────
    await app.press("End", { ctrl: true });
    await app.type("\n===== Neu eingefügt =====\n");
    await app.waitFor("[...document.querySelectorAll('#outline-list .outline-item')].some((e) => e.textContent === 'Neu eingefügt')", { timeout: 5000 });
    assert.deepEqual(await active(), ["Neu eingefügt"]);
    for (let undo = 0; undo < 3 && (await items()).includes("Neu eingefügt"); undo += 1) {
        await app.press("z", { ctrl: true });
        await sleep(500);
    }
    assert.ok(!(await items()).includes("Neu eingefügt"), "the heading stays in the list after undo");

    // ── A page without headings says so ───────────────────────────────────
    await app.openFromTree("Ohne", { timeout: 10000 });
    await app.waitFor("document.querySelector('#outline-list .dock-empty') !== null");
    assert.match(await app.text("#outline-list"), /keine Überschriften|no headings/i);

    // ── Links that name a place ───────────────────────────────────────────
    await app.openFromTree("Anker", { timeout: 10000 });
    await clickLink("Gliederung#Bedienung");
    await app.waitForPage("Gliederung");
    await waitActive("Bedienung");
    assert.ok(await lineInView("Bedienung"), "the link did not scroll to the heading");

    await app.back();
    await app.waitForPage("Anker");
    await clickLink("Gliederung#marke-eins");
    await app.waitForPage("Gliederung");
    await waitActive("Anhang");
    assert.ok(await lineInView("Text mit Anker"), "an {{id: …}} anchor was not found");

    await app.back();
    await app.waitForPage("Anker");
    await clickLink("Gliederung#Gibt es nicht");
    assert.match(await app.waitToast(undefined, { timeout: 5000 }), /Gibt es nicht/);
    assert.ok((await app.crumbs()).includes("Gliederung"), "the page should still open");

    await app.back();
    await app.waitForPage("Anker");
    await clickLink("#Unten");
    await waitActive("Unten");
    assert.ok((await lineInView("Das Ende der Seite")) || (await lineInView("Unten")), "a link to a heading of the same page did not scroll");
    assert.ok((await app.crumbs()).endsWith("Anker"), "a link within the page must not open another page");

    app.expectConsoleErrors();
});
