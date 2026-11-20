// End-to-end check of dropping files onto a page. The operating system's own
// drag and drop cannot be scripted, so the test replays the event Tauri would
// deliver (paths and a position) through the handle the app offers in test
// mode (`MUMBIN_E2E=1`). Everything behind that point is the real thing:
// the question, copying or linking, the insert position, the overlay.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PNG, readPageFile } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";

await scenario("drop", "overlay, cancel, copy, numbering, link only, known file, cursor, no page", async (t) => {
    const notebook = t.notebook();
    const home = path.join(notebook, "Home");
    const source = t.tempDir();
    const pdf = path.join(source, "Vertrag 2026.pdf");
    const png = path.join(source, "foto.png");
    const folder = path.join(source, "Ordner");
    const missing = path.join(source, "gibt-es-nicht.pdf");
    fs.writeFileSync(pdf, "%PDF-1.4 test");
    fs.writeFileSync(png, PNG);
    fs.mkdirSync(folder);

    const app = await t.launch({ notebook });
    const listing = () => fs.readdirSync(home).sort();

    /** Replays a drop and answers the question: "copy", "link" or "cancel". */
    async function drop(paths, point, choice) {
        const scale = await app.evaluate("window.devicePixelRatio");
        const position = point ? { x: point.x * scale, y: point.y * scale } : null;
        await app.evaluate(`window.__drop = null;
            window.__mumbin.dropFiles(${JSON.stringify(paths)}, ${JSON.stringify(position)})
                .then(() => { window.__drop = 'done'; }, (error) => { window.__drop = 'error: ' + JSON.stringify(error); });
            0`);
        await app.waitDialog("dlg-drop");
        await app.click(`#dlg-drop-${choice}`);
        await app.waitFor("window.__drop !== null", { timeout: 10000 });
        assert.equal(await app.evaluate("window.__drop"), "done");
    }

    /** The left edge of the line that starts with `text`: a place to drop at. */
    async function lineStart(text) {
        const rect = await app.evaluate(`(() => {
            const line = [...document.querySelectorAll('.cm-line')].find((e) => e.textContent.trimStart().startsWith(${JSON.stringify(text)}));
            if (!line) return null;
            const r = line.getBoundingClientRect();
            return { x: r.x, y: r.y, h: r.height };
        })()`);
        assert.ok(rect, `no line starting with ${text}`);
        return { x: rect.x + 1, y: rect.y + rect.h / 2 };
    }

    await app.waitFor("typeof window.__mumbin === 'object'");
    const startListing = listing();

    // ── The overlay follows the drag ──────────────────────────────────────
    await app.evaluate("window.__mumbin.dragEvent({ type: 'enter', paths: [], position: { x: 1, y: 1 } })");
    assert.ok(await app.evaluate("document.querySelector('.content').classList.contains('drop-active')"), "no drop hint while dragging");
    assert.ok((await app.evaluate("getComputedStyle(document.querySelector('.content'), '::after').content")).length > 4, "drop hint has no text");
    await app.evaluate("window.__mumbin.dragEvent({ type: 'leave' })");
    assert.ok(!(await app.evaluate("document.querySelector('.content').classList.contains('drop-active')")), "drop hint stays after leaving");

    // ── Cancel changes nothing ────────────────────────────────────────────
    await drop([pdf], await lineStart("Willkommen"), "cancel");
    assert.deepEqual(listing(), startListing, "cancelled drop copied something");
    assert.equal(await app.evaluate("document.querySelector('#save-state').dataset.kind"), "saved", "cancelled drop changed the text");

    // ── Copy: files, a folder and a missing path in one drop ──────────────
    await drop([pdf, png, folder, missing], await lineStart("Willkommen"), "copy");
    assert.match(await app.waitToast("Ordner"), /gibt-es-nicht\.pdf/, "the missing file is not reported");
    assert.deepEqual(fs.readFileSync(path.join(home, "Vertrag 2026.pdf")), fs.readFileSync(pdf));
    assert.deepEqual(fs.readFileSync(path.join(home, "foto.png")), PNG);
    assert.ok(!fs.existsSync(path.join(home, "Ordner")), "a folder was copied");
    assert.ok(fs.existsSync(pdf) && fs.existsSync(png), "the originals vanished");
    await app.save();
    let page = readPageFile(notebook, "Home");
    // The links keep a space from the text they were dropped in front of.
    // Several files dropped into a line stay in that line, side by side.
    assert.ok(page.includes("[[./Vertrag 2026.pdf]] {{./foto.png}} Willkommen"), `links not at the drop position: ${page.slice(130, 330)}`);
    assert.ok(!page.includes("gibt-es-nicht"), "a missing file got a link");

    // ── A second drop never overwrites ────────────────────────────────────
    await drop([pdf, png], await lineStart("Links"), "copy");
    assert.ok(fs.existsSync(path.join(home, "Vertrag 2026-2.pdf")) && fs.existsSync(path.join(home, "foto-2.png")), "second copies not numbered");
    assert.deepEqual(fs.readFileSync(path.join(home, "Vertrag 2026.pdf")), fs.readFileSync(pdf), "the first copy was overwritten");

    // ── Link only: nothing is copied, files and folders get file addresses ─
    const beforeLink = listing();
    await drop([png, folder], await lineStart("Aufgaben"), "link");
    assert.deepEqual(listing(), beforeLink, "link only copied a file");
    await app.save();
    page = readPageFile(notebook, "Home").toLowerCase();
    for (const target of [png, folder]) {
        const expected = `[[file:///${target.replaceAll("\\", "/")}]]`.toLowerCase();
        assert.ok(page.includes(expected), `no link ${expected}`);
    }

    // The // of a file address is no italic markup.
    assert.equal(
        await app.evaluate("[...document.querySelectorAll('.cm-content .wk-italic')].filter((e) => e.textContent.includes(':/')).length"),
        0,
        "a file address was shown in italics",
    );

    // ── A file that already lies in the page's folder is not copied again ─
    const beforeKnown = listing();
    await drop([path.join(home, "bild.png")], await lineStart("dazu"), "copy");
    assert.deepEqual(listing(), beforeKnown, "an attachment was copied onto itself");
    await app.save();
    // Dropped at the same spot as the first links, in front of them: still separate links.
    const crowded = readPageFile(notebook, "Home");
    assert.ok(crowded.includes("{{./bild.png}}"), "the known attachment was not referenced");
    assert.ok(!/(\]\]|\}\})(\[\[|\{\{)/.test(crowded), `links dropped at one spot were glued together: ${JSON.stringify(crowded.slice(100, 420))}`);
    // A drop onto a heading must not tear the heading apart (two files were dropped there above).
    assert.ok(/^===== .*Links =====\r?$/m.test(crowded), `the heading was torn apart: ${JSON.stringify(crowded.slice(100, 420))}`);

    // ── Dropped beside the editor: goes to the cursor ─────────────────────
    // Focus without clicking: a click into the middle of the page could hit one of the
    // links dropped above, and following a file link starts a program on this machine.
    await app.toEnd({ click: false });
    await drop([pdf], { x: 60, y: 300 }, "copy");
    await app.save();
    assert.ok(fs.existsSync(path.join(home, "Vertrag 2026-3.pdf")));
    const stored = readPageFile(notebook, "Home");
    assert.ok(stored.trimEnd().endsWith("[[./Vertrag 2026-3.pdf]]"), `not inserted at the cursor, index ${stored.indexOf("Vertrag 2026-3")} of ${stored.length}: ${JSON.stringify(stored.slice(-160))}`);

    // ── With no page in view there is nothing to attach to ────────────────
    await app.click("#btn-tasks");
    await app.waitFor("!document.querySelector('#tasks')?.hidden");
    const beforeNone = listing();
    await app.evaluate(`window.__mumbin.dropFiles(${JSON.stringify([pdf])}, null)`);
    assert.match(await app.text("#toast"), /Öffne zuerst|Open a page first/);
    assert.equal(await app.evaluate("document.querySelector('#dlg-drop').open"), false, "asked a question with no page open");
    assert.deepEqual(listing(), beforeNone);

    app.expectConsoleErrors();
});
