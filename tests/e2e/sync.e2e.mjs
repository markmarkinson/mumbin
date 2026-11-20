// End-to-end check that the window picks up changes made outside the program
// when it gets the focus back: a new page, a new attachment, a page rewritten
// by another program, and that typing that is not saved yet is never replaced.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pageText } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";
import { sleep } from "./wait.mjs";

await scenario("sync", "new page, new attachment and rewritten page picked up on focus; unsaved typing kept", async (t) => {
    const notebook = t.notebook();
    const app = await t.launch({ notebook });
    const file = (...parts) => path.join(notebook, ...parts);

    /** What the operating system does when the person comes back to the window. */
    const comeBack = async () => {
        await sleep(1100); // the window does not look again within a second
        await app.evaluate("window.dispatchEvent(new Event('focus')); 0");
    };

    await app.waitFor("window.__mumbin.getText().includes('Testnotizbuch')");
    await app.openDock("attachments");

    // Another program adds a page, an attachment and rewrites the open page.
    fs.writeFileSync(file("Von_aussen.txt"), pageText(["====== Von aussen ======", "Neu angelegt", ""], "\n"));
    fs.writeFileSync(file("Home", "extern.pdf"), "pdf");
    fs.appendFileSync(file("Home.txt"), "\nExtern geaendert\n");
    await comeBack();
    await app.waitFor("[...document.querySelectorAll('#tree .tree-row')].some((e) => e.textContent.includes('Von aussen'))", { timeout: 8000 });
    await app.waitFor("[...document.querySelectorAll('#attach-list .attach')].some((e) => e.dataset.name === 'extern.pdf')", { timeout: 8000 });
    await app.waitFor("window.__mumbin.getText().includes('Extern geaendert')", { timeout: 8000 });

    // A deleted clean page must not remain visible as if it still existed.
    const original = fs.readFileSync(file("Home.txt"));
    fs.unlinkSync(file("Home.txt"));
    await comeBack();
    await app.waitFor("window.__mumbin.getText() === ''");
    fs.writeFileSync(file("Home.txt"), original);
    await comeBack();
    await app.waitFor("window.__mumbin.getText().includes('Extern geaendert')");

    // A page deleted by another program disappears from the window too, as long as nothing was typed into it.
    await app.click('#tree .tree-row[data-page="Zweite Seite"]');
    await app.waitFor("window.__mumbin.getText().includes('Testseite')");
    fs.rmSync(file("Zweite_Seite.txt"));
    await comeBack();
    await app.waitFor("window.__mumbin.getText() === ''", { timeout: 8000 });
    assert.ok(!fs.existsSync(file("Zweite_Seite.txt")), "the window wrote the deleted page back");
    await app.click('#tree .tree-row[data-page="Home"]');
    await app.waitFor("window.__mumbin.getText().includes('Extern geaendert')");

    // Typing that is not saved yet stays, and the other program's text stays on disk.
    await app.toEnd();
    await app.type("meine Zeile");
    fs.appendFileSync(file("Home.txt"), "Noch eine fremde Zeile\n");
    await comeBack();
    await sleep(500);
    const mine = await app.editorText();
    assert.ok(mine.includes("meine Zeile") && !mine.includes("Noch eine fremde Zeile"), "typing that was not saved yet was replaced");
    assert.ok(fs.readFileSync(file("Home.txt"), "utf8").includes("Noch eine fremde Zeile"), "the other program's text was lost on disk");
});
