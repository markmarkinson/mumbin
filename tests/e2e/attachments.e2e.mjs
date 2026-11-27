// End-to-end check of attachments in the real exe: the list, inserting links,
// pasting pictures and files from the clipboard, hostile file names, size limit,
// and file links to files that do not exist. Opening files with other programs
// is deliberately not exercised: it would start programs on this machine.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makePng, PNG, readPageFile } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";
import { sleep, waitUntil } from "./wait.mjs";

const pad = (number) => String(number).padStart(2, "0");
const now = new Date();
const dateStamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;

await scenario("attachments", "list, insert, paste, hostile name, size limit, missing file link, picture viewer", async (t) => {
    const notebook = t.notebook();
    const home = path.join(notebook, "Home");
    const app = await t.launch({ notebook });

    const names = () => app.data("#attach-list .attach", "name");
    const fileAppears = (file) => waitUntil(() => fs.existsSync(file), { timeout: 8000, what: `${file} to be created` });
    const attachCount = (count, options) => app.waitForCount("#attach-list .attach", count, options);

    /** Pastes files into the editor the way the browser delivers them. */
    const paste = (files) =>
        app.evaluate(`(() => {
            const bytes = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const data = new DataTransfer();
            for (const f of ${JSON.stringify(files)}) {
                const content = f.base64 ? bytes(f.base64) : new Uint8Array(f.size ?? 4);
                data.items.add(new File([content], f.name, { type: f.type }));
            }
            const target = document.querySelector('.cm-content');
            target.focus();
            target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        })()`);
    const pastePicture = (name, png) => paste([{ name, type: "image/png", base64: png.toString("base64") }]);

    // ── The list ──────────────────────────────────────────────────────────
    await app.waitFor("document.querySelector('#attachments-count')?.textContent === '2'");
    await app.openDock("attachments");
    await attachCount(2);
    assert.deepEqual(await names(), ["bild.png", "notiz.pdf"]);
    assert.match(await app.text('.attach[data-name="notiz.pdf"] .attach-size'), /^16 B$/);

    // ── Insert as link / picture at the cursor ────────────────────────────
    await app.toEnd();
    await app.click('.attach[data-name="notiz.pdf"] .attach-insert');
    await app.click('.attach[data-name="bild.png"] .attach-insert');
    await app.save();
    let page = readPageFile(notebook, "Home");
    assert.ok(page.includes("[[./notiz.pdf]]"), "file link not inserted");
    assert.ok(page.includes("{{./bild.png}}"), "picture not inserted");
    assert.ok(page.indexOf("[[./notiz.pdf]]") > page.indexOf("'''"), "insert did not go to the cursor at the end");

    // ── Paste a screenshot ────────────────────────────────────────────────
    await app.toEnd();
    await pastePicture("image.png", PNG);
    const first = path.join(home, `pasted_image_${dateStamp}.png`);
    await fileAppears(first);
    assert.deepEqual(fs.readFileSync(first), PNG, "stored bytes differ from the pasted ones");
    await attachCount(3, { timeout: 8000 });

    await app.toEnd();
    await pastePicture("image.png", PNG);
    await fileAppears(path.join(home, `pasted_image_${dateStamp}-2.png`));
    assert.ok(fs.existsSync(first), "a second paste replaced the first picture");

    await app.save();
    page = readPageFile(notebook, "Home");
    assert.ok(page.includes(`{{./pasted_image_${dateStamp}.png}}`) && page.includes(`{{./pasted_image_${dateStamp}-2.png}}`), "pasted pictures are not referenced in the page");
    await app.evaluate("document.querySelector('.cm-scroller').scrollTop = 1e6");
    await app.waitFor("[...document.querySelectorAll('.cm-content .wk-img img')].filter((i) => i.naturalWidth > 0).length >= 3", { timeout: 8000 });

    // ── Other files become links and keep their name ──────────────────────
    await app.toEnd();
    await paste([{ name: "Notizen 1.txt", type: "text/plain", size: 10 }]);
    await fileAppears(path.join(home, "Notizen 1.txt"));
    await app.waitFor("document.querySelector('.cm-content').textContent.includes('Notizen 1.txt')");

    // ── A hostile file name cannot leave the page's folder ────────────────
    await app.toEnd();
    await pastePicture("..\\..\\evil.png", PNG);
    await fileAppears(path.join(home, "evil.png"));
    for (const outside of [path.join(notebook, "evil.png"), path.join(notebook, "..", "evil.png")]) {
        assert.ok(!fs.existsSync(outside), `${outside} was written outside the page folder`);
    }

    // ── Too large: refused, nothing stored ────────────────────────────────
    const before = fs.readdirSync(home).sort();
    await app.toEnd();
    await paste([{ name: "riesig.png", type: "image/png", size: 21 * 1024 * 1024 }]);
    assert.match(await app.waitToast(), /zu groß|too large/);
    await sleep(500);
    assert.deepEqual(fs.readdirSync(home).sort(), before, "a refused file was stored anyway");

    // ── A file link to nothing: a message, no program ─────────────────────
    // The link goes to the top of the page, where it is in view and stays put.
    await app.click(".cm-content");
    await app.press("Home", { ctrl: true });
    await app.type("[[./gibt-es-nicht.pdf]]\n");
    await app.waitFor("[...document.querySelectorAll('.cm-content .wk-link')].some((e) => e.textContent === './gibt-es-nicht.pdf')");
    // Typing may leave line 1 just above the visible area, under the format bar.
    await app.evaluate("document.querySelector('.cm-scroller').scrollTop = 0");
    await sleep(200);
    await app.clickText(".cm-content .wk-link", "./gibt-es-nicht.pdf");
    await app.waitToast("gibt-es-nicht");
    app.expectConsoleErrors();

    // ── A page without a folder: empty list; pasting creates the folder ───
    await app.openFromTree("Zweite Seite");
    await app.waitFor("document.querySelectorAll('#attach-list .attach').length === 0 && document.querySelector('#attachments-count').textContent === ''");
    assert.ok(!fs.existsSync(path.join(notebook, "Zweite_Seite")), "looking at a page created its folder");
    await app.toEnd();
    await pastePicture("foto.png", PNG);
    await fileAppears(path.join(notebook, "Zweite_Seite", "foto.png"));
    await attachCount(1, { timeout: 8000 });
    assert.ok(readPageFile(notebook, "Zweite Seite").includes("Eine Testseite"), "the page itself was damaged");

    // ── Large pictures fit the page and open in a viewer ──────────────────
    // A wide and a tall screenshot, far bigger than the column and the window.
    for (const [name, width, height] of [["breit.png", 2400, 60], ["hoch.png", 300, 2400]]) {
        await app.toEnd({ click: false });
        await pastePicture(name, makePng(width, height));
        await fileAppears(path.join(notebook, "Zweite_Seite", name));
    }
    // Look at the page from the top so the pictures are drawn, not shown as text.
    await app.focusEditor();
    await app.press("Home", { ctrl: true });
    await app.waitFor("['breit.png', 'hoch.png'].every((n) => { const i = document.querySelector(`.wk-img img[title=\"./${n}\"]`); return i && i.naturalWidth > 0; })", { timeout: 10000 });
    const box = (name) =>
        app.evaluate(`(() => {
            const image = document.querySelector('.wk-img img[title="./${name}"]');
            image.scrollIntoView({ block: 'nearest' });
            const r = image.getBoundingClientRect();
            const column = document.querySelector('.cm-content').getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height, columnWidth: column.width, windowHeight: window.innerHeight, natural: [image.naturalWidth, image.naturalHeight] };
        })()`);
    const wide = await box("breit.png");
    assert.deepEqual(wide.natural, [2400, 60]);
    assert.ok(wide.w <= wide.columnWidth + 1, `wide picture is ${wide.w}px in a ${wide.columnWidth}px column`);
    assert.ok(Math.abs(wide.w / wide.h - 2400 / 60) < 1.5, `wide picture was distorted: ${wide.w}x${wide.h}`);
    const tall = await box("hoch.png");
    assert.deepEqual(tall.natural, [300, 2400]);
    assert.ok(tall.h <= tall.windowHeight * 0.6 + 1, `tall picture is ${tall.h}px high in a ${tall.windowHeight}px window`);
    assert.ok(Math.abs(tall.w / tall.h - 300 / 2400) < 0.01, `tall picture was distorted: ${tall.w}x${tall.h}`);

    // A click opens the viewer: fitted first, real size on the next click, Esc closes it.
    const open = async (name) => {
        const r = await box(name);
        await sleep(200);
        await app.clickAt(r.x + r.w / 2, r.y + r.h / 2);
        await app.waitFor("!document.querySelector('#lightbox').hidden");
        await app.waitFor("document.querySelector('#lightbox-img').naturalWidth > 0");
    };
    const viewer = () =>
        app.evaluate(`(() => {
            const r = document.querySelector('#lightbox-img').getBoundingClientRect();
            return { w: r.width, h: r.height, actual: document.querySelector('#lightbox').classList.contains('actual'), windowWidth: window.innerWidth, windowHeight: window.innerHeight };
        })()`);
    await open("breit.png");
    let seen = await viewer();
    assert.ok(!seen.actual && seen.w <= seen.windowWidth && Math.abs(seen.w / seen.h - 40) < 1.5, `wide picture not fitted: ${JSON.stringify(seen)}`);
    await app.click("#lightbox-img");
    seen = await viewer();
    assert.ok(seen.actual && Math.round(seen.w) === 2400, `no real size on the second click: ${JSON.stringify(seen)}`);
    await app.press("Escape");
    await app.waitFor("document.querySelector('#lightbox').hidden === true");

    await open("hoch.png");
    seen = await viewer();
    assert.ok(seen.h <= seen.windowHeight && seen.w < 300, `tall picture not fitted: ${JSON.stringify(seen)}`);
    await app.click("#lightbox-close");
    await app.waitFor("document.querySelector('#lightbox').hidden === true");
    assert.equal(await app.evaluate("document.querySelector('#lightbox-img').hasAttribute('src')"), false, "viewer keeps the picture loaded");
    // The click on a picture did not turn it back into text.
    assert.ok(await app.visible('.wk-img img[title="./breit.png"]'), "the picture turned into text after the click");
});
