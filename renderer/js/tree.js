// The page tree in the sidebar.

import { api } from "./bridge.js";
import { t } from "./i18n.js";
import { mascot } from "./mascot.js";
import { openPageMenu } from "./menus.js";
import { ancestors, isWithin, renamedName } from "./pagenames.js";
import * as pages from "./pages.js";
import { state } from "./state.js";
import { $, button, el, fail } from "./ui.js";
import * as vault from "./vault.js";

function toggleBranch(name) {
    if (state.expanded.has(name)) state.expanded.delete(name);
    else state.expanded.add(name);
    refresh().catch(fail);
}

function row(entry) {
    const toggle = button({ className: "tree-toggle", tabIndex: -1 });
    if (entry.hasChildren) {
        toggle.textContent = "▸";
        toggle.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleBranch(entry.name);
        });
    } else {
        toggle.disabled = true;
    }
    const label = button({ className: "tree-label", textContent: entry.basename, on: { click: () => pages.open(entry.name).catch(fail) } });
    const element = el("div", {
        className: "tree-row",
        dataset: { page: entry.name },
        on: {
            contextmenu(event) {
                event.preventDefault();
                openPageMenu(entry.name, event.clientX, event.clientY);
            },
        },
    }, toggle, label);
    element.classList.toggle("placeholder", !entry.hasContent);
    return element;
}

/** Appends the children of `parent` (and of the open ones below) to `container`; returns how many there are. */
async function buildBranch(parent, container) {
    const entries = await api.children(parent);
    for (const entry of entries) {
        const item = el("div", { className: "tree-item", attrs: { role: "treeitem" } }, row(entry));
        if (entry.hasChildren) {
            const open = state.expanded.has(entry.name);
            item.setAttribute("aria-expanded", String(open));
            if (open) {
                const group = el("div", { className: "tree-group", attrs: { role: "group" } });
                await buildBranch(entry.name, group);
                item.append(group);
            }
        }
        container.append(item);
    }
    return entries.length;
}

export async function refresh() {
    const fresh = document.createElement("div");
    const count = await buildBranch("", fresh);
    $("tree").replaceChildren(...(count === 0 ? [el("div", { className: "tree-empty" }, mascot("awake", "empty-mascot"), el("p", { textContent: t("sidebar.empty") }))] : fresh.childNodes));
    markCurrent();
    vault.redraw();
}

export function markCurrent() {
    for (const row of $("tree").querySelectorAll(".tree-row")) {
        row.classList.toggle("current", row.dataset.page === state.page);
    }
}

/** Opens the branches above a page so that it can be seen in the tree. */
export function expandAncestors(name) {
    for (const parent of ancestors(name)) state.expanded.add(parent);
}

/** Open branches follow a rename. */
export function renameExpanded(from, to) {
    for (const name of [...state.expanded]) {
        if (!isWithin(name, from)) continue;
        state.expanded.delete(name);
        state.expanded.add(renamedName(name, from, to));
    }
}

/** Branches below a deleted page are gone. */
export function forgetExpanded(name) {
    for (const open of [...state.expanded]) if (isWithin(open, name)) state.expanded.delete(open);
}
