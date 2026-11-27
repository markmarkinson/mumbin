// End-to-end check of three small interface behaviours found while reviewing
// screenshots: search results can be closed (Esc or the cross) and never push
// the page tree out of the sidebar, the dock folds down to its tab row and
// remembers that across starts, and the help dialog shows its blocks in a grid.

import assert from "node:assert/strict";
import { scenario } from "./scenario.mjs";

await scenario("ui", "search results close, tree keeps its room, dock folds and is remembered, help grid", async (t) => {
    const options = { notebook: t.notebook(), dataDir: t.tempDir() };
    const dockFolded = (app) => app.evaluate("document.querySelector('#dock').classList.contains('folded')");
    const rectOf = (app, selector) =>
        app.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, width: r.width }; })()`);

    // ── A first start: the dock is folded down to its tabs; a click on a tab opens it ──
    let app = await t.launch({ ...options, unfoldDock: false });
    assert.ok(await dockFolded(app), "the dock is not folded on a first start");
    assert.ok(await app.visible('[data-dock="tags"]'), "the tabs must be visible while folded");
    assert.ok(!(await app.visible("#tag-cloud")), "a panel is shown while the dock is folded");
    await app.openDock("tags");
    await app.waitFor("!document.querySelector('#dock').classList.contains('folded')");
    assert.ok(await app.visible("#tag-cloud"), "the click on the tab did not show the panel");

    // ── There is no journal: no calendar tab, no "Today" button, no journal setting ──
    assert.ok(!(await app.evaluate("Boolean(document.querySelector('[data-dock=\"calendar\"], #btn-today, #set-journal-on'))")), "a journal control exists");
    await app.openPalette();
    await app.type("Heute");
    await app.sleep(400);
    assert.ok(!(await app.evaluate("[...document.querySelectorAll('#palette-list li')].some((li) => li.textContent.includes('Heute'))")), "a journal command is listed");
    await app.press("Escape");
    await app.command("einstell", "Einstellungen");
    await app.waitDialog("dlg-settings");
    await app.press("Escape");
    await app.waitDialogClosed("dlg-settings");

    // ── Search results: closable, and the page tree keeps its room ────────
    const search = async () => {
        await app.click("#search-input");
        await app.type("Garten");
        await app.press("Enter");
        await app.waitFor("!document.querySelector('#search-results')?.hidden && document.querySelectorAll('#search-results .search-hit').length > 0");
    };
    await search();
    assert.ok(await app.visible("#search-results .ghost"), "results have no close button");
    const tree = await rectOf(app, "#tree");
    assert.ok(tree.height >= 90, `the page tree is only ${tree.height}px high while results are shown`);
    const sidebar = await rectOf(app, "#sidebar");
    assert.ok(tree.bottom <= sidebar.bottom + 1, "the tree ran out of the sidebar");

    await app.press("Escape");
    await app.waitFor("document.querySelector('#search-results')?.hidden === true");
    assert.equal(await app.evaluate("document.querySelector('#search-input').value"), "", "Esc left the search text in the box");

    await search();
    await app.click("#search-results .ghost");
    await app.waitFor("document.querySelector('#search-results')?.hidden === true");

    // ── The dock folds down to its tabs, and a start remembers it ─────────
    assert.ok(await app.visible("#tag-cloud"), "setup: the panel should be open");
    await app.openDock("tags"); // a second click on the open tab
    await app.waitFor("document.querySelector('#dock').classList.contains('folded')");
    assert.ok(!(await app.visible("#tag-cloud")), "the panel is still shown while the dock is folded");
    assert.ok(await app.visible('[data-dock="tags"]'), "the tabs must stay when the dock is folded");
    const treeFolded = await rectOf(app, "#tree");
    assert.ok(treeFolded.height > tree.height, "folding the dock gave the page tree no more room");

    await app.openDock("tags"); // another tab opens it again
    await app.waitFor("!document.querySelector('#dock').classList.contains('folded')");
    assert.ok(await app.visible("#tag-cloud"), "the chosen panel is not shown");
    await app.openDock("tags");
    await app.waitFor("document.querySelector('#dock').classList.contains('folded')");
    await app.quit(); // the way a person leaves: close the window, not kill the process

    app = await t.launch(options);
    await app.waitFor("document.querySelector('#dock')?.classList.contains('folded') === true", { timeout: 8000 });
    await app.openDock("tags");
    await app.waitFor("!document.querySelector('#dock').classList.contains('folded')");

    // ── The help: blocks side by side, every block filled ─────────────────
    await app.press("F1");
    await app.waitDialog("dlg-help");
    const help = await app.evaluate(`(() => {
        const body = document.querySelector('.help-body');
        return {
            sections: body.querySelectorAll('section').length,
            empty: [...body.querySelectorAll('section')].filter((s) => s.querySelectorAll('tr').length === 0).length,
            columns: getComputedStyle(body).gridTemplateColumns.split(' ').length,
            titles: [...body.querySelectorAll('h3')].map((h) => h.textContent.length > 0),
        };
    })()`);
    assert.ok(help.sections >= 4, `only ${help.sections} help blocks`);
    assert.equal(help.empty, 0, "a help block is empty");
    assert.equal(help.columns, 2, "the help blocks are not in two columns");
    assert.ok(help.titles.every(Boolean), "a help block has no title");
    await app.press("Escape");
    await app.waitDialogClosed("dlg-help");
    assert.equal(await app.evaluate("document.activeElement?.closest('.cm-editor') !== null"), true, "the editor did not get the focus back");
});
