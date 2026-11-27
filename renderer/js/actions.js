// Commands of the application: one list that feeds the keyboard shortcuts, the command
// palette, the help dialog and the buttons, plus the small dialogs some of them open.

import { api } from "./bridge.js";
import { insertTextFor, pictureType } from "./attachments.js";
import { dateTexts, matchesShortcut, neighbourPage, shortcutLabel } from "./commands.js";
import { showDialog } from "./dialogs.js";
import * as dock from "./dock.js";
import { linkMarkup, tableMarkup } from "./editing.js";
import { editor } from "./editor.js";
import { openAbout, openHelp } from "./help.js";
import { currentLanguage, t } from "./i18n.js";
import * as notebooks from "./notebooks.js";
import { parentName } from "./pagenames.js";
import { pick } from "./palette.js";
import * as pageOps from "./pageops.js";
import * as pages from "./pages.js";
import { DEFAULT_PREFERENCES, preferences, revealSidebar, setFontSize, storePreferences, toggleSidebar } from "./preferences.js";
import { openSettings } from "./settings.js";
import { state } from "./state.js";
import { isTaskLine, lineDates, withDates } from "./tasks.js";
import * as taskList from "./tasklist.js";
import { $, el, fail, showToast, withProgress } from "./ui.js";
import * as vault from "./vault.js";

export const GROUPS = ["file", "navigate", "view", "format", "insert"];
const MAX_LINK_SUGGESTIONS = 800;

/** Runs `dialog`, then gives the focus back to the text. */
const thenFocusText = (dialog) => dialog.then(() => editor.focus());

async function jumpTo() {
    const names = await api.names();
    const choice = await pick({
        title: t("cmd.nav.jump"),
        entries: names.map((page) => ({ text: page.name, dim: !page.exists, detail: page.exists ? "" : t("jump.missing"), value: page.name })),
        create(query, shown) {
            const exact = shown.some((entry) => entry.text.toLowerCase() === query.toLowerCase());
            return exact ? null : { text: query, detail: t("jump.create"), create: true };
        },
    });
    if (!choice) return;
    const typed = choice.create ? choice.text : choice.value;
    // "+Name" means a page below the current one.
    const wanted = choice.create && typed.startsWith("+") && state.page ? `${state.page}:${typed.slice(1)}` : typed;
    await pages.open(await api.pageNameFromInput(wanted));
}

async function showRecent() {
    const changed = await api.recentChanges();
    const format = new Intl.DateTimeFormat(currentLanguage(), { dateStyle: "medium", timeStyle: "short" });
    const choice = await pick({
        title: t("cmd.recent.show"),
        entries: changed.map((page) => ({ text: page.name, detail: page.modified ? format.format(new Date(page.modified * 1000)) : "", value: page.name })),
    });
    if (choice) await pages.open(choice.value);
}

async function goParent() {
    const parent = parentName(state.page || "");
    if (parent) await pages.open(parent);
}

async function goChild() {
    const children = await api.children(state.page);
    if (children.length) await pages.open(children[0].name);
}

async function goNeighbour(delta) {
    const names = (await api.names()).filter((page) => page.exists).map((page) => page.name);
    const target = neighbourPage(names, state.page, delta);
    if (target) await pages.open(target);
}

function focusSearch() {
    revealSidebar();
    $("search-input").focus();
    $("search-input").select();
}

/** Start and deadline of the task under the cursor, chosen with a date picker. */
async function setTaskDates() {
    const { lineFrom, lineTo, lineText } = editor.context();
    if (!isTaskLine(lineText)) {
        showToast(t("taskDates.notATask"));
        editor.focus();
        return;
    }
    const next = await taskList.askDates(lineText.replace(/^\s*(?:\[.\]\s*)?/, ""), lineDates(lineText));
    if (next) editor.replaceRange(lineFrom, lineTo, withDates(lineText, next));
    editor.focus();
}

async function insertDate() {
    const entries = dateTexts(new Date(), currentLanguage()).map((text) => ({ text }));
    // On a task the list starts with the picker for its start and deadline.
    const onTask = isTaskLine(editor.context().lineText);
    if (onTask) entries.unshift({ text: t("cmd.task.dates"), run: setTaskDates });
    const choice = await pick({ title: t("cmd.insert.date"), entries });
    if (choice?.run) await choice.run();
    else if (choice) editor.command("insert", choice.text);
    else editor.focus();
}

async function editLink() {
    const context = editor.context();
    const existing = context.link;
    const target = $("link-target");
    const text = $("link-text");
    target.value = existing ? existing.target : "";
    text.value = existing ? (existing.text === existing.target ? "" : existing.text) : context.text.replace(/\n/g, " ");
    $("link-remove").hidden = !existing;
    const names = (await api.names()).slice(0, MAX_LINK_SUGGESTIONS);
    $("link-targets").replaceChildren(...names.map((page) => el("option", { value: page.name.includes(":") ? `:${page.name}` : page.name })));
    const answer = await showDialog($("dlg-link"), {
        collect: () => ({ remove: false }),
        onOpen(finish) {
            $("link-remove").onclick = () => finish({ remove: true });
            setTimeout(() => target.focus(), 0);
        },
    });
    if (!answer) return editor.focus();
    const from = existing ? existing.from : context.from;
    const to = existing ? existing.to : context.to;
    if (answer.remove) return editor.replaceRange(from, to, existing.text);
    if (!target.value.trim()) return editor.focus();
    return editor.replaceRange(from, to, linkMarkup(target.value, text.value));
}

/** Lets the person choose files, stores them with the page and refers to them at the cursor. */
async function insertAttachment() {
    const added = await dock.addAttachments();
    const texts = added.map((name) => insertTextFor({ name, isImage: pictureType(name) !== null })).filter((text) => text !== null);
    if (texts.length) editor.command("insert", texts.join("\n"));
}

/** The few words an export or print view needs, in the language of the window. */
function exportTexts() {
    return {
        language: currentLanguage(),
        contents: t("export.contents"),
        exported: t("export.exported"),
        printHint: t("export.printHint"),
    };
}

/** Writes the notebook, or this page with its sub-pages, as HTML and shows the result. */
async function exportHtml(scope) {
    const report = await pages.transition(async () => {
        await pages.save();
        return withProgress(() => api.exportHtml(scope, exportTexts()));
    });
    if (!report) return;
    showToast(t("export.done", { pages: report.pages, folder: report.folder }));
    await api.showExport();
}

async function toggleFullscreen() {
    await api.window.setFullscreen(!(await api.window.isFullscreen()));
}

/** Read-only mode on or off; it is remembered like the other preferences. */
async function toggleReadOnly() {
    preferences.readOnly = !preferences.readOnly;
    try {
        await pages.setReadOnly(preferences.readOnly);
    } catch (error) {
        preferences.readOnly = !preferences.readOnly;
        throw error;
    }
    storePreferences();
    showToast(t(preferences.readOnly ? "readonly.on" : "readonly.off"));
}

const format = (name, argument) => () => editor.command(name, argument);

/**
 * `needs`: "notebook" or "page" must be open. `typing`: only while the cursor is in the
 * page text (not in a search field or dialog). `hidden`: not offered in the palette.
 */
export const COMMANDS = [
    { id: "page.new", group: "file", keys: "Ctrl+N", needs: "notebook", run: () => pageOps.openNewPageForm(pageOps.namePrefix(false)) },
    { id: "page.newSub", group: "file", keys: "Ctrl+Shift+N", needs: "page", run: () => pageOps.openNewPageForm(pageOps.namePrefix(true)) },
    { id: "page.rename", group: "file", keys: "F2", needs: "page", run: () => pageOps.rename(state.page) },
    { id: "page.delete", group: "file", needs: "page", run: () => pageOps.remove(state.page) },
    { id: "page.save", group: "file", keys: "Ctrl+S", needs: "page", run: () => pages.save() },
    { id: "page.reload", group: "file", keys: "Ctrl+R", needs: "page", run: () => pages.reload() },
    { id: "page.copyName", group: "file", keys: "Ctrl+Shift+L", needs: "page", run: () => pageOps.copyName(state.page) },
    { id: "page.folder", group: "file", needs: "page", run: () => api.openFolder(state.page) },
    { id: "page.print", group: "file", keys: "Ctrl+P", needs: "page", run: () => api.printPage(state.page, editor.getText(), exportTexts()) },
    { id: "export.page", group: "file", needs: "page", run: () => exportHtml(state.page) },
    { id: "export.notebook", group: "file", needs: "notebook", run: () => exportHtml(null) },
    { id: "notebook.switch", group: "file", keys: "Ctrl+O", run: () => notebooks.manage() },
    { id: "settings.open", group: "file", keys: "Ctrl+Comma", run: () => thenFocusText(openSettings()) },
    { id: "help.open", group: "file", keys: "F1", run: () => thenFocusText(openHelp()) },
    { id: "about.open", group: "file", run: () => thenFocusText(openAbout()) },
    { id: "vault.manage", group: "file", needs: "notebook", run: () => vault.manage() },
    { id: "vault.togglePage", group: "file", needs: "page", run: () => vault.togglePageEncrypted() },
    { id: "vault.lock", group: "file", needs: "notebook", run: () => vault.lock() },
    { id: "window.close", group: "file", keys: "Ctrl+Q", run: () => api.window.close() },

    { id: "nav.jump", group: "navigate", keys: "Ctrl+J", needs: "notebook", run: jumpTo },
    { id: "nav.palette", group: "navigate", keys: "Ctrl+Shift+P", hidden: true, run: openPalette },
    { id: "nav.back", group: "navigate", keys: "Alt+Left", needs: "notebook", run: () => pages.moveHistory(-1) },
    { id: "nav.forward", group: "navigate", keys: "Alt+Right", needs: "notebook", run: () => pages.moveHistory(1) },
    { id: "nav.parent", group: "navigate", keys: "Alt+Up", needs: "page", run: goParent },
    { id: "nav.child", group: "navigate", keys: "Alt+Down", needs: "page", run: goChild },
    { id: "nav.previous", group: "navigate", keys: "Alt+PgUp", needs: "page", run: () => goNeighbour(-1) },
    { id: "nav.next", group: "navigate", keys: "Alt+PgDn", needs: "page", run: () => goNeighbour(1) },
    { id: "nav.home", group: "navigate", keys: "Alt+Home", needs: "notebook", run: () => pages.open(state.notebook.home) },
    { id: "search.all", group: "navigate", keys: "Ctrl+Shift+F", needs: "notebook", run: focusSearch },
    { id: "search.page", group: "navigate", keys: "Ctrl+F", needs: "page", run: format("find") },
    { id: "recent.show", group: "navigate", needs: "notebook", run: showRecent },
    { id: "tasks.show", group: "navigate", needs: "notebook", run: () => taskList.toggle() },

    { id: "view.sidebar", group: "view", keys: "F9", needs: "notebook", run: toggleSidebar },
    { id: "view.readonly", group: "view", needs: "notebook", run: toggleReadOnly },
    { id: "view.fullscreen", group: "view", keys: "F11", run: toggleFullscreen },
    { id: "view.zoomIn", group: "view", keys: "Ctrl+Plus", run: () => setFontSize(preferences.fontSize + 1) },
    { id: "view.zoomOut", group: "view", keys: "Ctrl+Minus", run: () => setFontSize(preferences.fontSize - 1) },
    { id: "view.zoomReset", group: "view", keys: "Ctrl+0", run: () => setFontSize(DEFAULT_PREFERENCES.fontSize) },

    { id: "format.bold", group: "format", keys: "Ctrl+B", needs: "page", typing: true, run: format("bold") },
    { id: "format.italic", group: "format", keys: "Ctrl+I", needs: "page", typing: true, run: format("italic") },
    { id: "format.mark", group: "format", keys: "Ctrl+U", needs: "page", typing: true, run: format("mark") },
    { id: "format.strike", group: "format", keys: "Ctrl+K", needs: "page", typing: true, run: format("strike") },
    { id: "format.code", group: "format", keys: "Ctrl+T", needs: "page", typing: true, run: format("code") },
    { id: "format.sub", group: "format", keys: "Ctrl+Shift+B", needs: "page", typing: true, run: format("sub") },
    { id: "format.sup", group: "format", needs: "page", typing: true, run: format("sup") },
    { id: "format.heading1", group: "format", keys: "Ctrl+1", needs: "page", typing: true, run: format("heading", 1) },
    { id: "format.heading2", group: "format", keys: "Ctrl+2", needs: "page", typing: true, run: format("heading", 2) },
    { id: "format.heading3", group: "format", keys: "Ctrl+3", needs: "page", typing: true, run: format("heading", 3) },
    { id: "format.heading4", group: "format", keys: "Ctrl+4", needs: "page", typing: true, run: format("heading", 4) },
    { id: "format.heading5", group: "format", keys: "Ctrl+5", needs: "page", typing: true, run: format("heading", 5) },
    { id: "format.heading0", group: "format", keys: "Ctrl+7", needs: "page", typing: true, run: format("heading", 0) },
    { id: "format.clear", group: "format", keys: "Ctrl+9", needs: "page", typing: true, run: format("clear") },
    { id: "format.bullet", group: "format", needs: "page", typing: true, run: format("bullet") },
    { id: "format.number", group: "format", needs: "page", typing: true, run: format("number") },
    { id: "format.check", group: "format", needs: "page", typing: true, run: format("check") },
    { id: "format.checkDone", group: "format", keys: "F12", needs: "page", typing: true, run: format("toggleCheck", "*") },
    { id: "format.checkFailed", group: "format", keys: "Shift+F12", needs: "page", typing: true, run: format("toggleCheck", "x") },

    { id: "insert.link", group: "insert", keys: "Ctrl+L", needs: "page", typing: true, run: editLink },
    { id: "insert.editLink", group: "insert", keys: "Ctrl+E", needs: "page", typing: true, hidden: true, run: editLink },
    { id: "insert.date", group: "insert", keys: "Ctrl+D", needs: "page", typing: true, run: insertDate },
    { id: "task.dates", group: "insert", keys: "Ctrl+Shift+D", needs: "page", typing: true, run: setTaskDates },
    { id: "insert.attachment", group: "insert", needs: "page", run: insertAttachment },
    { id: "insert.table", group: "insert", needs: "page", typing: true, run: () => editor.command("insert", `\n${tableMarkup(3, 2, t("table.column"))}\n\n`) },
    { id: "insert.rule", group: "insert", needs: "page", typing: true, run: () => editor.command("insert", "\n--------------------\n") },
];

function available(command) {
    if (command.needs === "notebook") return Boolean(state.notebook);
    if (command.needs === "page") return Boolean(state.page) && !$("page").hidden;
    return true;
}

function run(command) {
    return available(command) ? Promise.resolve().then(() => command.run()).catch(fail) : Promise.resolve();
}

/** Runs a command by id; used by buttons and menus. */
export function runById(id) {
    const command = COMMANDS.find((candidate) => candidate.id === id);
    return command ? run(command) : Promise.resolve();
}

async function openPalette() {
    const language = currentLanguage();
    const entries = COMMANDS.filter((command) => available(command) && !command.hidden).map((command) => ({
        text: t(`cmd.${command.id}`),
        detail: t(`group.${command.group}`),
        hint: shortcutLabel(command.keys, language),
        command,
    }));
    const choice = await pick({ title: t("cmd.nav.palette"), entries });
    if (choice) await run(choice.command);
    else editor.focus();
}

// Capture phase: the editor's own key bindings must not see these first.
window.addEventListener(
    "keydown",
    (event) => {
        if (event.defaultPrevented || event.isComposing) return;
        if (document.querySelector("dialog[open]") || !$("lightbox").hidden) return;
        const active = document.activeElement;
        const inField = Boolean(active?.closest?.("input, textarea, select")) && !$("editor").contains(active);
        for (const command of COMMANDS) {
            if (!command.keys || !matchesShortcut(event, command.keys)) continue;
            if (command.typing && inField) return;
            if (!available(command)) return;
            event.preventDefault();
            event.stopPropagation();
            run(command);
            return;
        }
    },
    true,
);

for (const element of document.querySelectorAll("[data-command]")) {
    element.addEventListener("click", () => runById(element.dataset.command));
}
