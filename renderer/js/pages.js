// The page in the editor: opening, saving, reloading, history, and what changes on disk
// behind our back. Every move from one page to another runs through `transition`.

import { api } from "./bridge.js";
import * as dock from "./dock.js";
import { editor } from "./editor.js";
import { appName, currentLanguage, t } from "./i18n.js";
import { createHistory } from "./navigation.js";
import { anchorLine } from "./outline.js";
import { ancestors, leafName } from "./pagenames.js";
import * as pictures from "./pictures.js";
import { preferences } from "./preferences.js";
import { createSaver, createTransitionQueue } from "./saving.js";
import { state } from "./state.js";
import { recall, remember } from "./storage.js";
import * as taskList from "./tasklist.js";
import * as tree from "./tree.js";
import { $, button, el, fail, onClick, setTip, showToast, withProgress } from "./ui.js";
import * as vault from "./vault.js";

const AUTOSAVE_DELAY_MS = 1200;
const SYNC_MIN_GAP_MS = 1000;

export const history = createHistory();
let saveTimer = null;

// Read-only mode (chosen by the person), a locked page and the short locks while a page loads all keep the editor still.
export const transition = createTransitionQueue((busy) => editor.setReadOnly(busy || state.readOnly || state.locked));

export function showSaveState() {
    const element = $("save-state");
    element.hidden = !state.page;
    // A page that has no file yet is "new" until something is typed.
    const kind = state.conflict ? "conflict" : state.saving ? "saving" : state.dirty ? "dirty" : state.stamp === null ? "new" : "saved";
    const text = t(`save.${kind}`);
    element.dataset.kind = kind;
    // The disk symbol in the tool bar changes its colour; the text is its tooltip.
    setTip(element, text);
    $("conflict").hidden = !state.conflict;
}

const flush = createSaver({
    state,
    getText: () => editor.getText(),
    write: api.savePage,
    onState: showSaveState,
    async onSaved(result, hadFile) {
        dock.pageSaved();
        if (hadFile !== (result.stamp !== null)) {
            editor.refreshPlaceholder();
            await tree.refresh().catch(fail);
            taskList.pagesChanged();
        }
    },
});

export async function save(options) {
    clearTimeout(saveTimer);
    await flush(options);
}

/** The editor text changed: save it a moment after the last key. */
export function edited() {
    if (!state.page) return;
    state.dirty = true;
    showSaveState();
    dock.textChanged();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save().catch(fail), AUTOSAVE_DELAY_MS);
}

/** Switches read-only mode; pending typing is saved first. */
export async function setReadOnly(on) {
    await transition(async () => {
        if (on) await save();
        await api.setReadOnly(on);
        state.readOnly = on;
    });
    document.body.classList.toggle("readonly", on);
    $("readonly-badge").hidden = !on;
}

const positionKey = () => `notebook:${state.notebook.folder}`;

function readPositions() {
    try {
        const value = JSON.parse(recall(positionKey()) || "{}");
        return value && typeof value === "object" ? value : {};
    } catch {
        return {};
    }
}

export function rememberPosition() {
    if (!state.notebook || !state.page) return;
    const saved = readPositions();
    saved.page = state.page;
    saved.cursors = { ...saved.cursors, [state.page]: editor.getCursor() };
    remember(positionKey(), JSON.stringify(saved));
}

function renderCrumbs() {
    const crumbs = $("crumbs");
    crumbs.replaceChildren();
    if (!state.page) return;
    [...ancestors(state.page), state.page].forEach((target, index) => {
        if (index > 0) crumbs.append(el("span", { className: "crumb-separator", textContent: "›" }));
        crumbs.append(button({ className: "crumb", textContent: leafName(target), on: { click: () => open(target).catch(fail) } }));
    });
}

/** Loads a page into the editor. Call it inside `transition`. */
export async function load(name, addToHistory = true) {
    await save();
    rememberPosition();
    await withProgress(async () => {
        const page = await api.readPage(name);
        // A page that does not exist yet opens with the text of its page template. It is only
        // written once the person types something.
        const template = !page.exists && preferences.pageTemplate ? await api.pageTemplate(page.name, currentLanguage()) : null;
        state.locked = Boolean(page.locked);
        state.ownPassword = Boolean(page.ownPassword);
        state.page = page.name;
        state.stamp = page.stamp;
        state.dirty = false;
        state.conflict = false;
        pictures.clear();
        editor.setText(template ? template.text : page.body);
        editor.setCursor(template ? { anchor: template.cursor, head: template.cursor } : readPositions().cursors?.[page.name]);
        editor.refreshPlaceholder();
        tree.expandAncestors(page.name);
    });
    $("welcome").hidden = true;
    taskList.hide();
    $("page").hidden = false;
    $("btn-page-menu").hidden = false;
    vault.pageShown(state.locked);
    dock.pageLoaded();
    dock.refreshAttachments();
    if (addToHistory) history.visit(state.page);
    renderCrumbs();
    showSaveState();
    tree.markCurrent();
    dock.refreshBacklinks().catch(fail);
    api.window.setTitle(`${leafName(state.page)} · ${state.notebook.name} · ${appName}`).catch(() => {});
    editor.focus();
    rememberPosition();
}

export function open(name) {
    // The editor is read-only while a page loads and cannot take the focus
    // then, so the focus is given once the transition has ended.
    return transition(() => load(name)).then(() => editor.focus());
}

/** Loads the page from disk again; unsaved text is saved first unless there is a conflict. */
export function reload() {
    return transition(async () => {
        if (!state.page) return;
        if (!state.conflict) await save();
        // Read first: a failed reload must retain the unsaved draft.
        const page = await api.readPage(state.page);
        const cursor = editor.getCursor();
        state.stamp = page.stamp;
        state.locked = Boolean(page.locked);
        state.ownPassword = Boolean(page.ownPassword);
        pictures.clear();
        editor.setText(page.body);
        editor.setCursor(cursor);
        state.dirty = false;
        state.conflict = false;
        vault.pageShown(state.locked);
        editor.refreshPlaceholder();
        showSaveState();
        dock.textChanged();
    });
}

export function moveHistory(delta) {
    return transition(async () => {
        const target = history.target(delta);
        if (!target) return;
        await load(target, false);
        history.moved(delta);
    });
}

/** Opens the page a link leads to and, if it names a place in it (`#Abschnitt`), goes there. */
export async function follow(resolved) {
    if (resolved.name !== state.page) await open(resolved.name);
    if (!resolved.anchor) return;
    const line = anchorLine(editor.getText().split("\n"), resolved.anchor);
    if (line < 0) showToast(t("outline.noAnchor", { anchor: resolved.anchor }));
    else editor.goToLine(line);
}

let syncing = false;
let lastSync = 0;

/**
 * Picks up what changed on disk while the window was in the background (a file
 * dropped into the folder, a page edited by a sync tool): page tree, attachments
 * and, when nothing was typed here, the page that is open.
 */
async function syncWithDisk() {
    if (!state.notebook || syncing || Date.now() - lastSync < SYNC_MIN_GAP_MS) return;
    syncing = true;
    lastSync = Date.now();
    try {
        await tree.refresh();
        await dock.refreshAttachments();
        if (state.page && !state.dirty && !state.conflict && !$("page").hidden) {
            const page = await api.readPage(state.page);
            if (page.stamp !== state.stamp || Boolean(page.locked) !== state.locked) await reload();
        }
    } catch (error) {
        console.error(error);
    } finally {
        syncing = false;
    }
}
window.addEventListener("focus", syncWithDisk);

onClick("btn-keep-mine", () => transition(() => save({ force: true })));
onClick("btn-reload", reload);

/** The page that was open last time in this notebook, if any. */
export const lastPage = () => readPositions().page;
