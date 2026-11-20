// End-to-end check of pages with a password of their own in the real exe: two pages with two
// passwords (no vault), nothing readable on disk, locking one page, a wrong and another page's
// password refused, the right one opens only its page, a picture sealed with its page, search and
// tasks without locked text, auto-lock, a restart that comes back locked, rename of an open page,
// changing and removing a password, the vault next to it that never touches such pages, and the
// Python tool that opens them without the program.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";
import { waitUntil } from "./wait.mjs";

const ONE = "erstes langes Seitenpasswort";
const TWO = "zweites ganz anderes Seitenpasswort";
const NEW_ONE = "neues drittes Seitenpasswort heute";
/** The entries of the page menu that are about protection. */
const PROTECTION = ["toggleEncrypted", "protectPage", "changePagePassword", "removePageProtection", "lockPage"];
const OPEN_LOCK = '"\u{1F513}"';
const CLOSED_LOCK = '"\u{1F512}"';

await scenario(
    "pagepw",
    "two pages with two passwords, lock, wrong/other/right password, picture, search, auto-lock, restart, rename, change, remove, vault apart, python tool",
    async (t) => {
        const notebook = t.notebook();
        const toolDir = t.tempDir();
        const options = { notebook, dataDir: t.tempDir(), env: { MUMBIN_E2E_EXPORT_DIR: toolDir } };
        const fileOne = path.join(notebook, "Zweite_Seite.txt");
        const fileTwo = path.join(notebook, "Projekte", "Garten.txt");
        const row = (name) => `document.querySelector('#tree .tree-row[data-page="${name}"]')`;
        const mark = (app, name) => app.evaluate(`getComputedStyle(${row(name)}, '::after').content`);
        const classes = (app, name) => app.evaluate(`[...${row(name)}.classList]`);
        const ownPages = async (app) => Object.fromEntries((await app.call("page_passwords_list")).map((page) => [page.name, page.unlocked]));
        const lockedPanel = (app) => app.waitFor("document.getElementById('locked-panel').hidden === false", { timeout: 8000 });
        const menuEntries = async (app) => {
            await app.click("#btn-page-menu");
            await app.waitFor("!document.querySelector('#page-menu')?.hidden");
            const shown = await app.evaluate("[...document.querySelectorAll('#page-menu [data-action]')].filter((e) => !e.hidden).map((e) => e.dataset.action)");
            await app.press("Escape");
            return shown.filter((action) => PROTECTION.includes(action));
        };
        /** The dialog was shown again with the message that the password was wrong. */
        const waitWrong = async (app) => {
            await app.waitFor("document.getElementById('dlg-vault').open && !document.getElementById('vault-error').hidden", { timeout: 8000 });
            assert.ok((await app.text("#vault-error")).includes("stimmt nicht"), "the dialog does not say that the password is wrong");
        };
        /** Draws the branch of a page that was opened by name, so that its row can be looked at. */
        const showBranch = async (app, parent) => {
            const toggle = `.tree-row[data-page="${parent}"] .tree-toggle`;
            await app.click(toggle);
            await app.click(toggle);
            await app.waitFor(`document.querySelector('.tree-row[data-page="${parent}"]').closest('.tree-item').querySelector('.tree-group') !== null`);
        };
        const python = ["python", "python3", "py"].find((name) => spawnSync(name, ["-c", "import nacl.bindings"]).status === 0);
        const runTool = (out, password) =>
            spawnSync(python, [path.join(toolDir, "mumbin_decrypt.py"), notebook, "--out", out, "--no-prompt"], {
                env: { ...process.env, MUMBIN_PAGE_PASSWORD: password, MUMBIN_PASSPHRASE: "" },
                encoding: "utf8",
            });

        let app = await t.launch(options);

        // ── A page gets a password of its own: no vault is needed ─────────────
        assert.ok(!fs.existsSync(path.join(notebook, ".securewiki-vault")), "setup: the notebook has no vault");
        await app.jump("Zweite", "ZweiteSeite");
        await app.call("attachment_store", { name: "Zweite Seite", fileName: "geheim.png", data: [...PNG] });
        const attachment = path.join(notebook, "Zweite_Seite", "geheim.png");
        assert.deepEqual(await menuEntries(app), ["toggleEncrypted", "protectPage"], "a plain page offers the vault and its own password");
        await app.pageMenu("protectPage");
        await app.waitDialog("dlg-vault");
        assert.ok((await app.text("#vault-title")).includes("eigenem Passwort"), "the dialog does not say that this is a password for the page");
        assert.ok((await app.text("#vault-warning")).includes("dieser Seite"), "the warning does not speak about this page");
        // Too short: refused in the dialog, nothing is written.
        await app.passphrase("kurz", "kurz");
        await app.waitFor("!document.getElementById('vault-error').hidden");
        assert.ok(!fs.readFileSync(fileOne, "utf8").includes("Encrypted"), "a too short password protected the page");
        await app.press("Escape");
        await app.waitDialogClosed("dlg-vault");
        await app.pageMenu("protectPage");
        await app.passphrase(ONE, ONE);
        await app.waitToast("eigenem Passwort geschützt", { timeout: 8000 });
        let onDisk = fs.readFileSync(fileOne, "utf8");
        assert.ok(onDisk.includes("Encrypted: swenc3") && !onDisk.includes("Testseite"), `plain text on disk: ${onDisk}`);
        assert.ok(!fs.existsSync(path.join(notebook, ".securewiki-vault")), "protecting a page made a vault");
        assert.ok((await app.editorText()).includes("Eine Testseite"), "the person who entered the password sees the text");
        assert.ok(!fs.existsSync(attachment) && fs.readFileSync(`${attachment}.swenc`).subarray(0, 8).equals(Buffer.from("SWENC3F\0")), "the picture was not sealed with the key of its page");
        assert.ok((await classes(app, "Zweite Seite")).includes("sealed"), "the page has no lock mark");
        assert.equal(await mark(app, "Zweite Seite"), OPEN_LOCK);
        assert.deepEqual(await menuEntries(app), ["changePagePassword", "removePageProtection", "lockPage"], "a protected page offers its own entries only");

        // ── A second page, another password ───────────────────────────────────
        await app.jump("Garten", "Garten");
        await app.pageMenu("protectPage");
        await app.passphrase(TWO, TWO);
        // The toast of the first page may still be shown: the file is what tells.
        await waitUntil(() => fs.readFileSync(fileTwo, "utf8").includes("Encrypted: swenc3"), { timeout: 8000, what: "the second page to be protected" });
        assert.notEqual(fs.readFileSync(fileOne, "utf8").split("SWENC3")[1].slice(0, 40), fs.readFileSync(fileTwo, "utf8").split("SWENC3")[1].slice(0, 40), "two pages share a header");
        assert.deepEqual(await ownPages(app), { "Zweite Seite": true, "Projekte:Garten": true });

        // ── Lock one page: no text, no writes, no search hits, the other page stays open ──
        const hits = async () => JSON.stringify((await app.call("notebook_search", { query: "Tomaten" })).hits) + JSON.stringify(await app.call("tasks_list"));
        assert.ok((await hits()).includes("Tomaten"), "setup: the open page is found");
        await app.pageMenu("lockPage");
        await app.waitToast("gesperrt", { timeout: 8000 });
        await lockedPanel(app);
        assert.ok((await app.text("#locked-title")).includes("eigenes Passwort"), "the locked page does not say that it has its own password");
        assert.equal(await app.editorText(), "");
        assert.ok(!(await hits()).includes("Tomaten"), "the text of a locked page is found");
        assert.deepEqual(await ownPages(app), { "Zweite Seite": true, "Projekte:Garten": false });
        await showBranch(app, "Projekte");
        assert.equal(await mark(app, "Projekte:Garten"), CLOSED_LOCK);
        assert.equal(await mark(app, "Zweite Seite"), OPEN_LOCK, "locking one page closed the other");
        const sealed = fs.readFileSync(fileTwo, "utf8");
        const refused = await app.invoke("page_save", { name: "Projekte:Garten", body: "ueberschrieben", stamp: null, force: true });
        assert.equal(refused.code, "locked");
        assert.equal(fs.readFileSync(fileTwo, "utf8"), sealed, "a locked page was changed");
        assert.deepEqual(await menuEntries(app), ["changePagePassword", "removePageProtection"], "a locked page cannot be locked again");

        // ── The wrong password, the password of the other page, the right one ──
        await app.click("#locked-open");
        await app.passphrase("falsches Passwort");
        await waitWrong(app);
        await app.passphrase(ONE);
        await waitWrong(app);
        assert.ok(!(await app.evaluate("document.getElementById('locked-panel').hidden")), "a wrong password opened the page");
        await app.passphrase(TWO);
        await app.waitToast("entsperrt", { timeout: 8000 });
        await app.waitFor("document.getElementById('locked-panel').hidden === true", { timeout: 8000 });
        assert.ok((await app.editorText()).includes("Tomaten"));
        assert.ok((await hits()).includes("Tomaten"));
        assert.equal((await app.invoke("page_password_unlock", { name: "Projekte:Garten", password: ONE })).code, "wrong-passphrase");

        // ── The program locks the pages by itself after a pause ───────────────
        await app.command("Verschlüsselung verwalten");
        await app.waitDialog("dlg-crypto");
        assert.ok(await app.visible("#vault-autolock-row"), "the pause is not offered although pages have a password");
        await app.setValue("#vault-autolock", "1", "change");
        await app.press("Escape");
        await lockedPanel(app);
        assert.deepEqual(await ownPages(app), { "Zweite Seite": false, "Projekte:Garten": false });
        assert.equal(await app.editorText(), "");
        await app.command("Verschlüsselung verwalten");
        await app.waitDialog("dlg-crypto");
        await app.setValue("#vault-autolock", "0", "change");
        await app.press("Escape");
        await app.waitDialogClosed("dlg-crypto");

        // ── A restart comes back with both pages locked ───────────────────────
        await app.quit();
        app = await t.launch(options);
        assert.deepEqual(await ownPages(app), { "Zweite Seite": false, "Projekte:Garten": false });
        await app.jump("Zweite", "ZweiteSeite");
        await lockedPanel(app);
        assert.ok(!(await app.visible(".cm-editor")), "the editor is shown on a locked page");
        assert.equal(await mark(app, "Zweite Seite"), CLOSED_LOCK);
        await app.click("#locked-open");
        await app.passphrase(ONE);
        await app.waitToast("entsperrt", { timeout: 8000 });
        assert.ok((await app.editorText()).includes("Eine Testseite"));
        assert.deepEqual(await ownPages(app), { "Zweite Seite": true, "Projekte:Garten": false }, "the password of one page opened the other");
        const picture = await app.invoke("picture_read", { page: "Zweite Seite", src: "./geheim.png" });
        assert.ok(picture.ok && Buffer.from(picture.value).equals(PNG), "the picture of an open page was not shown");
        await app.openDock("attachments");
        await app.waitFor("[...document.querySelectorAll('#attach-list .attach-name')].some((e) => e.textContent.includes('geheim.png') && e.textContent.includes('\u{1F512}'))");

        // ── Renaming an open page keeps it open and keeps its files ───────────
        await app.renamePage("Zweite Seite Neu");
        await app.waitForPage("ZweiteSeiteNeu");
        assert.ok(fs.existsSync(path.join(notebook, "Zweite_Seite_Neu.txt")) && !fs.existsSync(fileOne));
        assert.ok(fs.existsSync(path.join(notebook, "Zweite_Seite_Neu", "geheim.png.swenc")));
        assert.ok((await app.editorText()).includes("Eine Testseite"), "the renamed page asked for its password again");
        await app.waitFor(`${row("Zweite Seite Neu")}?.classList.contains('open')`);
        assert.equal(await mark(app, "Zweite Seite Neu"), OPEN_LOCK);
        assert.equal((await app.invoke("picture_read", { page: "Zweite Seite Neu", src: "./geheim.png" })).ok, true);

        // ── Change the password: the old one stops working, the files follow ──
        await app.pageMenu("changePagePassword");
        await app.passphrase("falsches bisheriges Passwort", NEW_ONE, NEW_ONE);
        await waitWrong(app);
        await app.passphrase(ONE, NEW_ONE, NEW_ONE);
        await app.waitToast("wurde geändert", { timeout: 8000 });
        assert.equal((await app.invoke("page_password_unlock", { name: "Zweite Seite Neu", password: ONE })).code, "wrong-passphrase");
        assert.ok((await app.invoke("page_password_unlock", { name: "Zweite Seite Neu", password: NEW_ONE })).ok);
        assert.deepEqual((await app.invoke("picture_read", { page: "Zweite Seite Neu", src: "./geheim.png" })).value, [...PNG], "the picture was not sealed again with the new key");

        // ── The Python tool opens them with their passwords, without the program ──
        await app.call("decrypt_tool_save");
        if (python) {
            const out = path.join(toolDir, "offen");
            const run = runTool(out, NEW_ONE);
            assert.equal(run.status, 2, run.stdout + run.stderr);
            assert.ok(run.stderr.includes("Garten.txt"), "the page whose password was not given is not reported");
            const text = fs.readFileSync(path.join(out, "Zweite_Seite_Neu.txt"), "utf8");
            assert.ok(text.includes("Eine Testseite") && !text.includes("Encrypted"), text);
            assert.deepEqual(fs.readFileSync(path.join(out, "Zweite_Seite_Neu", "geheim.png")), PNG, "the picture did not come back byte for byte");
            assert.ok(!fs.existsSync(path.join(out, "Projekte", "Garten.txt")));
            const second = runTool(path.join(toolDir, "offen2"), TWO);
            assert.ok(fs.readFileSync(path.join(toolDir, "offen2", "Projekte", "Garten.txt"), "utf8").includes("Tomaten"), second.stderr);
        } else {
            console.log("note: Python with PyNaCl not found, tool check skipped");
        }

        // ── Take the protection off: page and picture are plain again ─────────
        await app.pageMenu("removePageProtection");
        await app.passphrase("falsches Passwort");
        await waitWrong(app);
        assert.ok(fs.readFileSync(path.join(notebook, "Zweite_Seite_Neu.txt"), "utf8").includes("swenc3"), "a wrong password took the protection off");
        await app.passphrase(NEW_ONE);
        await app.waitToast("entfernt", { timeout: 8000 });
        onDisk = fs.readFileSync(path.join(notebook, "Zweite_Seite_Neu.txt"), "utf8");
        assert.ok(onDisk.includes("Eine Testseite") && !onDisk.includes("Encrypted"), onDisk);
        assert.deepEqual(fs.readFileSync(path.join(notebook, "Zweite_Seite_Neu", "geheim.png")), PNG, "the picture is not plain again");
        assert.ok(!fs.existsSync(path.join(notebook, "Zweite_Seite_Neu", "geheim.png.swenc")));
        await app.waitFor(`!${row("Zweite Seite Neu")}.classList.contains('sealed')`);
        assert.deepEqual(await ownPages(app), { "Projekte:Garten": false });
        assert.ok((await menuEntries(app)).includes("protectPage"), "a plain page again offers both ways");

        // ── The vault next to a page with its own password never touches it ───
        const secondPage = fs.readFileSync(fileTwo);
        await app.call("vault_create", { passphrase: "ein langer geheimer Satz" });
        await app.call("page_set_encrypted", { name: "Projekte", encrypted: true });
        assert.deepEqual(await app.call("vault_pages"), ["Projekte"], "a page with its own password is listed as a page of the vault");
        const everything = await app.call("vault_convert_all", { encrypt: true });
        assert.deepEqual(everything.failed, [], "the page with its own password is reported as a failure");
        assert.ok(everything.changed > 3, "the other pages were not encrypted");
        assert.ok(fs.readFileSync(fileTwo).equals(secondPage), "'encrypt all' changed a page with its own password");
        assert.equal((await app.invoke("page_set_encrypted", { name: "Projekte:Garten", encrypted: true })).ok, false);
        await app.call("vault_convert_all", { encrypt: false });
        assert.ok(fs.readFileSync(fileTwo).equals(secondPage), "'decrypt all' changed a page with its own password");
        assert.equal((await app.invoke("page_set_encrypted", { name: "Projekte:Garten", encrypted: false })).ok, false);
        assert.ok((await app.invoke("page_read", { name: "Projekte:Garten" })).value.locked, "the vault opened a page with its own password");
        await app.call("page_password_unlock", { name: "Projekte:Garten", password: TWO });
        await app.call("vault_lock");
        assert.deepEqual(await ownPages(app), { "Projekte:Garten": true }, "locking the vault closed a page with its own password");
        assert.ok((await app.call("page_read", { name: "Projekte:Garten" })).body.includes("Tomaten"));
        await app.call("page_lock_all");
        assert.deepEqual(await ownPages(app), { "Projekte:Garten": false });
        app.expectConsoleErrors(0);
    },
);
