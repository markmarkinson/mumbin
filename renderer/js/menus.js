// The two pop-up menus: the one of a page (button next to "+" or right click in the tree)
// and the one behind the gear.

import { api } from "./bridge.js";
import * as actions from "./actions.js";
import * as pageOps from "./pageops.js";
import * as pages from "./pages.js";
import { state } from "./state.js";
import { $, fail, onClick } from "./ui.js";
import * as vault from "./vault.js";

const MARGIN = 8;
const GAP_BELOW_BUTTON = 6;

/** Wires a menu to the button that belongs to it: placing, closing on Esc and on a click elsewhere. */
export function createPopup(menu, trigger = null) {
    const isOpen = () => !menu.hidden;

    function close() {
        menu.hidden = true;
        trigger?.setAttribute("aria-expanded", "false");
    }

    /** Shows the menu with its corner (left, or right when `alignRight`) at the point, kept inside the window. */
    function open(x, y, alignRight = false) {
        menu.hidden = false;
        const { width, height } = menu.getBoundingClientRect();
        const clamp = (value, size, limit) => Math.max(MARGIN, Math.min(value, limit - size - MARGIN));
        menu.style.left = `${clamp(alignRight ? x - width : x, width, window.innerWidth)}px`;
        menu.style.top = `${clamp(y, height, window.innerHeight)}px`;
        trigger?.setAttribute("aria-expanded", "true");
        menu.querySelector("button:not(:disabled)")?.focus();
    }

    document.addEventListener("mousedown", (event) => {
        if (isOpen() && !menu.contains(event.target) && !trigger?.contains(event.target)) close();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !isOpen()) return;
        event.preventDefault();
        close();
    });
    return { open, close, isOpen };
}

const pageMenu = createPopup($("page-menu"), $("btn-page-menu"));
let menuPage = null;

/** These work on the page that is open, so a page picked in the tree is opened first. */
const showPage = (page) => (page === state.page ? Promise.resolve() : pages.open(page));

const PAGE_ACTIONS = {
    newSub: (page) => pageOps.openNewPageForm(`${page}:`),
    rename: pageOps.rename,
    delete: pageOps.remove,
    copyName: pageOps.copyName,
    folder: api.openFolder,
    toggleEncrypted: (page) => showPage(page).then(() => vault.togglePageEncrypted()),
    protectPage: (page) => showPage(page).then(() => vault.protectPage()),
    changePagePassword: (page) => showPage(page).then(() => vault.changePagePassword()),
    removePageProtection: (page) => showPage(page).then(() => vault.removePageProtection()),
    lockPage: (page) => showPage(page).then(() => vault.lockPage()),
    print: (page) => showPage(page).then(() => actions.runById("page.print")),
    exportPage: (page) => showPage(page).then(() => actions.runById("export.page")),
    exportNotebook: () => actions.runById("export.notebook"),
};

export function openPageMenu(page, x, y) {
    menuPage = page;
    vault.prepareMenu(page);
    pageMenu.open(x, y);
}

onClick("btn-page-menu", () => {
    if (pageMenu.isOpen()) return pageMenu.close();
    const box = $("btn-page-menu").getBoundingClientRect();
    return openPageMenu(state.page, box.left, box.bottom + GAP_BELOW_BUTTON);
});

$("page-menu").addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    const page = menuPage;
    pageMenu.close();
    menuPage = null;
    if (!action || !page) return;
    Promise.resolve(PAGE_ACTIONS[action](page)).catch(fail);
});

const appMenu = createPopup($("app-menu"), $("btn-menu"));
onClick("btn-menu", () => {
    if (appMenu.isOpen()) return appMenu.close();
    const box = $("btn-menu").getBoundingClientRect();
    return appMenu.open(box.right, box.bottom + GAP_BELOW_BUTTON, true);
});
$("app-menu").addEventListener("click", appMenu.close);
