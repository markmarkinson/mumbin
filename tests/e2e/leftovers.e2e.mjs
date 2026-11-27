// End-to-end check: what a feature the program no longer has left behind is removed.
// A notebook file with a [Journal] section loses it when opened; the stored preference
// "showJournal" is gone after the start, the other preferences stay.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { scenario } from "./scenario.mjs";

await scenario("leftovers", "journal section and preference removed, the rest kept", async (t) => {
    const notebook = t.notebook();
    const configFile = path.join(notebook, "notebook.mumbin");
    fs.appendFileSync(configFile, "\r\n[Journal]\r\nnamespace=Tagebuch\r\ngranularity=month\r\n");
    const profile = t.tempDir();
    fs.writeFileSync(path.join(profile, "settings.json"), JSON.stringify({ preferences: { showJournal: true, fontSize: 17 } }));
    assert.ok(fs.readFileSync(configFile, "utf8").includes("[Journal]"));

    await t.launch({ notebook, dataDir: profile });

    const config = fs.readFileSync(configFile, "utf8");
    assert.ok(!config.includes("Journal") && !config.includes("Tagebuch"), `the journal section is still in the notebook file:\n${config}`);
    assert.ok(config.includes("[Notebook]"), "the notebook section was lost");
    const settings = JSON.parse(fs.readFileSync(path.join(profile, "settings.json"), "utf8"));
    assert.equal(settings.preferences.showJournal, undefined, "the journal preference is still stored");
    assert.equal(settings.preferences.fontSize, 17, "another preference was lost");
});
