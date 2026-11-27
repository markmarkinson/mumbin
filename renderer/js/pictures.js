// Pictures of the page: object URLs for the ones in the text, and the large view.

import { api } from "./bridge.js";
import { pictureType } from "./attachments.js";
import { editor } from "./editor.js";
import { state } from "./state.js";
import { $ } from "./ui.js";

/** Object URLs (as promises) of the pictures of the current page, by page and source. */
const urls = new Map();

/** Object URL for a picture of the current page; read once per page. */
export function load(source) {
    const page = state.page || "";
    const key = `${page}\n${source}`;
    if (!urls.has(key)) {
        const type = pictureType(source) ?? "application/octet-stream";
        const url = api.readPicture(page, source).then((bytes) => URL.createObjectURL(new Blob([bytes], { type })));
        url.catch(() => urls.delete(key));
        urls.set(key, url);
    }
    return urls.get(key);
}

export function clear() {
    for (const url of urls.values()) url.then((value) => URL.revokeObjectURL(value), () => {});
    urls.clear();
}

/** Shows a picture large: fitted to the window first, a click shows its real size. */
export function open({ src, alt }) {
    const box = $("lightbox");
    $("lightbox-img").alt = alt || "";
    $("lightbox-img").src = src;
    box.classList.remove("actual");
    box.hidden = false;
    $("lightbox-close").focus();
}

export function close() {
    $("lightbox").hidden = true;
    $("lightbox-img").removeAttribute("src");
    $("lightbox-img").alt = "";
    editor.focus();
}

$("lightbox").addEventListener("click", (event) => {
    if (event.target === $("lightbox-img")) $("lightbox").classList.toggle("actual");
    else close();
});

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || $("lightbox").hidden) return;
    event.preventDefault();
    close();
});
