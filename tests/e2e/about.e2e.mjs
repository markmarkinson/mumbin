// End-to-end check of the about dialog (version, where the program keeps its
// files) and of the error log: an error the person sees leaves one line in
// mumbin.log next to the program's settings.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { scenario } from "./scenario.mjs";
import { waitUntil } from "./wait.mjs";

await scenario("about", "about dialog, error log line", async (t) => {
    const profile = t.tempDir();
    const app = await t.launch({ notebook: t.notebook(), dataDir: profile });

    await app.command("Über Mumbin");
    await app.waitDialog("dlg-about");
    await app.waitFor("document.getElementById('about-version').textContent !== ''");
    assert.match(await app.text("#about-version"), /^\d+\.\d+\.\d+$/);
    const data = await app.text("#about-data");
    assert.equal(path.resolve(data).toLowerCase(), path.resolve(profile).toLowerCase(), "the dialog shows another data folder");
    assert.ok((await app.text("#about-log")).endsWith("mumbin.log"));
    assert.ok((await app.text("#about-program")).toLowerCase().endsWith(".exe"));
    await app.click("#about-open-data"); // does nothing in the test hook, but must not fail
    await app.press("Escape");
    await app.waitDialogClosed("dlg-about");

    // An error that is shown to the person is also written to the log.
    await app.renamePage("Zweite Seite");
    await app.waitToast();
    const log = path.join(profile, "mumbin.log");
    await waitUntil(() => fs.existsSync(log), { timeout: 5000, what: "the log file" });
    const lines = fs.readFileSync(log, "utf8").trim().split("\n");
    assert.equal(lines.length, 1, lines.join("\n"));
    assert.match(lines[0], /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d page-exists: /);
});
