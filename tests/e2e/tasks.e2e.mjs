// End-to-end check of the task list in the real exe: what is listed, filters,
// ticking off through the page file, jumping to the line, and refusing to tick
// off the wrong line when the file changed behind the list's back.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readPageFile, writePage } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";

await scenario("tasks", "task list, filters, tick off, start and deadline, jump to line, stale line refused", async (t) => {
    const notebook = t.notebook();
    // A task that starts far in the future: not active yet.
    writePage(notebook, "Neujahr", ["====== Neujahr 2099 ======", "[ ] Ferne Zukunft >2099-01-01", ""]);
    const app = await t.launch({ notebook });

    const texts = () => app.texts("#tasks-list .task .task-text");
    const mode = (name) => app.click(`#tasks-modes [data-mode="${name}"]`);
    const rowOf = (text) => `[...document.querySelectorAll('#tasks-list .task')].find((r) => r.querySelector('.task-text').textContent === ${JSON.stringify(text)})`;
    /** Clicks a part (`.task-check`, `.task-body`, `.task-dates`) of the row of the task with this text. */
    async function click(part, text) {
        assert.ok(await app.evaluate(`Boolean(${rowOf(text)})`), `no task "${text}" in ${JSON.stringify(await texts())}`);
        await app.clickElement(`${rowOf(text)}.querySelector('${part}')`);
    }
    const waitListed = (text, listed = true) =>
        app.waitFor(`${listed ? "" : "!"}Boolean(${rowOf(text)})`, { timeout: 8000 });

    // ── What is listed ────────────────────────────────────────────────────
    await app.click("#btn-tasks");
    await app.waitFor("document.querySelectorAll('#tasks-list .task').length > 0");
    assert.ok(await app.visible("#tasks"), "task view not shown");
    assert.ok(!(await app.visible("#page")), "page still visible behind the task view");

    // ── By note by default: one heading per note, no page line under the tasks ─
    const headings = await app.texts("#tasks-list .task-group");
    assert.ok(headings.length >= 3 && headings.some((h) => h.startsWith("Home")) && headings.some((h) => h.startsWith("Projekte:Garten")), `headings: ${JSON.stringify(headings)}`);
    assert.equal(await app.count("#tasks-list .task-page"), 0, "grouped tasks repeat their page");
    assert.equal(await app.evaluate("document.getElementById('tasks-group').getAttribute('aria-pressed')"), "true");
    // The tasks of one note follow their heading directly.
    assert.ok(await app.evaluate(`(() => { const list = [...document.querySelectorAll('#tasks-list > *')]; const at = list.findIndex((n) => n.classList.contains('task-group') && n.textContent.startsWith('Projekte:Garten')); return list[at + 1]?.classList.contains('task'); })()`), "a task does not follow its heading");
    await app.click("#tasks-group");
    await app.waitFor("document.querySelectorAll('#tasks-list .task-group').length === 0");
    assert.ok((await app.count("#tasks-list .task-page")) > 0, "the flat list lost the page line");
    const open = await texts();
    assert.equal(open[0], "Tomaten gießen !!", `highest priority first, got ${JSON.stringify(open)}`);
    for (const wanted of ["Offene Aufgabe !", "Unteraufgabe @garten", "TODO: Rasen mähen <2026-11-20", "Ferne Zukunft >2099-01-01"]) {
        assert.ok(open.includes(wanted), `missing task ${wanted} in ${JSON.stringify(open)}`);
    }
    assert.ok(!open.includes("Erledigte Aufgabe"), "a finished task is listed as open");
    assert.ok(open.slice(-2).includes("Ferne Zukunft >2099-01-01"), "tasks that have not started should come last");

    await mode("active");
    assert.ok(!(await texts()).includes("Ferne Zukunft >2099-01-01"), "a task that starts in 2099 is active");
    await mode("done");
    assert.deepEqual((await texts()).sort(), ["Erledigte Aufgabe", "Verschobene Aufgabe", "Verworfene Aufgabe"]);
    await mode("open");

    // ── Filter by word and @tag ───────────────────────────────────────────
    await app.setValue("#tasks-query", "@garten", "input");
    assert.deepEqual(await texts(), ["Unteraufgabe @garten"]);
    await app.setValue("#tasks-query", "rasen", "input");
    assert.deepEqual(await texts(), ["TODO: Rasen mähen <2026-11-20"]);
    await app.setValue("#tasks-query", "projekte:garten", "input");
    assert.equal((await texts()).length, 2, "filtering by page name");
    await app.setValue("#tasks-query", "", "input");
    assert.ok((await texts()).length >= 6);

    // ── Tick off and re-open through the file ─────────────────────────────
    const before = readPageFile(notebook, "Home");
    await click(".task-check", "Offene Aufgabe !");
    await waitListed("Offene Aufgabe !", false);
    assert.equal(readPageFile(notebook, "Home"), before.replace("[ ] Offene Aufgabe !", "[*] Offene Aufgabe !"), "ticking off changed more than one marker");
    await mode("done");
    await waitListed("Offene Aufgabe !");
    await click(".task-check", "Offene Aufgabe !");
    await waitListed("Offene Aufgabe !", false);
    assert.equal(readPageFile(notebook, "Home"), before, "ticking off and back did not restore the page byte for byte");
    await mode("open");

    // ── Start and deadline, both optional ─────────────────────────────────
    const setDates = async (start, due) => {
        await app.waitDialog("dlg-task-dates");
        await app.setValue("#task-start", start);
        await app.setValue("#task-due", due);
        await app.click("#dlg-task-dates-form .primary");
        await app.waitDialogClosed("dlg-task-dates");
    };
    await click(".task-dates", "Offene Aufgabe !");
    await setDates("2099-03-01", "2099-03-31");
    await app.waitFor(`${rowOf("Offene Aufgabe ! >2099-03-01 <2099-03-31")}?.textContent.includes('ab ')`, { timeout: 8000 });
    assert.equal(readPageFile(notebook, "Home"), before.replace("[ ] Offene Aufgabe !", "[ ] Offene Aufgabe ! >2099-03-01 <2099-03-31"), "the dates were not written into the task line only");
    // Opened again it shows what is there; only the deadline is changed, the start is cleared.
    await click(".task-dates", "Offene Aufgabe ! >2099-03-01 <2099-03-31");
    await app.waitDialog("dlg-task-dates");
    assert.equal(await app.evaluate("document.getElementById('task-start').value + '|' + document.getElementById('task-due').value"), "2099-03-01|2099-03-31");
    await setDates("", "2099-04-15");
    await waitListed("Offene Aufgabe ! <2099-04-15");
    // Both cleared: the line is as it was.
    await click(".task-dates", "Offene Aufgabe ! <2099-04-15");
    await setDates("", "");
    await waitListed("Offene Aufgabe !");
    assert.equal(readPageFile(notebook, "Home"), before, "removing both dates did not restore the page byte for byte");

    // ── A label task has no checkbox ──────────────────────────────────────
    assert.equal(await app.evaluate(`${rowOf("TODO: Rasen mähen <2026-11-20")}.querySelector('.task-check').disabled`), true, "label task can be ticked off");

    // ── Jump to the line ──────────────────────────────────────────────────
    await click(".task-body", "Tomaten gießen !!");
    await app.waitFor("document.querySelector('#tasks')?.hidden === true");
    await app.waitForPage("Garten");
    await app.type("ZZ"); // the cursor sits at the end of the task's line
    await app.save();
    assert.ok(readPageFile(notebook, "Projekte:Garten").includes("[ ] Tomaten gießen !!ZZ\r\n"), "cursor was not on the task's line");

    // ── The date picker in the editor works on the task under the cursor ──
    await app.press("d", { ctrl: true, shift: true });
    await setDates("2099-05-01", "2099-05-31");
    await app.save();
    assert.ok(readPageFile(notebook, "Projekte:Garten").includes("[ ] Tomaten gie\u00dfen !!ZZ >2099-05-01 <2099-05-31\r\n"), "the editor picker did not write the dates into the line");
    // The cursor is still on the task: the date list offers the picker first.
    await app.press("d", { ctrl: true });
    await app.waitFor("document.querySelector('#palette-list li')?.textContent.includes('Beginn und Frist')");
    await app.press("Enter");
    await app.waitDialog("dlg-task-dates");
    assert.equal(await app.evaluate("document.getElementById('task-start').value + '|' + document.getElementById('task-due').value"), "2099-05-01|2099-05-31");
    await app.press("Escape");
    await app.waitDialogClosed("dlg-task-dates");
    await app.press("Home", { ctrl: true }); // the heading is no task
    await app.press("d", { ctrl: true, shift: true });
    assert.match(await app.waitToast(), /Aufgabe|task/);
    await app.waitFor("document.querySelector('#toast').hidden === true", { timeout: 10000 });

    await app.click("#btn-tasks");
    await waitListed("Tomaten gießen !!ZZ >2099-05-01 <2099-05-31");
    app.expectConsoleErrors();

    // ── The file changes behind the list's back ───────────────────────────
    // A line is inserted above the tasks; the list still holds the old line numbers.
    const file = path.join(notebook, "Home.txt");
    const edited = before.replace("====== Home ======", "[ ] Eingeschoben\r\n====== Home ======");
    assert.notEqual(edited, before);
    fs.writeFileSync(file, edited);
    await click(".task-check", "Offene Aufgabe !");
    assert.match(await app.waitToast(), /geändert|changed/);
    assert.equal(fs.readFileSync(file, "utf8"), edited, "a stale line was ticked off anyway");

    // The list refreshes itself, and the same click now works on the right line.
    await waitListed("Eingeschoben");
    await click(".task-check", "Offene Aufgabe !");
    await waitListed("Offene Aufgabe !", false);
    assert.equal(fs.readFileSync(file, "utf8"), edited.replace("[ ] Offene Aufgabe !", "[*] Offene Aufgabe !"));
});
