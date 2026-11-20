// Notebooks: opening and creating them, what the window shows for one, the list of
// recent ones on the welcome screen and the notebook manager (like Obsidian's vault list:
// every notebook you used, which one is open, which ones are protected by a passphrase,
// open another folder, create a new one, or drop one from the list; the folder itself is
// never touched).

import { api } from "./bridge.js";
import { showDialog } from "./dialogs.js";
import * as dock from "./dock.js";
import { editor } from "./editor.js";
import { folderName, plainFolder, sameFolder, shortPath } from "./folders.js";
import { mascot } from "./mascot.js";
import { appName, t } from "./i18n.js";
import * as pages from "./pages.js";
import * as pictures from "./pictures.js";
import { applyPreferences } from "./preferences.js";
import * as search from "./search.js";
import { state } from "./state.js";
import * as taskList from "./tasklist.js";
import * as tree from "./tree.js";
import { $, LOCK, button, el, fail, onClick, setTip, withProgress } from "./ui.js";
import * as vault from "./vault.js";

const BOOK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8zM3.5 2.5v11M6.5 5.5h3.5" /></svg>';
const RECENT_ON_WELCOME = 6;

/** What a row of the manager says on its right. */
function tagText(notebook, current) {
    if (current) return t("notebooks.current");
    if (!notebook.exists) return t("notebooks.missing");
    return notebook.protected ? t("notebooks.protectedShort") : "";
}

/** Opens the notebook in a folder; call it inside `transition`. */
const openAt = async (folder) => show(await withProgress(() => api.openNotebook(folder)));

/** Forgets everything that is on screen from the notebook: search hits, pictures, text, lists. */
function clearSensitiveViews() {
    search.clear();
    pictures.close();
    pictures.clear();
    editor.setText("");
    dock.clearSensitiveData();
    taskList.clearSensitiveData();
}

/** A notebook that hides its file names, before the passphrase: nothing to list, only the lock. */
function showLocked() {
    clearSensitiveViews();
    state.page = null;
    state.stamp = null;
    state.dirty = false;
    state.locked = true;
    state.ownPassword = false;
    if (state.notebook) state.notebook.locked = true;
    $("tree").replaceChildren(el("div", { className: "tree-empty" }, mascot("asleep", "empty-mascot"), el("p", { textContent: t("vault.notebookLockedTree") })));
    $("welcome").hidden = true;
    taskList.hide();
    $("page").hidden = false;
    $("btn-page-menu").hidden = true;
    $("crumbs").replaceChildren();
    $("dock").hidden = true;
    vault.pageShown(true);
    pages.showSaveState();
    api.window.setTitle(`${state.notebook?.name ?? ""} · ${appName}`).catch(() => {});
}

/** Asks for the passphrase of a protected notebook once the move that opened it is over. */
const askPassphraseSoon = () => setTimeout(() => vault.promptOnOpen().catch(fail), 0);

/** Makes a notebook the open one. Call it inside `transition`. */
export async function show(info) {
    clearSensitiveViews();
    pages.history.reset();
    search.close();
    state.notebook = info;
    state.page = null;
    state.stamp = null;
    state.dirty = false;
    state.conflict = false;
    state.expanded.clear();
    $("notebook-name").textContent = info.name;
    $("notebook-name").removeAttribute("data-i18n");
    applyPreferences();
    if (info.locked) {
        // Nothing is read before the passphrase: the lock is shown and asked for.
        await vault.refresh();
        showLocked();
        askPassphraseSoon();
        return;
    }
    dock.notebookShown();
    taskList.notebookShown();
    await withProgress(tree.refresh);
    await vault.refresh();
    const last = pages.lastPage();
    await pages.load(typeof last === "string" ? last : info.home);
    askPassphraseSoon();
}

/** The vault was locked: encrypted text must not stay on screen. */
export function vaultLocked() {
    clearSensitiveViews();
    state.locked = true;
    if (vault.isSealed()) showLocked();
    else vault.pageShown(true);
}

/** The vault was opened, locked or an encryption setting changed: show the page (or notebook) as it is now. */
export function vaultChanged() {
    // A notebook that was locked as a whole is shown from the start once it is open.
    if (state.notebook?.locked && !vault.isSealed()) state.notebook.locked = false;
    if (state.notebook?.locked) return openAt(state.notebook.folder);
    return state.page ? pages.load(state.page, false) : Promise.resolve();
}

async function chooseAndOpen() {
    await pages.save();
    const folder = await api.pickFolder(t("notebook.pickOpen"));
    if (folder) await openAt(folder);
}

async function chooseAndCreate() {
    await pages.save();
    const folder = await api.pickFolder(t("notebook.pickCreate"));
    if (!folder) return;
    const input = $("dlg-name-input");
    input.value = folderName(folder);
    const name = await showDialog($("dlg-name"), {
        collect: () => input.value.trim() || undefined,
        onOpen: () => input.select(),
    });
    if (!name) return;
    await show(await withProgress(() => api.createNotebook(folder, name)));
    // Ask for a passphrase right away (optional), once this move is over.
    setTimeout(() => vault.protectNewNotebook().catch(fail), 0);
}

function recentButton(notebook) {
    const name = el("strong", { textContent: notebook.name });
    if (notebook.protected) name.prepend(el("span", { textContent: `${LOCK} `, title: t("notebooks.protected") }));
    return button(
        { className: "recent-notebook", on: { click: () => pages.transition(() => openAt(notebook.folder)).catch(fail) } },
        name,
        el("span", { textContent: plainFolder(notebook.folder) }),
    );
}

export async function renderRecent() {
    const box = $("welcome-recent");
    const recent = (await api.recentNotebooks()).filter((notebook) => notebook.exists);
    box.hidden = recent.length === 0;
    box.replaceChildren(...(recent.length ? [el("h2", { textContent: t("notebooks.recent") }), ...recent.slice(0, RECENT_ON_WELCOME).map(recentButton)] : []));
}

/** Closes the manager with what the person chose; set while it is open. */
let finishManager = null;

function managerRow(notebook) {
    const current = Boolean(state.notebook) && sameFolder(state.notebook.folder, notebook.folder);
    const fullPath = plainFolder(notebook.folder);
    // The same place for every notebook: a lock when it is protected, else a book.
    const mark = el("span", { className: "notebook-lock" });
    if (notebook.protected) {
        mark.textContent = LOCK;
        mark.title = t("notebooks.protected");
    } else {
        mark.innerHTML = BOOK_ICON;
    }
    const open = button(
        {
            className: "notebook-open",
            dataset: { folder: notebook.folder },
            disabled: current || !notebook.exists,
            title: notebook.exists ? t(current ? "notebooks.currentTip" : "notebooks.openTip") : t("notebooks.missing"),
        },
        mark,
        el("span", { className: "notebook-text" }, el("strong", { textContent: notebook.name }), el("small", { textContent: shortPath(fullPath), title: fullPath })),
        el("span", { className: "notebook-tag", textContent: tagText(notebook, current) }),
    );
    const forget = button({ className: "ghost round notebook-remove", dataset: { folder: notebook.folder }, textContent: "×", disabled: current });
    setTip(forget, t("notebooks.forget"));
    const row = el("li", { className: "notebook-row" }, open, forget);
    row.classList.toggle("current", current);
    row.classList.toggle("missing", !notebook.exists);
    return row;
}

async function drawManager() {
    const recent = await api.recentNotebooks();
    $("notebooks-empty").hidden = recent.length > 0;
    $("notebooks-list").replaceChildren(...recent.map(managerRow));
}

$("notebooks-list").addEventListener("click", (event) => {
    const folder = event.target.closest("[data-folder]");
    if (!folder) return;
    if (folder.classList.contains("notebook-remove")) api.forgetNotebook(folder.dataset.folder).then(drawManager).catch(fail);
    else finishManager?.({ type: "open", folder: folder.dataset.folder });
});
$("notebooks-open").addEventListener("click", () => finishManager?.({ type: "folder" }));
$("notebooks-create").addEventListener("click", () => finishManager?.({ type: "create" }));

/** The notebook manager; what the person picks in it happens once it is closed. */
export async function manage() {
    await drawManager();
    const choice = await showDialog($("dlg-notebooks"), {
        collect: () => null,
        onOpen: (finish) => {
            finishManager = finish;
        },
    });
    finishManager = null;
    if (!choice) return;
    if (choice.type === "folder") return pages.transition(chooseAndOpen);
    if (choice.type === "create") return pages.transition(chooseAndCreate);
    return pages.transition(async () => {
        await pages.save();
        await openAt(choice.folder);
    });
}

onClick("btn-open", () => pages.transition(chooseAndOpen));
onClick("btn-create", () => pages.transition(chooseAndCreate));
onClick("btn-notebook", manage);
