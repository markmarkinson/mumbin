// End-to-end check of the settings of a notebook and of page templates in the real exe:
// the built-in template, a page of the notebook as template (cursor placed), a refused
// name, a text that does not parse, and the two other switches of the notebook.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { writePage } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";

await scenario("templates", "built-in template, template page with cursor, refused name, plain text, trash switch, encryption switch, switched off", async (t) => {
    const notebook = t.notebook();
    const configFile = path.join(notebook, "notebook.mumbin");
    writePage(notebook, "Vorlage", ["# [% page.name %] ([% page.section %])", "[% IF page.section %]Unterseite[% END %]", "", "[% place_cursor() %]", "Ende", ""]);
    writePage(notebook, "Kaputt", ["[% IF %]kaputt", ""]);
    const app = await t.launch({ notebook });

    const openSettings = async () => {
        await app.press(",", { ctrl: true });
        await app.waitDialog("dlg-settings");
    };
    const closeSettings = async () => {
        await app.press("Escape");
        await app.waitDialogClosed("dlg-settings");
    };
    const chooseTemplate = async (name) => {
        await openSettings();
        await app.setValue("#set-template-page", name, "change");
        await app.sleep(300);
    };

    // The built-in template: title and date of creation.
    await app.jump("Erste Vorlage", "ErsteVorlage");
    assert.match(await app.editorText(), /^====== Erste Vorlage ======\nErstellt .+ \d{4}\n\n$/);

    // A page of the notebook as template, with the cursor where the page puts it.
    await chooseTemplate("Vorlage");
    assert.ok(fs.readFileSync(configFile, "utf8").includes("default_page_template=Vorlage"), "the template was not stored in the notebook file");
    assert.ok(await app.evaluate("document.querySelectorAll('#set-template-pages option').length >= 3"), "the page list is empty");
    await closeSettings();
    await app.jump("Projekte:Neu", "Neu");
    assert.equal(await app.editorText(), "# Projekte:Neu (Projekte)\nUnterseite\n\n\nEnde\n");
    await app.type("hier");
    assert.equal(await app.editorText(), "# Projekte:Neu (Projekte)\nUnterseite\n\nhier\nEnde\n", "the cursor was not where the template put it");

    // A page that does not exist is refused and the field goes back.
    await chooseTemplate("Gibtsnicht");
    assert.match(await app.waitToast(), /gibt es nicht|not exist|no such/i);
    assert.equal(await app.evaluate("document.getElementById('set-template-page').value"), "Vorlage");
    assert.ok(fs.readFileSync(configFile, "utf8").includes("default_page_template=Vorlage"));

    // A template that does not parse is used as plain text instead of blocking the page.
    await app.setValue("#set-template-page", "Kaputt", "change");
    await app.sleep(300);
    await closeSettings();
    await app.jump("Dritte Seite", "DritteSeite");
    assert.equal(await app.editorText(), "[% IF %]kaputt\n");

    // Empty again: the built-in template.
    await chooseTemplate("");
    await closeSettings();
    await app.jump("Vierte Seite", "VierteSeite");
    assert.match(await app.editorText(), /^====== Vierte Seite ======\nErstellt /);

    // The recycle bin switch is stored in the notebook file and back again.
    await openSettings();
    assert.equal(await app.evaluate("document.getElementById('set-trash').checked"), false);
    await app.click("#set-trash");
    await app.sleep(300);
    assert.ok(fs.readFileSync(configFile, "utf8").includes("disable_trash=True"), "the switch was not stored");
    await app.click("#set-trash");
    await app.sleep(300);
    assert.ok(fs.readFileSync(configFile, "utf8").includes("disable_trash=False"));

    // Without a vault the encryption switch is off and says why.
    assert.equal(await app.evaluate("document.getElementById('set-encrypt-new').disabled"), true);
    assert.ok(await app.visible("#set-encrypt-hint"));

    // With templates switched off, a plain new page is empty.
    await app.click("#set-template");
    await closeSettings();
    await app.jump("Sechste Seite", "SechsteSeite");
    assert.equal(await app.editorText(), "");
});
