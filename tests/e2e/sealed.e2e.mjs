// End-to-end check of a notebook that hides its file names, in the real exe: made with a
// passphrase from the start, pages and sub-pages, attachments (with pictures), search, move,
// delete and the lock. On disk nothing may carry a real name, and everything must still work
// through the program, also after a restart.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isOpaqueName, PNG } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";

const PASSPHRASE = "ein sehr langer geheimer Satz";

await scenario("sealed", "sealed notebook: no real name or word on disk, pages, pictures, search, move, delete, lock and unlock", async (t) => {
    const target = t.tempDir();
    const profile = t.tempDir();
    const names = (value) => value.map((entry) => entry.name);

    /** Every file and folder below the notebook, as paths relative to it. */
    const everything = () => {
        const found = [];
        const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                found.push(path.relative(target, full).replaceAll("\\", "/"));
                if (entry.isDirectory()) walk(full);
            }
        };
        walk(target);
        return found;
    };

    let app = await t.launch({ notebook: t.notebook(), dataDir: profile, env: { MUMBIN_E2E_PICK_DIR: target } });

    // A new notebook with a passphrase.
    await app.createNotebook("Tresorbuch");
    await app.passphrase(PASSPHRASE, PASSPHRASE);
    await app.waitFor("document.getElementById('notebook-lock').textContent === '\u{1F513}'", { timeout: 15000 });
    assert.ok((await app.call("vault_status")).sealed, "the notebook is not sealed");

    // Pages and sub-pages, written by the program.
    for (const [name, body] of [["Steuer 2026", "Geheime Zahlen\n"], ["Projekte:Garten:Beet", "Tomaten @gemuese\n"], ["Projekte", "Uebersicht\n"]]) {
        await app.call("page_save", { name, body, stamp: null, force: true });
    }
    // Attachments: stored sealed, listed by their real names, pictures load.
    assert.equal(await app.call("attachment_store", { name: "Projekte:Garten:Beet", fileName: "Foto vom Beet.png", data: [...PNG] }), "Foto vom Beet.png");
    const listed = await app.call("attachments_list", { name: "Projekte:Garten:Beet" });
    assert.deepEqual(listed.map((a) => [a.name, a.encrypted]), [["Foto vom Beet.png", true]]);
    assert.deepEqual(await app.call("picture_read", { page: "Projekte:Garten:Beet", src: "./Foto vom Beet.png" }), [...PNG]);

    // The tree, the search and the tags know the real names and words.
    assert.ok(names(await app.call("page_children", { parent: "" })).includes("Steuer 2026"));
    assert.ok(JSON.stringify(await app.call("notebook_search", { query: "Tomaten" })).includes("Beet"));
    assert.ok(JSON.stringify(await app.call("tags_list")).includes("gemuese"));

    // On disk: not one real name, not one readable word.
    const onDisk = everything();
    const listing = onDisk.join("\n").toLowerCase();
    for (const word of ["steuer", "2026", "projekte", "garten", "beet", "foto", "png", "geheime"]) {
        assert.ok(!listing.includes(word), `${word} is in a file name:\n${listing}`);
    }
    assert.ok(onDisk.every((relative) => isOpaqueName(relative.split("/").pop())), onDisk.join(", "));
    for (const relative of onDisk) {
        const full = path.join(target, relative);
        if (!fs.statSync(full).isFile() || relative.endsWith("notebook.mumbin")) continue;
        const bytes = fs.readFileSync(full);
        for (const word of ["Geheime Zahlen", "Tomaten", "Uebersicht", "Foto vom Beet"]) {
            assert.ok(!bytes.includes(Buffer.from(word)), `${word} is readable in ${relative}`);
        }
        assert.ok(!bytes.includes(PNG.subarray(0, 12)), `the picture is readable in ${relative}`);
    }

    // Move a page with its children and its picture; delete one.
    await app.call("page_move", { from: "Projekte:Garten", to: "Archiv:Wiese", updateLinks: true });
    assert.deepEqual(names(await app.call("attachments_list", { name: "Archiv:Wiese:Beet" })), ["Foto vom Beet.png"]);
    assert.ok(JSON.stringify(await app.call("notebook_search", { query: "Tomaten" })).includes("Wiese"));
    await app.call("page_delete", { name: "Steuer 2026", permanently: true });
    const left = names(await app.call("page_children", { parent: "" }));
    assert.ok(!left.includes("Steuer 2026") && left.includes("Archiv"), left.join(","));
    const afterMove = everything().join("\n").toLowerCase();
    for (const word of ["archiv", "wiese", "beet"]) assert.ok(!afterMove.includes(word), `${word} is in a file name after the move`);

    // The program goes away and comes back: locked, then the passphrase brings everything back.
    await app.close();
    app = await t.launch({ notebook: target, dataDir: profile, ready: "shell" });
    await app.waitUnlockDialog();
    await app.click("#vault-cancel");
    await app.waitDialogClosed("dlg-vault");
    assert.equal((await app.invoke("page_children", { parent: "" })).code, "locked", "a locked notebook listed its pages");
    assert.equal((await app.invoke("notebook_search", { query: "Tomaten" })).code, "locked");
    assert.equal(await app.count("#tree .tree-row"), 0);
    await app.click("#locked-open");
    await app.passphrase(PASSPHRASE);
    await app.waitFor("document.querySelectorAll('#tree .tree-row').length > 0", { timeout: 15000 });
    // In a notebook where everything is encrypted no row carries a lock (the notebook button shows it once).
    assert.equal(await app.count("#tree .tree-row.sealed"), 0, "rows of a sealed notebook carry a lock");
    assert.ok(names(await app.call("page_children", { parent: "" })).includes("Archiv"));
    assert.equal((await app.call("page_read", { name: "Archiv:Wiese:Beet" })).body, "Tomaten @gemuese\n");
    app.expectConsoleErrors();
});
