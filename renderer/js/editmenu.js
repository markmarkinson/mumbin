// Right click in the text: our own edit menu instead of the one of the web engine, which
// looks foreign and cannot be translated. Everywhere else the engine's menu stays hidden.

import { api } from "./bridge.js";
import { editor } from "./editor.js";
import { createPopup } from "./menus.js";
import { state } from "./state.js";
import { $, fail } from "./ui.js";

const menu = $("edit-menu");
const popup = createPopup(menu);
let target = null;

const isField = (element) => element?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea");
const inEditor = (element) => Boolean(element?.closest?.(".cm-editor"));

/** The text the command would act on. */
const selected = () => (inEditor(target) ? editor.context().text : target.value.slice(target.selectionStart, target.selectionEnd));
const readOnly = () => (inEditor(target) ? state.readOnly || state.locked : target.readOnly);

function enable() {
    const hasSelection = selected() !== "";
    const writable = !readOnly();
    const set = (name, on) => (menu.querySelector(`[data-edit="${name}"]`).disabled = !on);
    set("undo", writable);
    set("cut", writable && hasSelection);
    set("copy", hasSelection);
    set("paste", writable);
    set("selectAll", true);
}

const commands = {
    undo: () => (inEditor(target) ? editor.command("undo") : document.execCommand("undo")),
    cut: () => document.execCommand("cut"),
    copy: () => document.execCommand("copy"),
    selectAll: () => (inEditor(target) ? editor.command("selectAll") : target.select()),
    async paste() {
        const text = await api.clipboardText();
        if (!text) return;
        if (inEditor(target)) editor.command("insert", text);
        else document.execCommand("insertText", false, text);
    },
};

menu.addEventListener("mousedown", (event) => event.preventDefault()); // the text keeps the focus
menu.addEventListener("click", async (event) => {
    const name = event.target.closest("[data-edit]")?.dataset.edit;
    if (!name) return;
    const field = target;
    popup.close();
    field.focus();
    try {
        await commands[name]();
    } catch (error) {
        fail(error);
    }
});

document.addEventListener("contextmenu", (event) => {
    // The page tree has its own menu and has already taken the event.
    if (event.defaultPrevented) return;
    event.preventDefault();
    const element = event.target;
    if (!inEditor(element) && !isField(element)) return;
    target = inEditor(element) ? element.closest(".cm-content") ?? element : element;
    enable();
    popup.open(event.clientX, event.clientY);
});
