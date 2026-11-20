// Files that come into the page from outside: pasted from the clipboard or dragged in
// from the file manager.

import { api } from "./bridge.js";
import { insertionText } from "./attachments.js";
import { showDialog } from "./dialogs.js";
import * as dock from "./dock.js";
import { editor } from "./editor.js";
import { t } from "./i18n.js";
import * as pages from "./pages.js";
import { currentView, state } from "./state.js";
import { isoDate } from "./tasks.js";
import { $, fail, showToast } from "./ui.js";

const MAX_PASTE_BYTES = 20 * 1024 * 1024;

/** Screenshots arrive as a generic "image.png": those, and files without a name, are named by the date. */
function storedName(file, day) {
    const isImage = file.type.startsWith("image/");
    if (file.name && !(isImage && /^image\.\w+$/i.test(file.name))) return file.name;
    const extension = file.type.split("/")[1]?.replace("jpeg", "jpg").replace(/\+.*/, "") || "png";
    return `pasted_image_${day}.${extension}`;
}

/** Base names of dropped paths, shortened for the question. */
function droppedNames(paths) {
    const names = paths.map((path) => path.split(/[\\/]/).pop());
    return names.length > 3 ? `${names.slice(0, 3).join(", ")} … (${names.length})` : names.join(", ");
}

/** Asks whether dropped files are copied or only linked; null when cancelled. */
function askDrop(paths) {
    return showDialog($("dlg-drop"), {
        collect: () => "copy",
        onOpen(finish) {
            $("dlg-drop-text").textContent = t("drop.text", { names: droppedNames(paths) });
            $("dlg-drop-link").onclick = () => finish("link");
            setTimeout(() => $("dlg-drop-copy").focus(), 0);
        },
    });
}

/** Stores pasted files as attachments and returns the text that refers to them. */
export async function paste(files) {
    const { page, same } = currentView();
    if (!page) return "";
    return pages.transition(async () => {
        if (!same()) return "";
        const day = isoDate(new Date()).replaceAll("-", "");
        const lines = [];
        try {
            for (const file of files) {
                if (file.size > MAX_PASTE_BYTES) {
                    showToast(t("attach.tooBig", { mb: MAX_PASTE_BYTES / 1024 / 1024 }));
                    continue;
                }
                const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
                const stored = await api.storeAttachment(page, storedName(file, day), bytes);
                lines.push(file.type.startsWith("image/") ? `{{./${stored}}}` : `[[./${stored}]]`);
            }
        } catch (error) {
            fail(error);
        }
        dock.refreshAttachments();
        return lines.length ? `${lines.join("\n")}\n` : "";
    });
}

/** Takes files dropped on the window into the open page, at the position they were dropped. */
export async function drop(paths, position) {
    if (!paths.length) return;
    const { page, same } = currentView();
    if (!page || $("page").hidden) {
        showToast(t("drop.noPage"));
        return;
    }
    const choice = await askDrop(paths);
    if (!choice || !same()) return;
    // Tauri reports physical pixels; the editor works in CSS pixels.
    const scale = window.devicePixelRatio || 1;
    const dropAt = position ? editor.posAtPoint(position.x / scale, position.y / scale) : null;
    const result = await pages.transition(async () => {
        if (!same()) return null;
        await pages.save();
        return api.dropPaths(page, paths, choice === "link");
    });
    if (!result) return;
    if (result.texts.length && same()) {
        const doc = editor.getText();
        const at = Math.min(dropAt ?? editor.context().to, doc.length);
        editor.replaceRange(at, at, insertionText(doc, at, result.texts));
    }
    if (result.added.length) showToast(t("attach.added", { names: result.added.join(", ") }));
    if (result.skipped.length) showToast(t("drop.skipped", { names: result.skipped.join(", ") }));
    dock.refreshAttachments();
}

/** Events of a file being dragged over the window, from Tauri. */
export function dragEvent(payload) {
    const hovering = payload.type === "enter" || payload.type === "over";
    const content = document.querySelector(".content");
    content.dataset.dropHint = t("drop.hint");
    content.classList.toggle("drop-active", hovering && Boolean(state.page));
    if (payload.type === "drop") drop(payload.paths ?? [], payload.position).catch(fail);
}
