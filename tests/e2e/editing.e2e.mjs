// End-to-end check of everyday editing in the real exe: going back and forward,
// lists that continue and end, indenting, and the formatting bar acting on
// the selection.

import assert from "node:assert/strict";
import { scenario } from "./scenario.mjs";

await scenario("editing", "back and forward, list continues/indents/ends, formatting bar", async (t) => {
    const app = await t.launch({ notebook: t.notebook() });

    // ── Back and forward ─────────────────────────────────────────────────
    await app.jump("Zweite", "ZweiteSeite");
    await app.back();
    await app.waitForPage("Home");
    await app.press("ArrowRight", { alt: true });
    await app.waitForPage("ZweiteSeite");

    // ── A list continues on Enter, indents with Tab, and ends on an empty item ──
    await app.toEnd();
    await app.press("Enter");
    await app.press("Enter");
    await app.type("* eins");
    await app.press("Enter");
    await app.type("zwei");
    await app.press("Enter");
    await app.press("Tab");
    await app.type("tief");
    let now = await app.editorText();
    assert.ok(now.includes("* eins\n* zwei\n\t* tief"), `list: ${JSON.stringify(now.slice(-40))}`);
    await app.press("Enter");
    assert.ok((await app.editorText()).endsWith("\t* tief\n\t* "), "the list does not continue at the same depth");
    await app.press("Enter"); // an empty item ends the list at this depth
    now = await app.editorText();
    assert.ok(!now.endsWith("\t* \n\t* "), "Enter on an empty item kept the list");
    await app.press("Enter");
    await app.press("Enter");

    // ── The formatting bar works on the selection ────────────────────────
    await app.type("wichtig");
    await app.press("ArrowLeft", { ctrl: true, shift: true });
    await app.click('#format-bar [data-command="format.bold"]');
    assert.ok((await app.editorText()).includes("**wichtig**"), `bold: ${JSON.stringify((await app.editorText()).slice(-30))}`);
    await app.click('#format-bar [data-command="format.heading2"]');
    assert.ok((await app.editorText()).includes("== **wichtig** =="), `heading: ${JSON.stringify((await app.editorText()).slice(-40))}`);
});
