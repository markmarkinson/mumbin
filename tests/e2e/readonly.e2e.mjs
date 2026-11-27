// End-to-end check of read-only mode: the editor stays still, the program itself
// refuses every write whatever the page asks for, the mode is remembered over a
// restart, and switching it off allows editing again.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readPageFile } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";

await scenario("readonly", "editor still, writes refused by the program, remembered, off again", async (t) => {
    const notebook = t.notebook();
    const options = { notebook, dataDir: t.tempDir() };
    let app = await t.launch(options);
    const before = readPageFile(notebook, "Home");

    // Switch it on from the palette.
    await app.command("Nur lesen");
    await app.waitFor("!document.querySelector('#readonly-badge').hidden");

    // The editor does not take typing.
    const text = await app.editorText();
    await app.toEnd();
    await app.type("so nicht");
    assert.equal(await app.editorText(), text, "the editor took typing in read-only mode");

    // The program refuses writes of every kind, even when the page asks.
    const refused = [
        await app.invoke("page_save", { name: "Home", body: "ueberschrieben", stamp: null, force: true }),
        await app.invoke("page_save", { name: "Neu", body: "neue Seite", stamp: null, force: false }),
        await app.invoke("page_move", { from: "Zweite Seite", to: "Umbenannt", updateLinks: true }),
        await app.invoke("page_delete", { name: "Zweite Seite", permanently: true }),
        await app.invoke("attachment_store", { name: "Home", fileName: "x.png", data: [1, 2, 3] }),
        await app.invoke("attachment_delete", { name: "Home", file: "bild.png" }),
    ];
    for (const result of refused) assert.ok(!result.ok && result.code === "read-only", JSON.stringify(result));
    assert.equal(readPageFile(notebook, "Home"), before, "a page was changed in read-only mode");
    assert.ok(fs.existsSync(path.join(notebook, "Zweite_Seite.txt")), "a page was removed in read-only mode");
    assert.ok(!fs.existsSync(path.join(notebook, "Neu.txt")) && !fs.existsSync(path.join(notebook, "Umbenannt.txt")));

    // Reading still works, and the mode survives a restart.
    await app.call("page_read", { name: "Zweite Seite" });
    await app.quit();
    app = await t.launch(options);
    await app.waitFor("!document.querySelector('#readonly-badge').hidden", { timeout: 8000 });
    const afterRestart = await app.invoke("page_save", { name: "Home", body: "x", stamp: null, force: true });
    assert.equal(afterRestart.code, "read-only", "the shell was not told after the restart");

    // Switching it off allows editing again.
    await app.click("#readonly-badge");
    await app.waitFor("document.querySelector('#readonly-badge').hidden");
    await app.toEnd();
    await app.type("wieder moeglich");
    await app.waitFor("window.__mumbin.getText().includes('wieder moeglich')");
    await app.waitSaved();
    assert.ok(readPageFile(notebook, "Home").includes("wieder moeglich"));
});
