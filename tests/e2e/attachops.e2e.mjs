// End-to-end check of renaming and deleting an attachment in the real exe:
// the links on the page follow a rename, refusals are shown, delete asks first
// and takes only the chosen file.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { writePage } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";

const PAGE = "Anhangtest";

await scenario("attachops", "rename with links, refusals, delete asks first", async (t) => {
    const notebook = t.notebook();
    const folder = path.join(notebook, PAGE);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "foto.png"), Buffer.from("png"));
    fs.writeFileSync(path.join(folder, "bleibt.txt"), "kein Seitenkopf");
    writePage(notebook, PAGE, [`====== ${PAGE} ======`, "Bild [[./foto.png|das Foto]] und [[./bleibt.txt]]", ""], "\n");
    const app = await t.launch({ notebook });

    const names = () => app.data("#attach-list .attach", "name");
    const pageText = () => fs.readFileSync(path.join(notebook, `${PAGE}.txt`), "utf8");

    async function openRename(file) {
        await app.click(`#attach-list .attach[data-name="${file}"] .attach-rename`);
        await app.waitDialog("dlg-attach-rename");
        // The field takes the focus a moment after the dialog opens; typing before that goes nowhere.
        await app.waitFor("document.activeElement?.id === 'dlg-attach-rename-input'");
    }
    async function submitName(text) {
        await app.press("a", { ctrl: true });
        await app.type(text);
        await app.press("Enter");
    }

    await app.jump(PAGE, PAGE, PAGE);
    await app.openDock("attachments");
    await app.waitForCount("#attach-list .attach", 2);

    // ── Rename: the file, the list and the links on the page follow ─────
    await openRename("foto.png");
    assert.equal(await app.evaluate("document.getElementById('dlg-attach-rename-input').value"), "foto.png");
    await submitName("Urlaub 1.png");
    await app.waitDialogClosed("dlg-attach-rename");
    await app.waitFor("[...document.querySelectorAll('#attach-list .attach')].some((e) => e.dataset.name === 'Urlaub 1.png')");
    assert.deepEqual(await names(), ["bleibt.txt", "Urlaub 1.png"]);
    assert.ok(fs.existsSync(path.join(folder, "Urlaub 1.png")) && !fs.existsSync(path.join(folder, "foto.png")));
    assert.ok(pageText().includes("[[./Urlaub 1.png|das Foto]]") && pageText().includes("[[./bleibt.txt]]"), pageText());
    await app.waitToast("Urlaub 1.png");
    await app.waitFor("window.__mumbin.getText().includes('Urlaub 1.png')");

    // ── Refusals are said in words and change nothing ───────────────────
    await openRename("bleibt.txt");
    await submitName("Urlaub 1.png");
    await app.waitToast("gibt es schon");
    assert.ok(fs.existsSync(path.join(folder, "bleibt.txt")), "a refused rename lost the file");
    await openRename("bleibt.txt");
    await submitName("..\\aus.txt");
    await app.waitToast("nicht m");
    assert.ok(!fs.existsSync(path.join(notebook, "aus.txt")) && fs.existsSync(path.join(folder, "bleibt.txt")));

    // ── Delete: asks first, then takes only that file ───────────────────
    await app.click('#attach-list .attach[data-name="bleibt.txt"] .attach-delete');
    await app.waitDialog("dlg-attach-delete");
    assert.ok((await app.text("#dlg-attach-delete-text")).includes("bleibt.txt"));
    await app.click("#dlg-attach-delete-cancel");
    await app.waitDialogClosed("dlg-attach-delete");
    assert.ok(fs.existsSync(path.join(folder, "bleibt.txt")), "cancel still deleted the file");

    await app.click('#attach-list .attach[data-name="bleibt.txt"] .attach-delete');
    await app.waitDialog("dlg-attach-delete");
    await app.click("#dlg-attach-delete-confirm");
    await app.waitForCount("#attach-list .attach", 1);
    assert.ok(!fs.existsSync(path.join(folder, "bleibt.txt")), "the file is still there");
    assert.ok(fs.existsSync(path.join(folder, "Urlaub 1.png")) && fs.existsSync(path.join(notebook, `${PAGE}.txt`)), "something else was deleted");

    // The two refused renames are the only errors the window logs.
    app.expectConsoleErrors(2);
});
