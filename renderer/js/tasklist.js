// The task list: every line with a checkbox from all pages, filtered by mode and words.
// Pure logic lives in tasks.js.

import { api } from "./bridge.js";
import { showDialog } from "./dialogs.js";
import { editor } from "./editor.js";
import { currentLanguage, t } from "./i18n.js";
import * as pages from "./pages.js";
import { state } from "./state.js";
import { mascot } from "./mascot.js";
import { recall, remember } from "./storage.js";
import { $, button, el, fail, onClick, setTip } from "./ui.js";
import { MODES, countByMode, dueState, isoDate, lineDates, lineMatchesTask, parseIso, toggledCheckbox, visibleTasks, withDates } from "./tasks.js";

const BOX = { open: "☐", done: "☑", cancelled: "☒", migrated: "▷" };
const CALENDAR_ICON = '<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="2.5" y="3.5" width="13" height="12" rx="2"/><path d="M2.5 7.5h13M6 2v3M12 2v3"/></svg>';

function formatDue(iso) {
    const date = parseIso(iso);
    if (!date) return iso;
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString(currentLanguage(), { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

// Counts the times the list was cleared; an answer that arrives after that is dropped.
let generation = 0;
const GROUP_KEY = "tasks:grouped";
// Grouped by note unless the person turned it off.
const view = { mode: "open", query: "", data: [], grouped: recall(GROUP_KEY) !== "0" };

/** A friendly note for an empty list: the mummy and a line of text. */
function emptyState(text) {
    return el("div", { className: "empty-state" }, mascot("awake", "empty-mascot"), el("p", { textContent: text }));
}

function taskRow(task, today, showPage) {
    const box = button({
        className: "task-check",
        textContent: BOX[task.status] ?? BOX.open,
        disabled: !task.checkbox,
        on: { click: () => rewriteTaskLine(task, toggledCheckbox) },
    });
    setTip(box, t(task.checkbox ? "tasks.check" : "tasks.noCheck"));

    const body = button(
        { className: "task-body", on: { click: () => openTask(task) } },
        el("span", { className: "task-text", textContent: task.text }),
        ...(showPage ? [el("span", { className: "task-page", textContent: task.page })] : []),
    );

    const chips = [];
    const chip = (className, label) => chips.push(el("span", { className: `chip ${className}`, textContent: label }));
    if (task.priority > 0) chip("priority", "!".repeat(Math.min(task.priority, 5)));
    if (task.due) chip(`due-${dueState(task.due, today)}`, formatDue(task.due));
    if (task.open && task.start && task.start > today) chip("later", t("tasks.starts", { date: formatDue(task.start) }));
    for (const tag of task.tags) chip("tag", `@${tag}`);

    const dates = button({ className: "task-dates", innerHTML: CALENDAR_ICON, on: { click: () => editTaskDates(task) } });
    setTip(dates, t("taskDates.open"));

    const row = el("div", { className: "task", dataset: { state: task.status }, attrs: { role: "listitem" } }, box, body, el("span", { className: "task-meta" }, ...chips), dates);
    row.style.paddingLeft = `${12 + task.depth * 20}px`;
    return row;
}

function render() {
    const today = isoDate(new Date());
    const counts = countByMode(view.data, today);
    for (const modeButton of $("tasks-modes").querySelectorAll("[data-mode]")) {
        const mode = modeButton.dataset.mode;
        modeButton.textContent = `${t(`tasks.mode.${mode}`)} ${counts[mode]}`;
        modeButton.setAttribute("aria-pressed", String(mode === view.mode));
        modeButton.classList.toggle("active", mode === view.mode);
    }
    $("tasks-group").classList.toggle("active", view.grouped);
    $("tasks-group").setAttribute("aria-pressed", String(view.grouped));
    const tasks = visibleTasks(view.data, { mode: view.mode, query: view.query, today });
    const rows = view.grouped ? groupedRows(tasks, today) : tasks.map((task) => taskRow(task, today, true));
    $("tasks-list").replaceChildren(...(rows.length ? rows : [emptyState(t("tasks.empty"))]));
}

/** One heading per note, in the order of the most urgent task of each; the tasks keep their order. */
function groupedRows(tasks, today) {
    const byPage = new Map();
    for (const task of tasks) {
        if (!byPage.has(task.page)) byPage.set(task.page, []);
        byPage.get(task.page).push(task);
    }
    return [...byPage].flatMap(([page, own]) => [
        button({ className: "task-group", on: { click: () => pages.open(page).catch(fail) } }, page, el("span", { textContent: String(own.length) })),
        ...own.map((task) => taskRow(task, today, false)),
    ]);
}

async function refresh() {
    const started = generation;
    const tasks = await api.tasks();
    if (started !== generation) return;
    view.data = tasks;
    render();
}

/** Changes the line of a task in its page file; `change` gets the line and returns the new one (or null). */
async function rewriteTaskLine(task, change) {
    try {
        await pages.transition(async () => {
            await pages.save();
            // Read the file again: the index may be a moment behind it.
            const page = await api.readPage(task.page);
            const lines = page.body.split("\n");
            const updated = change(lines[task.line]);
            if (updated === null || !lineMatchesTask(lines[task.line], task)) throw { code: "task-changed" };
            lines[task.line] = updated;
            const body = lines.join("\n");
            const result = await api.savePage(task.page, body, page.stamp, false);
            if (state.page === task.page) {
                state.stamp = result.stamp;
                editor.setText(body);
            }
        });
    } catch (error) {
        fail(error);
    }
    await refresh().catch(fail);
}

/** Asks for a start and a deadline (both optional); null when cancelled or nothing changed. */
export async function askDates(name, own) {
    $("dlg-task-dates-name").textContent = name;
    $("task-start").value = own.start;
    $("task-due").value = own.due;
    const next = await showDialog($("dlg-task-dates"), {
        collect: () => ({ start: $("task-start").value, due: $("task-due").value }),
    });
    return next && (next.start !== own.start || next.due !== own.due) ? next : null;
}

/** Asks for a start and a deadline (both optional) and writes them into the task line. */
async function editTaskDates(task) {
    let own;
    try {
        const page = await api.readPage(task.page);
        const line = page.body.split("\n")[task.line];
        if (line === undefined || !lineMatchesTask(line, task)) throw { code: "task-changed" };
        own = lineDates(line);
    } catch (error) {
        fail(error);
        return;
    }
    const next = await askDates(task.text, own);
    if (!next) return;
    await rewriteTaskLine(task, (line) => (line === undefined ? null : withDates(line, next)));
}

async function openTask(task) {
    await pages.open(task.page).catch(fail);
    editor.goToLine(task.line);
}

export function hide() {
    $("tasks").hidden = true;
    $("btn-tasks").setAttribute("aria-pressed", "false");
}

/** Opens the task list, or closes it again when it is already open. */
export async function toggle() {
    if (!$("tasks").hidden) {
        hide();
        $("page").hidden = false;
        editor.focus();
        return;
    }
    await pages.transition(async () => {
        await pages.save();
        $("welcome").hidden = true;
        $("page").hidden = true;
        $("tasks").hidden = false;
        $("btn-tasks").setAttribute("aria-pressed", "true");
        await refresh();
    });
    $("tasks-query").focus();
}

$("tasks-modes").addEventListener("click", (event) => {
    const mode = event.target.closest("[data-mode]")?.dataset.mode;
    if (mode && MODES.includes(mode)) {
        view.mode = mode;
        render();
    }
});
onClick("tasks-group", () => {
    view.grouped = !view.grouped;
    remember(GROUP_KEY, view.grouped ? "1" : "0");
    render();
});
$("tasks-query").addEventListener("input", (event) => {
    view.query = event.target.value;
    render();
});
onClick("btn-tasks", toggle);

export function notebookShown() {
    $("btn-tasks").hidden = false;
    hide();
}

/** A page was created or removed: the task list may change. */
export function pagesChanged() {
    if (!$("tasks").hidden) refresh().catch(fail);
}

export function languageChanged() {
    if (!$("tasks").hidden) render();
}

export function clearSensitiveData() {
    generation += 1;
    view.data = [];
    view.query = "";
    $("tasks-query").value = "";
    render();
    hide();
}
