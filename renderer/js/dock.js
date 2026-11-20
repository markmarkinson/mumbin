// The dock below the page tree: links to the page, attachments, tags and the outline.
// Pure logic lives in attachments.js and outline.js.

import { api } from "./bridge.js";
import { DOCK_TABS, formatSize, insertTextFor, intersect, paddedInsertion, toggleTag } from "./attachments.js";
import { showDialog } from "./dialogs.js";
import { editor } from "./editor.js";
import { currentLanguage, t } from "./i18n.js";
import { openFileTarget } from "./links.js";
import { activeEntry, tocEntries } from "./outline.js";
import * as pages from "./pages.js";
import { currentView, state } from "./state.js";
import { recall, remember } from "./storage.js";
import { $, LOCK, button, el, fail, onClick, setTip, showToast } from "./ui.js";
import { outline } from "./wiki.js";

const TAB_KEY = "dock";
export const FOLDED_KEY = "dock:folded";
const OUTLINE_REDRAW_MS = 250;

const emptyNote = (text) => el("p", { className: "dock-empty", textContent: text });

/** A small round button with an icon character and a tooltip. */
function iconButton(className, icon, tip, handler = null) {
    const element = button({ className, textContent: icon, on: handler ? { click: handler } : {} });
    setTip(element, tip);
    return element;
}

// Counts the times the tag view was cleared; an answer that arrives after that is dropped.
let generation = 0;
const savedTab = recall(TAB_KEY);
let tab = DOCK_TABS.includes(savedTab) ? savedTab : "backlinks";

/** Folds the dock down to its row of tabs, which leaves the room to the page tree. */
function fold(folded) {
    $("dock").classList.toggle("folded", folded);
    remember(FOLDED_KEY, folded ? "1" : "");
}

function showTab(name) {
    fold(false);
    selectTab(name);
}

function selectTab(name) {
    tab = name;
    remember(TAB_KEY, tab);
    for (const id of DOCK_TABS) $(id).hidden = id !== tab;
    for (const tabButton of $("dock").querySelectorAll("[data-dock]")) {
        tabButton.setAttribute("aria-selected", String(tabButton.dataset.dock === tab));
        tabButton.classList.toggle("active", tabButton.dataset.dock === tab);
    }
    if (tab === "attachments") refreshAttachments();
    if (tab === "tags") refreshTags().catch(fail);
    if (tab === "outline") renderOutlineIfStale();
}

$("dock").addEventListener("click", (event) => {
    const name = event.target.closest("[data-dock]")?.dataset.dock;
    if (!name) return;
    // A second click on the open tab folds the dock away.
    if (name === tab && !$("dock").classList.contains("folded")) fold(true);
    else showTab(name);
});

export async function refreshBacklinks() {
    const { page, same } = currentView();
    const names = await api.backlinks(page);
    if (!same()) return;
    $("backlinks").replaceChildren(
        el("h3", { textContent: t("links.backlinks") }),
        ...(names.length ? [] : [el("p", { textContent: t("links.none") })]),
        ...names.map((name) => button({ className: "search-hit", textContent: name, on: { click: () => pages.open(name).catch(fail) } })),
    );
}

let attachmentList = [];

function attachmentRow(attachment) {
    const insertText = insertTextFor(attachment);
    const open = button(
        { className: "attach-open", title: t("attach.open"), on: { click: () => openFileTarget(`./${attachment.name}`).catch(fail) } },
        el("span", { className: "attach-name", textContent: attachment.encrypted ? `${LOCK} ${attachment.name}` : attachment.name }),
        el("span", { className: "attach-size", textContent: formatSize(attachment.size, currentLanguage()) }),
    );
    const insert = iconButton("attach-insert", "↵", t("attach.insert"), () => {
        if (insertText === null || $("page").hidden) return;
        const { to } = editor.context();
        editor.replaceRange(to, to, paddedInsertion(editor.getText(), to, insertText));
    });
    insert.disabled = insertText === null;
    const rename = iconButton("attach-insert attach-rename", "✎", t("attach.rename"), () => renameAttachment(attachment.name).catch(fail));
    const remove = iconButton("attach-insert attach-delete", "✕", t("attach.delete"), () => deleteAttachment(attachment.name).catch(fail));
    return el("div", { className: "attach", dataset: { name: attachment.name } }, open, insert, rename, remove);
}

function renderAttachments() {
    $("attachments-count").textContent = attachmentList.length ? String(attachmentList.length) : "";
    $("attach-list").replaceChildren(...(attachmentList.length ? attachmentList.map(attachmentRow) : [emptyNote(t("attach.empty"))]));
}

export async function refreshAttachments() {
    const { page, same } = currentView();
    if (!page) return;
    let list = [];
    try {
        list = await api.attachments(page);
    } catch (error) {
        fail(error);
    }
    if (!same()) return;
    attachmentList = list;
    renderAttachments();
}

/** Asks for a new name and renames the file; links on the page follow. */
async function renameAttachment(file) {
    const { page, same } = currentView();
    if (!page) return;
    const input = $("dlg-attach-rename-input");
    const confirmed = await showDialog($("dlg-attach-rename"), {
        onOpen() {
            input.value = file;
            input.focus();
            // Select the name without its extension, right away: a timer could overwrite a Ctrl+A.
            const dot = file.lastIndexOf(".");
            input.setSelectionRange(0, dot > 0 ? dot : file.length);
        },
    });
    const newName = input.value.trim();
    if (!confirmed || !newName || newName === file) return;
    await pages.transition(async () => {
        if (!same()) return;
        await pages.save();
        const result = await api.renameAttachment(page, file, newName);
        showToast(t("attach.renamed", { name: result.name, links: result.linksUpdated }));
        if (result.linksUpdated > 0) await pages.load(page, false);
        await refreshAttachments();
    });
}

async function deleteAttachment(file) {
    const { page, same } = currentView();
    if (!page) return;
    $("dlg-attach-delete-text").textContent = t("attach.deleteText", { name: file });
    if (!(await showDialog($("dlg-attach-delete")))) return;
    await pages.transition(async () => {
        if (!same()) return;
        await api.deleteAttachment(page, file);
        showToast(t("attach.deleted", { name: file }));
        await refreshAttachments();
    });
}

/** Lets the person choose files and stores them with the page; resolves to their names. */
export async function addAttachments() {
    const { page, same } = currentView();
    if (!page) return [];
    const added = await pages.transition(async () => {
        if (!same()) return [];
        await pages.save();
        return api.addAttachments(page, t("attach.add"));
    });
    if (!same()) return [];
    await refreshAttachments();
    return added;
}

onClick("btn-attach-add", async () => {
    const added = await addAttachments();
    if (added.length) showToast(t("attach.added", { names: added.join(", ") }));
});
onClick("btn-attach-folder", () => {
    if (state.page) return api.openFolder(state.page);
});

const tagView = { all: [], selected: [], pages: [] };

async function loadTagPages() {
    const started = generation;
    const lists = await Promise.all(tagView.selected.map((tag) => api.tagPages(tag)));
    if (started === generation) tagView.pages = intersect(lists);
}

function tagChip({ tag, count }) {
    const on = tagView.selected.includes(tag);
    const chip = button({ className: "tag-chip", dataset: { tag }, textContent: `@${tag} ` }, el("span", { className: "count", textContent: String(count) }));
    chip.classList.toggle("active", on);
    chip.setAttribute("aria-pressed", String(on));
    return chip;
}

function renderTags() {
    $("tags-count").textContent = tagView.all.length ? String(tagView.all.length) : "";
    $("tag-cloud").replaceChildren(...(tagView.all.length ? tagView.all.map(tagChip) : [emptyNote(t("tags.none"))]));
    const results = $("tag-pages");
    results.replaceChildren();
    if (tagView.selected.length === 0) return;
    const clear = iconButton("ghost", "✕", t("tags.clear"));
    clear.id = "tags-clear";
    results.append(
        el("div", { className: "tag-pages-head" }, el("span", { textContent: t("tags.pages", { tags: tagView.selected.map((tag) => `@${tag}`).join(" ") }) }), clear),
        ...(tagView.pages.length ? [] : [emptyNote(t("tags.noPages"))]),
        ...tagView.pages.map((name) => button({ className: "search-hit", dataset: { page: name }, textContent: name, on: { click: () => pages.open(name).catch(fail) } })),
    );
}

async function refreshTags() {
    const started = generation;
    const tags = await api.tags();
    if (started !== generation) return;
    tagView.all = tags;
    // A tag that no page carries any more cannot stay selected.
    tagView.selected = tagView.selected.filter((tag) => tagView.all.some((entry) => entry.tag === tag));
    await loadTagPages();
    renderTags();
}

$("tag-cloud").addEventListener("click", (event) => {
    const tag = event.target.closest("[data-tag]")?.dataset.tag;
    if (!tag) return;
    tagView.selected = toggleTag(tagView.selected, tag);
    loadTagPages().then(renderTags).catch(fail);
});
$("tag-pages").addEventListener("click", (event) => {
    if (!event.target.closest("#tags-clear")) return;
    tagView.selected = [];
    tagView.pages = [];
    renderTags();
});

let outlineEntries = [];
let outlineStale = true;
let outlineTimer = null;
let cursorFrame = 0;

function renderOutline() {
    outlineStale = false;
    outlineEntries = tocEntries(outline(editor.getText().split("\n")));
    $("outline-list").replaceChildren(
        ...(outlineEntries.length
            ? outlineEntries.map((entry) => {
                  const item = button({
                      className: `outline-item level-${entry.level}`,
                      textContent: entry.text,
                      title: entry.text,
                      on: { click: () => editor.goToLine(entry.line) },
                  });
                  item.style.paddingLeft = `${10 + entry.depth * 14}px`;
                  return item;
              })
            : [emptyNote(t("outline.empty"))]),
    );
    if (outlineEntries.length) markActiveHeading();
}

function markActiveHeading() {
    const active = activeEntry(outlineEntries, editor.context().line);
    const position = active ? outlineEntries.indexOf(active) : -1;
    [...$("outline-list").children].forEach((item, index) => {
        const on = index === position;
        item.classList.toggle("active", on);
        if (on) item.setAttribute("aria-current", "location");
        else item.removeAttribute("aria-current");
        if (on && !$("outline").hidden) item.scrollIntoView({ block: "nearest" });
    });
}

function renderOutlineIfStale() {
    if (outlineStale) renderOutline();
    else markActiveHeading();
}

/** A notebook was opened: the dock shows its remembered tab, folded unless it was left open. */
export function notebookShown() {
    $("dock").hidden = false;
    // Read the remembered fold state first: showing a tab unfolds the dock and would wipe it.
    // Nothing remembered yet (first start): the dock is folded down to its tabs.
    const remembered = recall(FOLDED_KEY);
    const folded = remembered === null ? true : Boolean(remembered);
    selectTab(tab);
    fold(folded);
    tagView.selected = [];
    refreshTags().catch(fail);
}

/** A page was opened: the outline follows it. */
export function pageLoaded() {
    outlineStale = true;
    if (tab === "outline") renderOutline();
}

/** The text changed: the outline is redrawn shortly after the last key, and only while it is shown. */
export function textChanged() {
    outlineStale = true;
    clearTimeout(outlineTimer);
    if (tab === "outline") outlineTimer = setTimeout(renderOutlineIfStale, OUTLINE_REDRAW_MS);
}

/** The cursor moved: the heading it is under is marked (at most once per frame). */
export function cursorMoved() {
    if (cursorFrame || tab !== "outline" || outlineStale) return;
    cursorFrame = requestAnimationFrame(() => {
        cursorFrame = 0;
        markActiveHeading();
    });
}

/** Shows the pages carrying one tag, e.g. after a click on @tag in the text. */
export function showTag(tag) {
    tagView.selected = [tag.replace(/^@/, "").toLowerCase()];
    showTab("tags");
    refreshTags().catch(fail);
}

/** Any save may add or remove tags. */
export function pageSaved() {
    if (tab === "tags") refreshTags().catch(fail);
}

export function languageChanged() {
    renderAttachments();
    renderTags();
    if (tab === "outline") renderOutline();
}

export function clearSensitiveData() {
    generation += 1;
    tagView.all = [];
    tagView.pages = [];
    tagView.selected = [];
    renderTags();
    outlineEntries = [];
    outlineStale = true;
    clearTimeout(outlineTimer);
    $("outline-list").replaceChildren();
}
