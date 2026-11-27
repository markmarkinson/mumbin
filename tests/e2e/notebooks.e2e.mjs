// End-to-end check of the notebook manager in the real exe, like Obsidian's vault list:
// the button in the sidebar names the open notebook, the manager lists every notebook that
// was used, marks the open one, shows a lock on notebooks protected by a passphrase, opens
// another one with a click, and drops one from the list without touching its folder.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isOpaqueName } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";
import { waitUntil } from "./wait.mjs";

const OPEN = "\u{1F513}";
const LOCKED = "\u{1F512}";

await scenario(
    "notebooks",
    "notebook button, manager list, open one marked, protected one locked, open by click, drop from list, gear menu, new notebook asks for a passphrase, encrypt page without vault",
    async (t) => {
        const plain = t.notebook();
        const secret = t.notebook();
        const profile = t.tempDir();
        const rows = (app) =>
            app.evaluate(`[...document.querySelectorAll('#notebooks-list .notebook-row')].map((row) => ({ text: row.querySelector('.notebook-text strong').textContent, lock: row.querySelector('.notebook-lock').textContent, current: row.classList.contains('current'), tag: row.querySelector('.notebook-tag').textContent }))`);
        const openManager = async (app) => {
            await app.click("#btn-notebook");
            await app.waitDialog("dlg-notebooks");
            await app.waitForCount("#notebooks-list .notebook-row", 2);
        };

        // The second notebook gets a vault, so it is "protected"; then it is left locked.
        let app = await t.launch({ notebook: secret, dataDir: profile });
        await app.call("vault_create", { passphrase: "ein langer geheimer Satz" });
        await app.close();

        // Open the other one: the sidebar button names it, and no lock is shown (no vault there).
        app = await t.launch({ notebook: plain, dataDir: profile });
        assert.ok((await app.text("#notebook-name"))?.length > 0);
        assert.ok(await app.visible("#btn-notebook"), "the notebook button is not shown");
        assert.ok(!(await app.visible("#notebook-lock")), "a notebook without a vault shows a lock");

        // The manager: both notebooks, the open one marked, the protected one with a lock.
        await openManager(app);
        const listed = await rows(app);
        const open = listed.find((row) => row.current);
        const locked = listed.find((row) => !row.current);
        assert.ok(open && open.lock === "" && open.tag === "geöffnet", JSON.stringify(listed));
        assert.ok(locked && locked.lock === LOCKED && locked.tag === "geschützt", JSON.stringify(listed));
        assert.ok(await app.evaluate("document.querySelector('#notebooks-list .notebook-row.current .notebook-open').disabled"), "the open notebook can be clicked again");
        assert.ok((await app.visible("#notebooks-open")) && (await app.visible("#notebooks-create")), "open/create buttons are missing");

        // A click on the protected notebook opens it; the lock is shown in the sidebar and in the bar.
        await app.click("#notebooks-list .notebook-row:not(.current) .notebook-open");
        await app.waitDialogClosed("dlg-notebooks");
        await app.waitFor(`document.querySelector('#notebook-name')?.textContent === ${JSON.stringify(locked.text)}`, { timeout: 15000 });
        // It asks for the passphrase by itself; cancelling leaves it locked.
        await app.waitUnlockDialog();
        await app.click("#vault-cancel");
        await app.waitDialogClosed("dlg-vault");
        await app.waitFor("!document.getElementById('notebook-lock').hidden");
        assert.equal(await app.text("#notebook-lock"), LOCKED, "a protected notebook is not shown as locked");
        assert.ok(await app.visible("#vault-badge"));
        // The right passphrase in the same dialog (from the badge) opens it: the lock in the sidebar opens too.
        await app.click("#vault-badge");
        await app.passphrase("ein langer geheimer Satz");
        await app.waitFor(`document.getElementById('notebook-lock').textContent === '${OPEN}'`, { timeout: 10000 });

        // Dropping a notebook from the list leaves its folder alone; the open one cannot be dropped.
        await openManager(app);
        assert.ok(await app.evaluate("document.querySelector('#notebooks-list .notebook-row.current .ghost').disabled"), "the open notebook can be removed from the list");
        await app.click("#notebooks-list .notebook-row:not(.current) .ghost");
        await app.waitForCount("#notebooks-list .notebook-row", 1);
        assert.ok(fs.existsSync(path.join(plain, "Home.txt")), "the folder of a dropped notebook was touched");
        await app.press("Escape");
        await app.waitDialogClosed("dlg-notebooks");

        // The gear menu offers the settings and the notebooks (the settings were hard to find).
        await app.click("#btn-menu");
        await app.waitFor("!document.getElementById('app-menu').hidden");
        const menu = await app.text("#app-menu");
        for (const word of ["Einstellungen", "Notizbücher", "Verschlüsselung", "Alle Befehle", "Über Mumbin"]) assert.ok(menu.includes(word), `${word} missing in the menu: ${menu}`);
        await app.click('#app-menu [data-command="settings.open"]');
        await app.waitDialog("dlg-settings");
        await app.press("Escape");
        await app.waitDialogClosed("dlg-settings");
        app.expectConsoleErrors();
        await app.close();

        // ── A new notebook asks for a passphrase right away (optional) ─────────────
        const createNamed = async (app, name) => {
            await app.createNotebook(name);
            await app.waitFor(`document.querySelector('#notebook-name')?.textContent === ${JSON.stringify(name)}`, { timeout: 15000 });
        };
        /** Some page file of the folder is stored encrypted. */
        const anySealed = (dir) => fs.readdirSync(dir).some((name) => name.endsWith(".txt") && fs.readFileSync(path.join(dir, name), "utf8").includes("Encrypted: swenc1"));

        // Without a password: the question is skipped, nothing is encrypted. The page menu still offers
        // "Encrypt page" (it was hidden before a vault existed) and asks for a passphrase first.
        const dirPlain = t.tempDir();
        app = await t.launch({ notebook: plain, dataDir: profile, env: { MUMBIN_E2E_PICK_DIR: dirPlain } });
        await createNamed(app, "Ohne Passwort");
        await app.waitDialog("dlg-vault", { timeout: 10000 });
        assert.ok((await app.text("#vault-title")).includes("Neues Notizbuch"), "the question for a new notebook has the wrong title");
        assert.equal(await app.text("#vault-cancel"), "Ohne Passwort");
        await app.click("#vault-cancel");
        await app.waitDialogClosed("dlg-vault");
        assert.ok(!fs.existsSync(path.join(dirPlain, ".securewiki-vault")), "a vault was made although the person said no");
        await app.waitFor("!document.getElementById('btn-page-menu').hidden");
        // An empty page that was never saved cannot be encrypted: it says so instead of doing nothing.
        await app.pageMenu("toggleEncrypted");
        await app.waitToast("noch leer", { timeout: 8000 });
        await app.click(".cm-content");
        await app.type("Nur fuer mich");
        await app.waitSaved();
        await app.click("#btn-page-menu");
        await app.waitFor("!document.querySelector('#page-menu').hidden");
        assert.ok(await app.visible("#page-menu [data-action='toggleEncrypted']"), "Encrypt page is not offered without a vault");
        await app.click("#page-menu [data-action='toggleEncrypted']");
        await app.passphrase("noch ein langer Satz", "noch ein langer Satz");
        await waitUntil(() => anySealed(dirPlain), { timeout: 10000, what: `an encrypted page in ${dirPlain}` });
        await app.close();

        // With a password: the vault is made and the first page is encrypted.
        const dirSealed = t.tempDir();
        app = await t.launch({ notebook: plain, dataDir: profile, env: { MUMBIN_E2E_PICK_DIR: dirSealed } });
        await createNamed(app, "Mit Passwort");
        await app.passphrase("ein dritter langer Satz", "ein dritter langer Satz");
        await app.waitFor("!document.getElementById('notebook-lock').hidden", { timeout: 15000 });
        assert.ok(fs.existsSync(path.join(dirSealed, ".securewiki-vault")), "no vault file for a protected new notebook");
        // What is written into the new notebook afterwards is encrypted on disk from the first save.
        await app.click(".cm-content");
        await app.type("Streng geheim");
        await app.waitSaved();
        // On disk no name is real: every file is a token, and the text is nowhere in the clear.
        const pageFileName = await waitUntil(() => fs.readdirSync(dirSealed).find((name) => name.endsWith(".txt")), { timeout: 10000, what: "a page file" });
        assert.ok(fs.readdirSync(dirSealed).every(isOpaqueName), `a file name is not opaque: ${fs.readdirSync(dirSealed).join(", ")}`);
        const pageText = fs.readFileSync(path.join(dirSealed, pageFileName), "utf8");
        assert.ok(pageText.includes("Encrypted: swenc2") && !pageText.includes("Streng geheim"), "the first page of a protected notebook is readable on disk");
        await app.close();

        // Opened again, the notebook is locked as a whole: no page names, only the lock.
        app = await t.launch({ notebook: dirSealed, dataDir: profile, ready: "shell" });
        await app.waitUnlockDialog();
        await app.click("#vault-cancel");
        await app.waitDialogClosed("dlg-vault");
        assert.ok(await app.visible("#locked-panel"), "a locked notebook shows no lock");
        assert.ok((await app.text("#locked-panel")).includes("Notizbuch ist gesperrt"), await app.text("#locked-panel"));
        assert.equal(await app.count("#tree .tree-row"), 0, "page names are shown while locked");
        assert.equal(await app.evaluate("document.querySelector('#toast') && !document.querySelector('#toast').hidden"), false, "locking made an error message");
        // The right passphrase opens everything again, with the real names.
        await app.click("#locked-open");
        await app.passphrase("ein dritter langer Satz");
        await app.waitFor("document.querySelectorAll('#tree .tree-row').length > 0", { timeout: 15000 });
        await app.waitFor("window.__mumbin.getText().includes('Streng geheim')", { timeout: 15000 });
        assert.ok(!(await app.visible("#locked-panel")));
        // Locking by hand puts the lock back.
        await app.click("#vault-badge");
        await app.waitFor("document.querySelectorAll('#tree .tree-row').length === 0 && !document.getElementById('locked-panel').hidden", { timeout: 15000 });
        await app.close();

        // ── A new installation: a fresh program profile, the same folder, only the passphrase needed ──
        app = await t.launch({ notebook: secret, dataDir: t.tempDir(), ready: "shell" });
        await app.waitUnlockDialog();
        await app.passphrase("ein langer geheimer Satz");
        await app.waitFor(`document.getElementById('notebook-lock').textContent === '${OPEN}'`, { timeout: 15000 });
    },
);
