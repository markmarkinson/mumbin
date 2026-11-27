// End-to-end check of rename, move and delete in the real exe: files move on
// disk, links in other pages follow, drafts survive, mistakes are refused and
// deleting never touches the recycle bin of the machine running the test.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readPageFile } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";

await scenario("pageops", "rename, branch move, refusals, delete page and branch", async (t) => {
    // Deleting is permanent in this notebook, so the test leaves no trace in the recycle bin.
    const notebook = t.notebook({ disableTrash: true });
    const app = await t.launch({ notebook });
    const onDisk = (...parts) => path.join(notebook, ...parts);

    // ── Rename a page; an unsaved draft goes along ────────────────────────
    await app.clickText(".cm-content .wk-link", "der Garten");
    await app.waitForPage("Garten");
    await app.toEnd();
    await app.type("ENTWURF-VOR-UMBENENNEN\n");
    await app.renamePage("Projekte:Blumengarten");
    await app.waitForPage("Blumengarten", { timeout: 10000 });

    assert.ok(!fs.existsSync(onDisk("Projekte", "Garten.txt")), "old page file still exists");
    assert.ok(readPageFile(notebook, "Projekte:Blumengarten").includes("ENTWURF-VOR-UMBENENNEN"), "unsaved draft was lost");
    assert.match(readPageFile(notebook, "Home"), /\[\[Projekte:Blumengarten\|der Garten\]\]/, "link in Home was not updated");
    // From the parent page the shortest link to a child is the relative form.
    assert.match(readPageFile(notebook, "Projekte"), /\[\[(\+Blumengarten|Projekte:Blumengarten)\]\]/, "link in Projekte was not updated");
    const haus = readPageFile(notebook, "Projekte:Haus");
    assert.ok(haus.includes("Blumengarten") && !haus.includes("[[Garten]]"), `relative link in Haus not updated: ${haus}`);
    assert.ok(await app.visible('.tree-row[data-page="Projekte:Blumengarten"]'), "tree does not show the new name");
    assert.ok(!(await app.visible('.tree-row[data-page="Projekte:Garten"]')), "tree still shows the old name");

    // ── Move a branch with sub-pages ──────────────────────────────────────
    await app.openFromTree("Projekte");
    await app.renamePage("Arbeit");
    await app.waitForPage("Arbeit", { timeout: 10000 });
    assert.ok(fs.existsSync(onDisk("Arbeit.txt")) && fs.existsSync(onDisk("Arbeit", "Blumengarten.txt")), "branch not moved");
    assert.ok(!fs.existsSync(onDisk("Projekte")) && !fs.existsSync(onDisk("Projekte.txt")), "old branch left behind");
    assert.match(readPageFile(notebook, "Home"), /\[\[Arbeit:Blumengarten\|der Garten\]\]/, "Home link did not follow the branch");

    // History follows the rename: back goes to the renamed page, not to a ghost.
    await app.back();
    await app.waitForPage("Blumengarten");

    // Nothing so far may have logged an error. The refusals below log on purpose.
    app.expectConsoleErrors();

    // ── Refused: name taken, into itself ──────────────────────────────────
    const homeBefore = readPageFile(notebook, "Home");
    await app.renamePage("Zweite Seite");
    await app.waitToast(/gibt es schon|already exists/);
    assert.ok(fs.existsSync(onDisk("Arbeit", "Blumengarten.txt")), "refused rename moved the page anyway");
    assert.ok(readPageFile(notebook, "Zweite Seite").includes("Eine Testseite"), "target page was overwritten");

    await app.openFromTree("Arbeit");
    await app.renamePage("Arbeit:Blumengarten:Tief");
    await app.waitToast();
    assert.ok(fs.existsSync(onDisk("Arbeit.txt")) && fs.existsSync(onDisk("Arbeit", "Blumengarten.txt")), "move into itself changed files");
    assert.equal(readPageFile(notebook, "Home"), homeBefore, "refused move rewrote links");

    // ── Delete one page (confirmation names the damage) ───────────────────
    await app.openFromTree("Zweite Seite");
    await app.pageMenu("delete");
    await app.waitDialog("dlg-delete");
    assert.match(await app.text("#dlg-delete-text"), /endgültig|for good/, "permanent deletion not announced");
    await app.click("#dlg-delete-cancel");
    await app.waitDialogClosed("dlg-delete");
    assert.ok(fs.existsSync(onDisk("Zweite_Seite.txt")), "cancel still deleted the page");

    await app.pageMenu("delete");
    await app.waitDialog("dlg-delete");
    await app.click("#dlg-delete-confirm");
    await app.waitForPage("Home", { timeout: 10000 });
    assert.ok(!fs.existsSync(onDisk("Zweite_Seite.txt")), "page not deleted");
    assert.ok(!(await app.visible('.tree-row[data-page="Zweite Seite"]')), "deleted page still in the tree");

    // ── Delete a whole branch from the tree's context menu ────────────────
    const row = await app.rect('.tree-row[data-page="Arbeit"]');
    await app.clickAt(row.x + 40, row.y + row.h / 2, { button: "right" });
    await app.waitFor("!document.querySelector('#page-menu')?.hidden");
    await app.click('#page-menu [data-action="delete"]');
    await app.waitDialog("dlg-delete");
    assert.match(await app.text("#dlg-delete-text"), /(Seiten|pages) 3/, `branch size wrong: ${await app.text("#dlg-delete-text")}`);
    await app.click("#dlg-delete-confirm");
    await app.waitFor("!document.querySelector('.tree-row[data-page=\"Arbeit\"]')", { timeout: 10000 });
    assert.ok(!fs.existsSync(onDisk("Arbeit.txt")) && !fs.existsSync(onDisk("Arbeit")), "branch not deleted");
    assert.ok(fs.existsSync(onDisk("Home.txt")), "unrelated page vanished");
    assert.equal(await app.crumbs(), "Home", "left Home while deleting another branch");
});
