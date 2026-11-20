// End-to-end check of shortcuts, the palette and the dialogs they open, in the real exe.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readPageFile } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";
import { waitUntil } from "./wait.mjs";

await scenario(
    "commands",
    "jump, neighbours, page template, format keys, checkboxes, link dialog, date, settings, zoom, help, switcher, recent",
    async (t) => {
        const notebook = t.notebook();
        const app = await t.launch({ notebook });
        const editorEndsWith = async (text) => assert.ok((await app.editorText()).endsWith(text), await app.editorText());
        const scrollerFontSize = () => app.evaluate("getComputedStyle(document.querySelector('.cm-scroller')).fontSize");

        // ── Jump to a page with Ctrl+J ───────────────────────────────────────
        await app.jump("gart", "Garten", "Projekte:Garten");
        assert.equal(await app.evaluate("document.getElementById('dlg-palette').open"), false);

        // ── Parent, neighbours, home ─────────────────────────────────────────
        await app.press("ArrowUp", { alt: true });
        await app.waitForPage("Projekte");
        assert.equal(await app.crumbs(), "Projekte");
        await app.press("ArrowDown", { alt: true });
        await app.waitForPage("Garten");
        await app.press("PageDown", { alt: true });
        await app.waitForPage("Haus");
        await app.press("PageUp", { alt: true });
        await app.waitForPage("Garten");
        await app.home();
        await app.waitForPage("Home");

        // ── A new page opens with its title, but no file until something is typed ──
        await app.jump("Neue Testseite");
        assert.match(await app.editorText(), /^====== Neue Testseite ======\nErstellt .+ \d{4}\n\n$/);
        assert.equal(await app.evaluate("document.querySelector('#save-state').dataset.kind"), "new");
        await app.settle();
        assert.equal(fs.existsSync(path.join(notebook, "Neue_Testseite.txt")), false, "an untouched new page must not create a file");

        // ── Formatting shortcuts work on the word under the cursor ───────────
        await app.toEnd();
        await app.type("Wort");
        await app.press("b", { ctrl: true });
        await editorEndsWith("**Wort**");
        await app.press("b", { ctrl: true });
        assert.ok((await app.editorText()).endsWith("Wort") && !(await app.editorText()).includes("**"), "second Ctrl+B removes the markers");
        await app.press("1", { ctrl: true });
        await editorEndsWith("====== Wort ======");
        await app.press("7", { ctrl: true });
        await editorEndsWith("\nWort");

        // ── Checkbox keys ────────────────────────────────────────────────────
        await app.press("Enter");
        await app.type("[]");
        await app.press(" ");
        await app.type("Aufgabe");
        await editorEndsWith("[ ] Aufgabe");
        await app.press("F12");
        await editorEndsWith("[*] Aufgabe");
        await app.press("F12", { shift: true });
        await editorEndsWith("[x] Aufgabe");

        // ── Link dialog: insert, then edit, then remove ──────────────────────
        await app.press("Enter");
        await app.press("Backspace");
        await app.press("l", { ctrl: true });
        await app.waitDialog("dlg-link");
        await app.type(":Projekte:Garten");
        await app.press("Tab");
        await app.type("der Garten");
        await app.press("Enter");
        await app.waitDialogClosed("dlg-link");
        await editorEndsWith("[[:Projekte:Garten|der Garten]]");

        for (let step = 0; step < 3; step += 1) await app.press("ArrowLeft");
        await app.press("e", { ctrl: true });
        await app.waitDialog("dlg-link");
        assert.equal(await app.evaluate("document.getElementById('link-target').value"), ":Projekte:Garten");
        assert.equal(await app.evaluate("document.getElementById('link-text').value"), "der Garten");
        assert.equal(await app.evaluate("document.getElementById('link-remove').hidden"), false);
        await app.click("#link-remove");
        await app.waitDialogClosed("dlg-link");
        assert.ok((await app.editorText()).endsWith("der Garten") && !(await app.editorText()).includes("[["), await app.editorText());

        // ── Insert the date ──────────────────────────────────────────────────
        await app.toEnd();
        await app.press("Enter");
        await app.press("d", { ctrl: true });
        await app.waitDialog("dlg-palette");
        const today = new Date();
        const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        await app.type(iso);
        await app.press("Enter");
        await app.waitDialogClosed("dlg-palette");
        assert.ok((await app.editorText()).trimEnd().endsWith(iso), await app.editorText());

        // ── What was typed is on disk, title line included ───────────────────
        await app.save();
        const stored = readPageFile(notebook, "Neue Testseite");
        assert.ok(stored.includes("====== Neue Testseite ======"), stored);
        assert.ok(stored.includes("[x] Aufgabe") && stored.includes(iso), stored);

        // ── Command palette runs a command by name: settings ─────────────────
        await app.command("einstell", "Einstellungen");
        await app.waitDialog("dlg-settings");
        await app.setValue("#set-font-size", "20", "input");
        assert.equal(await scrollerFontSize(), "20px");
        await app.setChecked("#set-template", false, "input");
        await app.press("Escape");
        await app.waitDialogClosed("dlg-settings");
        // The program saves the preferences a moment after the dialog closes: wait for them.
        const readSettings = () => JSON.parse(fs.readFileSync(path.join(app.dataDir, "settings.json"), "utf8"));
        await waitUntil(() => readSettings().preferences?.pageTemplate === false, { timeout: 5000, what: "the preferences on disk" });
        assert.equal(readSettings().preferences.fontSize, 20);

        // Without the template a new page is empty.
        await app.jump("Leere Seite");
        assert.equal(await app.editorText(), "");

        // ── Zoom keys ────────────────────────────────────────────────────────
        await app.press("0", { ctrl: true });
        assert.equal(await scrollerFontSize(), "15px");

        // ── Sidebar, help ────────────────────────────────────────────────────
        await app.press("F9");
        assert.equal(await app.evaluate("document.getElementById('sidebar').hidden"), true);
        await app.press("F9");
        assert.equal(await app.evaluate("document.getElementById('sidebar').hidden"), false);
        await app.press("F1");
        await app.waitDialog("dlg-help");
        const helpRows = await app.count("#help-body tr");
        assert.ok(helpRows > 40, `help lists ${helpRows} rows`);
        assert.ok((await app.text("#help-body")).includes("Strg+J"));
        await app.press("Escape");
        await app.waitDialogClosed("dlg-help");

        // ── Shortcuts do not fire while typing in a field ────────────────────
        await app.click("#search-input");
        await app.press("b", { ctrl: true });
        assert.equal(await app.editorText(), "", "Ctrl+B in the search field must not change the page");

        // ── Ctrl+O opens the notebook manager: this notebook and the two actions ──
        await app.press("o", { ctrl: true });
        await app.waitDialog("dlg-notebooks");
        const switcher = await app.text("#dlg-notebooks");
        assert.ok(switcher.includes("Testnotizbuch") && switcher.includes("Ordner öffnen"), switcher);
        await app.press("Escape");
        await app.waitDialogClosed("dlg-notebooks");

        // ── Recently changed pages ───────────────────────────────────────────
        await app.openPalette();
        await app.type("zuletzt");
        await app.press("Enter");
        await app.waitFor("document.querySelector('#palette-title')?.textContent.includes('Zuletzt')");
        await app.waitFor("document.querySelector('#palette-list li')?.textContent.includes('Neue Testseite')");
        await app.press("Enter");
        await app.waitForPage("NeueTestseite");

        app.expectConsoleErrors();
    },
);
