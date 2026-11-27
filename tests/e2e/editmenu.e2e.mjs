// End-to-end check of the right-click menu in the text: our own menu instead of the web
// engine's, with undo, cut, copy, paste (read by the program, no permission question) and select all.

import assert from "node:assert/strict";
import { scenario } from "./scenario.mjs";

await scenario("editmenu", "own menu on right click, copy, cut, paste, undo, select all, search field", async (t) => {
    const app = await t.launch({ notebook: t.notebook() });
    await app.ready();

    const menuOpen = () => app.visible("#edit-menu");
    const rightClick = async (selector) => {
        await app.click(selector, { button: "right" });
        await app.waitFor("!document.getElementById('edit-menu').hidden");
    };
    const item = (name) => app.click(`#edit-menu [data-edit="${name}"]`);
    const enabled = (name) => app.evaluate(`!document.querySelector('#edit-menu [data-edit="${name}"]').disabled`);

    // The menu is ours: it is in the page, translated, and no text is selected yet.
    await rightClick(".cm-content");
    assert.ok(await menuOpen());
    assert.deepEqual(await app.texts("#edit-menu button"), ["Rückgängig", "Ausschneiden", "Kopieren", "Einfügen", "Alles auswählen"]);
    assert.equal(await enabled("copy"), false, "copy is offered without a selection");
    assert.equal(await enabled("cut"), false, "cut is offered without a selection");
    assert.equal(await enabled("paste"), true);

    // Select all, then copy puts the whole text on the clipboard.
    await item("selectAll");
    const text = await app.evaluate("window.__mumbin.getText()");
    await rightClick(".cm-content");
    assert.equal(await enabled("copy"), true);
    await item("copy");
    assert.ok(!(await menuOpen()), "the menu stayed open");

    // Paste replaces the selection with the clipboard text, which the program reads itself.
    await app.evaluate("navigator.clipboard.writeText('Aus der Zwischenablage')");
    await rightClick(".cm-content");
    await item("paste");
    await app.waitFor("window.__mumbin.getText() === 'Aus der Zwischenablage'");

    // Undo brings the text back; cut removes a selection.
    await rightClick(".cm-content");
    await item("undo");
    await app.waitFor("window.__mumbin.getText().length > 100");
    assert.equal(await app.evaluate("window.__mumbin.getText()"), text, "undo did not restore the text");
    await rightClick(".cm-content");
    await item("selectAll");
    await rightClick(".cm-content");
    await item("cut");
    await app.waitFor("window.__mumbin.getText() === ''");

    // A text field gets the same menu; pasting works there too (cut replaced the clipboard).
    await app.evaluate("navigator.clipboard.writeText('Aus der Zwischenablage')");
    await app.click("#search-input");
    await rightClick("#search-input");
    await item("paste");
    await app.waitFor("document.getElementById('search-input').value === 'Aus der Zwischenablage'");
});
