// Filtering and presenting the task list without DOM access.
// Task shape comes from `tasks_list` (crates/core/src/tasks.rs).

export const MODES = ["open", "active", "waiting", "due", "done"];

/** Local calendar date as "YYYY-MM-DD" (never converted through UTC). */
export function isoDate(date) {
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses "YYYY-MM-DD" as a local date, or null when it is not a real date. */
export function parseIso(text) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? "");
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

const lower = (text) => String(text ?? "").toLowerCase();

/** Splits a query into plain words and @tags; every part must match. */
export function parseQuery(query) {
    const words = [];
    const tags = [];
    for (const part of lower(query).split(/\s+/).filter(Boolean)) {
        if (part.startsWith("@") && part.length > 1) tags.push(part.slice(1));
        else words.push(part);
    }
    return { words, tags };
}

function inMode(task, mode, today) {
    switch (mode) {
        case "open":
            return task.open;
        case "active":
            return task.open && !task.waiting && (!task.start || task.start <= today);
        case "waiting":
            return task.open && task.waiting;
        case "due":
            return task.open && Boolean(task.due) && task.due <= today;
        case "done":
            return !task.open;
        default:
            return true;
    }
}

/**
 * Tasks for a view: filtered by mode and query. Open tasks that have not
 * started yet go behind the ones that have; otherwise the order stays as the
 * core sorted it (priority, due date, page, line).
 */
export function visibleTasks(tasks, { mode = "open", query = "", today }) {
    const { words, tags } = parseQuery(query);
    const matches = tasks.filter((task) => {
        if (!inMode(task, mode, today)) return false;
        const haystack = `${lower(task.text)} ${lower(task.page)}`;
        return words.every((word) => haystack.includes(word)) && tags.every((tag) => task.tags.includes(tag));
    });
    const future = (task) => task.open && Boolean(task.start) && task.start > today;
    return [...matches.filter((task) => !future(task)), ...matches.filter(future)];
}

/** Counts per mode, for the labels of the mode buttons. */
export function countByMode(tasks, today) {
    return Object.fromEntries(MODES.map((mode) => [mode, tasks.filter((task) => inMode(task, mode, today)).length]));
}

/** How a due date relates to today: `overdue`, `today`, `soon` (within a week) or `later`. */
export function dueState(due, today) {
    if (!due) return null;
    if (due < today) return "overdue";
    if (due === today) return "today";
    const limit = parseIso(today);
    limit.setDate(limit.getDate() + 7);
    return due <= isoDate(limit) ? "soon" : "later";
}

const CHECKBOX = /^(\t*)\[([ *x<>])\]/;
// Ticking only toggles done/open; the editor's click also offers "failed".
const NEXT_STATE = { " ": "*", "*": " ", x: " ", ">": " ", "<": " " };

/** The line with its checkbox ticked or cleared, or null when it has none. */
export function toggledCheckbox(line) {
    const match = CHECKBOX.exec(line ?? "");
    if (!match) return null;
    const mark = match[1].length + 1;
    return `${line.slice(0, mark)}${NEXT_STATE[match[2]]}${line.slice(mark + 1)}`;
}

// The lines the task list picks up: a checkbox, or a TODO/FIXME label.
const LABEL = /^\s*(?:TODO|FIXME)(?!\w)/;

/** Whether a page line is a task. */
export function isTaskLine(line) {
    return CHECKBOX.test(line ?? "") || LABEL.test(line ?? "");
}

const DAY = "\\d{4}-\\d{2}-\\d{2}";
// `>2026-12-01` starts a task, `<2026-12-01` (or `[d: 2026-12-01]`) is its deadline.
const START = new RegExp(`[ \\t]*>[ \\t]?${DAY}(?![\\w-])`, "g");
const DUE = new RegExp(`[ \\t]*(?:<[ \\t]?|\\[d:[ \\t]*)${DAY}(?:\\])?(?![\\w-])`, "g");

/** The start and deadline written in a task line itself ("" when there is none). */
export function lineDates(line) {
    const find = (pattern) => new RegExp(DAY).exec(new RegExp(pattern.source).exec(line ?? "")?.[0] ?? "")?.[0] ?? "";
    return { start: find(START), due: find(DUE) };
}

/**
 * The line with its start and deadline replaced. An empty date is left out.
 * The dates go to the end of the line, where the task list finds them.
 */
export function withDates(line, { start = "", due = "" }) {
    let text = String(line ?? "").replace(START, "").replace(DUE, "").trimEnd();
    if (start) text += ` >${start}`;
    if (due) text += ` <${due}`;
    return text;
}

const letters = (text) => lower(text).replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Whether a raw page line is (probably) still the task the index described.
 * The index may be a few seconds behind the file, and ticking off the wrong
 * line would silently change the wrong task.
 */
export function lineMatchesTask(line, task) {
    const wanted = letters(task.text).slice(0, 8);
    return wanted.length === 0 || letters(line).includes(wanted);
}
