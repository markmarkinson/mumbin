// What a click on a link in the text does.

import { api } from "./bridge.js";
import { t } from "./i18n.js";
import * as pages from "./pages.js";
import { state } from "./state.js";
import { showToast } from "./ui.js";

/** Bare "www.…" and mail addresses get their scheme; the shell decides which schemes it opens. */
function webAddress(target) {
    if (/^www\./i.test(target)) return `https://${target}`;
    if (/^[^\s@:/]+@[^\s@/]+\.[^\s@/]+$/.test(target)) return `mailto:${target}`;
    return target;
}

/** Opens a file link of the current page; programs are only shown, never started. */
export async function openFileTarget(target) {
    const result = await api.openFile(state.page, target);
    if (result.outcome === "missing") showToast(t("attach.missing", { path: result.path }));
    else if (result.outcome === "revealed") showToast(t("attach.revealed"));
    else if (result.outcome === "remote") showToast(t("attach.remote"));
}

/** @param {{kind: string, target: string}} link */
export function openLink(link) {
    if (link.kind === "file") return openFileTarget(link.target);
    if (link.kind === "url") return api.openUrl(webAddress(link.target));
    return api.resolveLink(state.page, link.target).then((resolved) => pages.follow(resolved));
}
