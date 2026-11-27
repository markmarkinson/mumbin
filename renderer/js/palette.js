// The list picker behind the command palette, "jump to page", "insert date" and "recent pages".

import { rankEntries } from "./commands.js";
import { el, $ } from "./ui.js";

let closeOpenPalette = null;

/**
 * Lets the person pick one entry from a filtered list.
 * @param {object} options
 * @param {string} options.title
 * @param {{text: string, detail?: string, hint?: string, dim?: boolean}[]} options.entries
 * @param {(query: string, shown: object[]) => object|null} [options.create] an extra last
 *   entry made from the typed text
 * @returns {Promise<object|null>} the chosen entry, or null when cancelled
 */
export function pick({ title, entries, create = null }) {
    const palette = $("dlg-palette");
    const input = $("palette-input");
    const list = $("palette-list");
    closeOpenPalette?.(null);
    return new Promise((resolve) => {
        let shown = [];
        let selected = 0;

        const finish = (value) => {
            closeOpenPalette = null;
            input.removeEventListener("input", render);
            input.removeEventListener("keydown", onKey);
            list.removeEventListener("click", onClick);
            palette.removeEventListener("cancel", onCancel);
            palette.removeEventListener("click", onBackdrop);
            if (palette.open) palette.close();
            resolve(value);
        };
        const markSelected = () => {
            [...list.children].forEach((item, index) => {
                item.setAttribute("aria-selected", String(index === selected));
                if (index === selected) item.scrollIntoView({ block: "nearest" });
            });
        };
        const row = (entry, index) => {
            const item = el(
                "li",
                { dataset: { index: String(index) }, attrs: { role: "option" } },
                el("span", { className: "palette-text", textContent: entry.text }),
                ...(entry.detail ? [el("span", { className: "palette-detail", textContent: entry.detail })] : []),
                ...(entry.hint ? [el("kbd", { textContent: entry.hint })] : []),
            );
            item.classList.toggle("dim", Boolean(entry.dim));
            return item;
        };
        function render() {
            const query = input.value.trim();
            shown = rankEntries(query, entries);
            const extra = create && query ? create(query, shown) : null;
            // Existing entries come first: Enter opens what is there rather than creating something new.
            if (extra) shown = [...shown, extra];
            selected = 0;
            list.replaceChildren(...shown.map(row));
            $("palette-empty").hidden = shown.length > 0;
            markSelected();
        }
        function onKey(event) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (!shown.length) return;
                selected = (selected + (event.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length;
                markSelected();
            } else if (event.key === "Enter") {
                event.preventDefault();
                if (shown[selected]) finish(shown[selected]);
            }
        }
        function onClick(event) {
            const item = event.target.closest("li[data-index]");
            if (item) finish(shown[Number(item.dataset.index)]);
        }
        function onCancel(event) {
            event.preventDefault();
            finish(null);
        }
        function onBackdrop(event) {
            if (event.target === palette) finish(null);
        }

        closeOpenPalette = finish;
        $("palette-title").textContent = title;
        input.value = "";
        input.addEventListener("input", render);
        input.addEventListener("keydown", onKey);
        list.addEventListener("click", onClick);
        palette.addEventListener("cancel", onCancel);
        palette.addEventListener("click", onBackdrop);
        render();
        palette.showModal();
        input.focus();
        input.select();
    });
}
