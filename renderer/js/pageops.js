// Creating, renaming, moving and deleting pages.

import { api } from "./bridge.js";
import { showDialog } from "./dialogs.js";
import * as dock from "./dock.js";
import { editor } from "./editor.js";
import { t } from "./i18n.js";
import { isWithin, parentName, renamedName } from "./pagenames.js";
import * as pages from "./pages.js";
import { revealSidebar } from "./preferences.js";
import { state } from "./state.js";
import * as tree from "./tree.js";
import { $, fail, onClick, showToast } from "./ui.js";
import * as vault from "./vault.js";

/** Shows the name field of a new page, filled with the start of its name. */
export function openNewPageForm(prefix) {
    revealSidebar();
    $("new-page-form").hidden = false;
    const input = $("new-page-input");
    input.value = prefix;
    input.focus();
    input.setSelectionRange(prefix.length, prefix.length);
}

/** The start of a name for a page next to the open one (or below it when `below`). */
export function namePrefix(below) {
    const parent = below ? state.page : parentName(state.page || "");
    return parent ? `${parent}:` : "";
}

onClick("btn-new-page", () => {
    if ($("new-page-form").hidden) openNewPageForm(namePrefix(false));
    else $("new-page-form").hidden = true;
});

$("new-page-form").addEventListener("submit", (event) => {
    event.preventDefault();
    api.pageNameFromInput($("new-page-input").value)
        .then((name) => {
            $("new-page-form").hidden = true;
            return pages.open(name);
        })
        .catch(fail);
});

$("new-page-input").addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    $("new-page-form").hidden = true;
    editor.focus();
});

export async function rename(name) {
    const input = $("dlg-move-input");
    const choice = await showDialog($("dlg-move"), {
        onOpen() {
            input.value = name;
            input.select();
        },
        collect() {
            const to = input.value.trim();
            return to ? { to, links: $("dlg-move-links").checked } : undefined;
        },
    });
    if (!choice) return;
    await pages.transition(async () => {
        await pages.save();
        const target = await api.pageNameFromInput(choice.to);
        if (target === name) return;
        const report = await api.movePage(name, target, choice.links);
        pages.history.renamed(name, report.name);
        tree.renameExpanded(name, report.name);
        const current = state.page;
        const next = current ? renamedName(current, name, report.name) : report.name;
        await tree.refresh();
        // The lock marks belong to the pages under their new names.
        await vault.refresh();
        // Reload: links in the open page may have been rewritten.
        await pages.load(next, false);
        if (report.failed.length) showToast(t("move.linksFailed", { pages: report.failed.join(", ") }));
    });
}

export async function remove(name) {
    const size = await api.deletionSize(name);
    const permanent = size.permanent;
    $("dlg-delete-text").textContent = t(permanent ? "delete.textPermanent" : "delete.text", { name, pages: size.pages, files: size.attachments });
    $("dlg-delete-confirm").textContent = t(permanent ? "delete.confirmPermanent" : "delete.confirm");
    if (!(await showDialog($("dlg-delete")))) return;
    await pages.transition(async () => {
        await pages.save();
        await api.deletePage(name);
        pages.history.removed(name);
        tree.forgetExpanded(name);
        const current = state.page;
        await tree.refresh();
        if (current && isWithin(current, name)) await pages.load(parentName(name) || state.notebook.home);
        else await dock.refreshBacklinks();
    });
}

export async function copyName(name) {
    await navigator.clipboard.writeText(name);
    showToast(t("page.nameCopied", { name }));
}
