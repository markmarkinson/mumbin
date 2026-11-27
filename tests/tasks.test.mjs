import assert from "node:assert/strict";
import { test } from "node:test";

import { countByMode, dueState, isTaskLine, isoDate, lineDates, parseIso, withDates, lineMatchesTask, parseQuery, toggledCheckbox, visibleTasks } from "../renderer/js/tasks.js";

const task = (overrides) => ({
    page: "Seite",
    line: 0,
    text: "Aufgabe",
    status: "open",
    open: true,
    priority: 0,
    tags: [],
    due: null,
    start: null,
    depth: 0,
    waiting: false,
    checkbox: true,
    ...overrides,
});

const TODAY = "2026-11-13";
const ALL = [
    task({ text: "Offen" }),
    task({ text: "Fällig", due: "2026-11-12" }),
    task({ text: "Später fällig", due: "2026-12-24" }),
    task({ text: "Noch nicht dran", start: "2026-12-01" }),
    task({ text: "Wartet", waiting: true }),
    task({ text: "Fertig", status: "done", open: false }),
    task({ text: "Mit Tag", tags: ["garten"], page: "Projekte:Garten" }),
];
const texts = (list) => list.map((item) => item.text);

test("modes select what the person asks for", () => {
    const view = (mode) => texts(visibleTasks(ALL, { mode, today: TODAY }));
    assert.deepEqual(view("open"), ["Offen", "Fällig", "Später fällig", "Wartet", "Mit Tag", "Noch nicht dran"]);
    assert.deepEqual(view("active"), ["Offen", "Fällig", "Später fällig", "Mit Tag"]);
    assert.deepEqual(view("waiting"), ["Wartet"]);
    assert.deepEqual(view("due"), ["Fällig"]);
    assert.deepEqual(view("done"), ["Fertig"]);
});

test("a task due today counts as due", () => {
    const list = [task({ text: "Heute", due: TODAY })];
    assert.equal(visibleTasks(list, { mode: "due", today: TODAY }).length, 1);
});

test("words and @tags narrow the list, all of them must match", () => {
    const view = (query) => texts(visibleTasks(ALL, { mode: "open", query, today: TODAY }));
    assert.deepEqual(view("fällig"), ["Fällig", "Später fällig"]);
    assert.deepEqual(view("später FÄLLIG"), ["Später fällig"]);
    assert.deepEqual(view("@garten"), ["Mit Tag"]);
    assert.deepEqual(view("@garten projekte"), ["Mit Tag"]);
    assert.deepEqual(view("@garten offen"), []);
    assert.deepEqual(view("@"), []); // a lone @ is a word, not a tag
    assert.deepEqual(parseQuery("  Foo  @Bar @ "), { words: ["foo", "@"], tags: ["bar"] });
});

test("counts per mode feed the buttons", () => {
    assert.deepEqual(countByMode(ALL, TODAY), { open: 6, active: 4, waiting: 1, due: 1, done: 1 });
});

test("due dates are classified relative to today", () => {
    assert.equal(dueState(null, TODAY), null);
    assert.equal(dueState("2026-11-12", TODAY), "overdue");
    assert.equal(dueState("2026-11-13", TODAY), "today");
    assert.equal(dueState("2026-11-20", TODAY), "soon");
    assert.equal(dueState("2026-11-21", TODAY), "later");
    assert.equal(dueState("2026-12-24", "2026-12-28"), "overdue");
});

test("ticking a checkbox only touches the marker", () => {
    assert.equal(toggledCheckbox("[ ] Einkaufen"), "[*] Einkaufen");
    assert.equal(toggledCheckbox("\t\t[*] Erledigt [ ] nicht anfassen"), "\t\t[ ] Erledigt [ ] nicht anfassen");
    assert.equal(toggledCheckbox("[x] Verworfen"), "[ ] Verworfen");
    assert.equal(toggledCheckbox("[>] Verschoben"), "[ ] Verschoben");
    assert.equal(toggledCheckbox("TODO: kein Kästchen"), null);
    assert.equal(toggledCheckbox("* [ ] kein Zeilenanfang"), null);
    assert.equal(toggledCheckbox("[] leer"), null);
    assert.equal(toggledCheckbox(undefined), null);
});

test("a stale index must not tick off the wrong line", () => {
    const stored = task({ text: "Tomaten gießen !!" });
    assert.equal(lineMatchesTask("[ ] Tomaten gießen !!", stored), true);
    assert.equal(lineMatchesTask("[ ] **Tomaten** gießen !!", stored), true);
    assert.equal(lineMatchesTask("[ ] Hecke schneiden", stored), false);
    assert.equal(lineMatchesTask("[ ] [[Seite|Tomaten]] gießen", task({ text: "Tomaten gießen" })), true);
    assert.equal(lineMatchesTask("[ ] egal", task({ text: "" })), true);
});

test("a local date is written as year-month-day without a detour through UTC", () => {
    assert.equal(isoDate(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
    assert.equal(isoDate(new Date(2026, 11, 31, 0, 0)), "2026-12-31");
});

test("a date text is read only when it is a real day", () => {
    assert.equal(isoDate(parseIso("2026-02-28")), "2026-02-28");
    assert.equal(parseIso("2026-02-30"), null);
    assert.equal(parseIso("morgen"), null);
});

test("the dates of a task line are read and written, and an empty date is left out", () => {
    assert.deepEqual(lineDates("[ ] Steuer >2026-12-01 <2026-12-31 @haus"), { start: "2026-12-01", due: "2026-12-31" });
    assert.deepEqual(lineDates("TODO: Rasen mähen <2026-11-20"), { start: "", due: "2026-11-20" });
    assert.deepEqual(lineDates("[ ] Termin [d: 2026-11-05]"), { start: "", due: "2026-11-05" });
    assert.deepEqual(lineDates("[ ] ohne Datum, Kosten >2000"), { start: "", due: "" });
    assert.equal(withDates("[ ] Steuer", { start: "2026-12-01", due: "2026-12-31" }), "[ ] Steuer >2026-12-01 <2026-12-31");
    assert.equal(withDates("[ ] Steuer >2026-12-01 <2026-12-31 @haus", { start: "", due: "2027-01-15" }), "[ ] Steuer @haus <2027-01-15");
    assert.equal(withDates("[ ] Termin [d: 2026-11-05]", { start: "", due: "" }), "[ ] Termin");
    assert.equal(withDates("[ ] Kosten >2000 <b>fett</b>", { start: "2026-12-01" }), "[ ] Kosten >2000 <b>fett</b> >2026-12-01");
    assert.equal(withDates("[>] Verschoben", { due: "2026-12-01" }), "[>] Verschoben <2026-12-01");
});

test("task lines are the ones with a checkbox or a TODO/FIXME label", () => {
    assert.equal(isTaskLine("[ ] Steuer"), true);
    assert.equal(isTaskLine("\t[*] erledigt"), true);
    assert.equal(isTaskLine("TODO: Rasen mähen"), true);
    assert.equal(isTaskLine("  FIXME kaputt"), true);
    assert.equal(isTaskLine("TODOS zählt nicht"), false);
    assert.equal(isTaskLine("Ein ganz normaler Satz"), false);
    assert.equal(isTaskLine(undefined), false);
});
