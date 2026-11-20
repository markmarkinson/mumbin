// End-to-end check of encryption in the real exe: setting up the vault, encrypting
// a page (nothing readable on disk), locking (no text, no writes), a wrong and the
// right passphrase, typing into an encrypted page, a restart that comes back
// locked, and the Python tool that gets the notes back without the program.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";

const PASSPHRASE = "ein langer geheimer Satz";

await scenario(
    "vault",
    "vault set up, page encrypted, lock refuses text and writes, wrong/right passphrase, restart locked, python tool",
    async (t) => {
        const notebook = t.notebook();
        const toolDir = t.tempDir();
        const options = { notebook, dataDir: t.tempDir(), env: { MUMBIN_E2E_EXPORT_DIR: toolDir } };
        const pageFile = path.join(notebook, "Zweite_Seite.txt");
        const rowMark = (app) => app.evaluate("getComputedStyle(document.querySelector('#tree .tree-row[data-page=\"Zweite Seite\"]'), '::after').content");
        const openCryptoDialog = async (app) => {
            await app.command("Verschlüsselung verwalten");
            await app.waitDialog("dlg-crypto");
        };

        let app = await t.launch(options);

        // ── Set up ───────────────────────────────────────────────────────────
        await openCryptoDialog(app);
        assert.ok((await app.visible("#vault-act-create")) && !(await app.visible("#vault-act-lock")), "a notebook without a vault offers to set it up");
        await app.click("#vault-act-create");
        // Too short and not the same: refused in the dialog, nothing is created.
        await app.passphrase("kurz", "kurz");
        await app.waitFor("!document.getElementById('vault-error').hidden");
        assert.ok(!fs.existsSync(path.join(notebook, ".securewiki-vault")), "a too short passphrase made a vault");
        await app.press("Escape");
        await app.waitDialogClosed("dlg-vault");
        await app.click("#vault-act-create");
        await app.passphrase(PASSPHRASE, PASSPHRASE);
        await app.waitToast("eingerichtet", { timeout: 8000 });
        assert.ok(fs.existsSync(path.join(notebook, ".securewiki-vault")));
        await app.waitFor("!document.getElementById('vault-badge').hidden");

        // ── The recovery tool is offered right here ──────────────────────────
        await app.click("#vault-act-tool");
        await app.waitToast("mumbin_decrypt.py", { timeout: 8000 });
        const tool = path.join(toolDir, "mumbin_decrypt.py");
        assert.ok(fs.readFileSync(tool, "utf8").startsWith("#!/usr/bin/env python3"));
        await app.press("Escape");
        await app.waitDialogClosed("dlg-crypto");

        // ── Encrypt one page from its menu ───────────────────────────────────
        await app.jump("Zweite", "ZweiteSeite");
        assert.ok(fs.readFileSync(pageFile, "utf8").includes("Eine Testseite"));
        // A picture on the page, stored the way a paste stores it.
        await app.call("attachment_store", { name: "Zweite Seite", fileName: "geheim.png", data: [...PNG] });
        const attachment = path.join(notebook, "Zweite_Seite", "geheim.png");
        assert.ok(fs.existsSync(attachment), "setup: the picture should be there in the clear");
        await app.pageMenu("toggleEncrypted");
        await app.waitToast("verschlüsselt", { timeout: 8000 });
        let onDisk = fs.readFileSync(pageFile, "utf8");
        assert.ok(onDisk.includes("Encrypted: swenc1") && !onDisk.includes("Testseite"), `plain text on disk: ${onDisk}`);
        assert.ok((await app.editorText()).includes("Eine Testseite"), "the open vault hides the text from its owner");
        await app.waitFor("document.querySelector('#tree .tree-row[data-page=\"Zweite Seite\"]')?.classList.contains('sealed')");
        // While the vault is open the mark of an encrypted page is an open lock.
        assert.equal(await rowMark(app), '"\u{1F513}"', "an encrypted page of an open vault does not show an open lock");
        // The files next to the page were sealed with it, and still show in the list.
        assert.ok(!fs.existsSync(attachment) && fs.existsSync(`${attachment}.swenc`), "the picture was not sealed with its page");
        assert.ok(!fs.readFileSync(`${attachment}.swenc`).includes(PNG.subarray(0, 12)), "the sealed picture holds the plain bytes");
        await app.openDock("attachments");
        await app.waitFor("[...document.querySelectorAll('#attach-list .attach-name')].some((e) => e.textContent.includes('geheim.png') && e.textContent.includes('\u{1F512}'))");
        const shown = await app.invoke("picture_read", { page: "Zweite Seite", src: "./geheim.png" });
        assert.ok(shown.ok, "an open vault must show the sealed picture");
        assert.deepEqual(shown.value, [...PNG]);

        // Typing keeps it encrypted.
        await app.toEnd();
        await app.type(" Nachtrag");
        await app.waitSaved();
        onDisk = fs.readFileSync(pageFile, "utf8");
        assert.ok(onDisk.includes("Encrypted: swenc1") && !onDisk.includes("Nachtrag"), "an edit of an encrypted page reached the disk in the clear");

        // ── Lock: no text, no way to write ───────────────────────────────────
        await app.evaluate(`(() => {
            document.getElementById('search-input').value = 'Nachtrag';
            document.getElementById('search-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        })()`);
        await app.waitFor("document.getElementById('search-results').textContent.includes('Nachtrag')");
        const sealed = fs.readFileSync(pageFile, "utf8");
        await app.click("#vault-badge");
        await app.waitFor("!document.getElementById('locked-panel').hidden", { timeout: 8000 });
        assert.equal(await app.editorText(), "", "the text is still in the editor after locking");
        assert.ok(!(await app.text("#search-results")).includes("Nachtrag"), "decrypted search previews survive locking");
        assert.ok(!(await app.visible(".cm-editor")), "the editor is shown on a locked page");
        const refused = await app.invoke("page_save", { name: "Zweite Seite", body: "ueberschrieben", stamp: null, force: true });
        assert.equal(refused.code, "locked");
        assert.equal(fs.readFileSync(pageFile, "utf8"), sealed, "a locked page was changed");
        const hidden = await app.invoke("picture_read", { page: "Zweite Seite", src: "./geheim.png" });
        assert.ok(!hidden.ok && hidden.code === "locked", "a locked vault showed a sealed picture");
        const added = await app.invoke("attachment_store", { name: "Zweite Seite", fileName: "neu.png", data: [1, 2, 3] });
        assert.equal(added.code, "locked", "a file was added to a locked encrypted page");
        assert.ok(!fs.existsSync(path.join(notebook, "Zweite_Seite", "neu.png")), "a plain file was written next to an encrypted page");

        // ── Wrong passphrase, then the right one ─────────────────────────────
        await app.click("#locked-open");
        await app.passphrase("falsche Passphrase");
        await app.waitToast("stimmt nicht", { timeout: 8000 });
        assert.ok(!(await app.evaluate("document.getElementById('locked-panel').hidden")), "a wrong passphrase opened the page");
        await app.click("#locked-open");
        await app.passphrase(PASSPHRASE);
        await app.waitToast("Entsperrt", { timeout: 8000 });
        await app.waitFor("document.getElementById('locked-panel').hidden === true", { timeout: 8000 });
        assert.ok((await app.editorText()).includes("Nachtrag"));

        // ── The vault closes by itself after a pause (in the tests a "minute" is a second) ──
        await openCryptoDialog(app);
        await app.setValue("#vault-autolock", "1", "change");
        await app.press("Escape");
        await app.waitFor("document.getElementById('locked-panel').hidden === false", { timeout: 8000 });
        assert.equal(await rowMark(app), '"\u{1F512}"', "a closed vault does not show a closed lock");
        assert.equal(await app.editorText(), "", "the text stayed after the automatic lock");
        assert.equal(fs.readFileSync(pageFile, "utf8").includes("Nachtrag"), false);

        // ── A restart comes back locked ──────────────────────────────────────
        await app.quit();
        app = await t.launch(options);
        // A protected notebook asks for its passphrase by itself: a wrong one asks again, cancelling leaves it locked.
        await app.waitUnlockDialog({ timeout: 10000 });
        await app.passphrase("falsche Passphrase");
        await app.waitToast("stimmt nicht", { timeout: 8000 });
        await app.waitDialog("dlg-vault", { timeout: 8000 });
        await app.click("#vault-cancel");
        await app.waitDialogClosed("dlg-vault");
        await app.jump("Zweite", "ZweiteSeite");
        await app.waitFor("document.getElementById('locked-panel').hidden === false", { timeout: 8000 });

        // ── The Python tool gets the notes back without the program ──────────
        const python = ["python", "python3", "py"].find((name) => spawnSync(name, ["-c", "import nacl.bindings"]).status === 0);
        if (python) {
            const out = path.join(toolDir, "offen");
            const run = spawnSync(python, [tool, notebook, "--out", out], { env: { ...process.env, MUMBIN_PASSPHRASE: PASSPHRASE }, encoding: "utf8" });
            assert.equal(run.status, 0, run.stdout + run.stderr);
            const text = fs.readFileSync(path.join(out, "Zweite_Seite.txt"), "utf8");
            assert.ok(text.includes("Eine Testseite") && text.includes("Nachtrag") && !text.includes("Encrypted"), text);
            assert.deepEqual(fs.readFileSync(path.join(out, "Zweite_Seite", "geheim.png")), PNG, "the picture did not come back byte for byte");
        } else {
            console.log("note: Python with PyNaCl not found, tool check skipped");
        }
    },
);
