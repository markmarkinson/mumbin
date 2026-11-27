// Searching all pages of the notebook; the hits replace the page tree until they are closed.

import { api } from "./bridge.js";
import { t } from "./i18n.js";
import { editor } from "./editor.js";
import * as pages from "./pages.js";
import { $, button, el, fail, setTip, withProgress } from "./ui.js";

/** Hides the hits so the page tree has its room back. */
export function close() {
    $("search-results").hidden = true;
    $("search-input").value = "";
}

function show(result) {
    const closeButton = button({ className: "ghost round", textContent: "✕", on: { click: close } });
    setTip(closeButton, t("search.close"));
    $("search-results").replaceChildren(
        el("div", { className: "search-head" }, el("p", { textContent: `${result.hits.length} / ${result.total} ${t("search.results")}` }), closeButton),
        ...result.hits.map((hit) =>
            button(
                { className: "search-hit", on: { click: () => pages.open(hit.name).catch(fail) } },
                el("strong", { textContent: hit.name }),
                el("span", { textContent: hit.preview }),
            ),
        ),
    );
    $("search-results").hidden = false;
}

$("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    pages
        .transition(async () => {
            await pages.save();
            show(await withProgress(() => api.search($("search-input").value)));
        })
        .catch(fail);
});

$("search-input").addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
    editor.focus();
});

/** Forgets the hits too: they may show names of encrypted pages. */
export function clear() {
    $("search-results").replaceChildren();
    close();
}
