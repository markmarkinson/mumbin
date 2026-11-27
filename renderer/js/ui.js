// Small helpers every part of the window uses: DOM building, toast, progress bar,
// error reporting.

import { api } from "./bridge.js";
import { errorText } from "./i18n.js";

const TOAST_MS = 5000;

/** The padlock that marks everything encrypted or protected. */
export const LOCK = "\u{1F512}";

export const $ = (id) => document.getElementById(id);

/**
 * Builds an element. `props` are assigned as DOM properties, except `dataset`,
 * `attrs` (attributes) and `on` (event listeners).
 */
export function el(tag, props = {}, ...children) {
    const { dataset, attrs, on, ...properties } = props;
    const element = Object.assign(document.createElement(tag), properties);
    Object.assign(element.dataset, dataset);
    for (const [name, value] of Object.entries(attrs ?? {})) element.setAttribute(name, value);
    for (const [type, handler] of Object.entries(on ?? {})) element.addEventListener(type, handler);
    element.append(...children);
    return element;
}

export const button = (props, ...children) => el("button", { type: "button", ...props }, ...children);

/** A hint for the mouse and the screen reader at once. */
export function setTip(element, text) {
    element.title = text;
    element.setAttribute("aria-label", text);
}

/** Runs the click handler of a fixed button; a failure becomes a message. */
export function onClick(id, handler) {
    $(id).addEventListener("click", () => Promise.resolve(handler()).catch(fail));
}

/** Tells the person what went wrong and leaves a line in the log file. */
export function fail(error) {
    console.error(error);
    const shown = errorText(error);
    showToast(shown);
    api.log(`${error?.code ?? "error"}: ${error?.message ?? error} (${shown})`);
}

let toastTimer = null;

export function showToast(text) {
    const toast = $("toast");
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, TOAST_MS);
}

let busy = 0;

/** Shows the animated bar while `work` runs. */
export async function withProgress(work) {
    busy += 1;
    $("loading").hidden = false;
    try {
        return await work();
    } finally {
        busy -= 1;
        if (busy === 0) $("loading").hidden = true;
    }
}
