// What the tests do with the app again and again: wait for the start, jump to
// a page, run a palette command, wait for a save or a toast, read lists, call a
// Tauri command. `launch` (harness.mjs) mixes these into the driver, so a test
// reads `app.jump("Garten")`. Selectors, ids and texts are the app's frozen contract.

import assert from "node:assert/strict";
import { waitUntil } from "./wait.mjs";

const json = JSON.stringify;
const query = (selector) => `document.querySelector(${json(selector)})`;
const queryAll = (selector) => `[...document.querySelectorAll(${json(selector)})]`;
const withoutSpaces = (text) => text.replace(/\s+/g, "");

/** The longer wait for work the program does on disk. */
const DISK_TIMEOUT = 8000;
/** A little longer than the autosave delay (1200 ms) of the editor. */
const AUTOSAVE_SETTLE_MS = 1800;

/** @param {object} app the driver that `launch` is building */
export function pageActions(app) {
    const { evaluate, waitFor } = app;

    const actions = {
        /** Waits until the shell is up and (unless `page` is false) the first page is shown. */
        async ready({ page = true } = {}) {
            await waitFor("document.body.classList.contains('ready')");
            if (page) await waitFor("!document.querySelector('#page')?.hidden");
        },

        // ── Reading the screen ──────────────────────────────────────────────
        /** Breadcrumb text without any whitespace, e.g. "ProjekteGarten". */
        async crumbs() {
            return withoutSpaces((await app.text("#crumbs")) ?? "");
        },
        waitForPage: (name, options) =>
            waitFor(`${query("#crumbs")}?.textContent.replace(/\\s+/g, '').endsWith(${json(withoutSpaces(name))})`, options),
        editorText: () => evaluate("window.__mumbin.getText()"),
        /** Text of every element matching `selector`, trimmed. */
        texts: (selector) => evaluate(`${queryAll(selector)}.map((e) => e.textContent.trim())`),
        /** `data-<key>` of every element matching `selector`. */
        data: (selector, key) => evaluate(`${queryAll(selector)}.map((e) => e.dataset[${json(key)}])`),
        count: (selector) => evaluate(`document.querySelectorAll(${json(selector)}).length`),
        waitForCount: (selector, count, options) => waitFor(`document.querySelectorAll(${json(selector)}).length === ${count}`, options),
        waitDialog: (id, options) => waitFor(`document.getElementById(${json(id)}).open === true`, options),
        waitDialogClosed: (id, options) => waitFor(`document.getElementById(${json(id)}).open === false`, options),

        /**
         * Waits for a toast whose text contains `wanted` (a string or RegExp; any toast if omitted)
         * and returns its text.
         */
        async waitToast(wanted, { timeout = 15000 } = {}) {
            let last = null;
            const matches = (text) => (wanted instanceof RegExp ? wanted.test(text) : text.includes(wanted ?? ""));
            try {
                return await waitUntil(
                    async () => {
                        last = await evaluate("(() => { const t = document.querySelector('#toast'); return t && !t.hidden ? t.textContent : null; })()");
                        return last && matches(last) ? last : false;
                    },
                    { timeout, what: `a toast with ${wanted ?? "text"}` },
                );
            } catch (error) {
                throw new Error(`${error.message} (toast: ${json(last)})`);
            }
        },

        // ── Setting values ──────────────────────────────────────────────────
        /** Sets an input's value and, if `event` is given, tells the app about it. */
        setValue: (selector, value, event = null) =>
            evaluate(`(() => { const e = ${query(selector)}; e.value = ${json(value)}; ${event ? `e.dispatchEvent(new Event(${json(event)}, { bubbles: true }));` : ""} })()`),
        setChecked: (selector, checked, event = null) =>
            evaluate(`(() => { const e = ${query(selector)}; e.checked = ${checked}; ${event ? `e.dispatchEvent(new Event(${json(event)}, { bubbles: true }));` : ""} })()`),
        /** Clicks the element of `selector` whose text is exactly `text` (by coordinates: CodeMirror undoes foreign DOM changes). */
        clickText: (selector, text) =>
            app.clickElement(`${queryAll(selector)}.find((e) => e.textContent === ${json(text)})`),

        // ── Navigating ──────────────────────────────────────────────────────
        openDock: (tab) => app.click(`[data-dock="${tab}"]`),
        /** Clicks a page in the tree and waits until it is shown. */
        async openFromTree(name, options) {
            await app.click(`.tree-row[data-page="${name}"] .tree-label`);
            await actions.waitForPage(name.split(":").pop(), options);
        },
        async openPalette() {
            await app.press("p", { ctrl: true, shift: true });
            await actions.waitDialog("dlg-palette");
        },
        /** Runs a palette command by (part of) its name; `listed` is the text its row must show. */
        async command(words, listed = words) {
            await actions.openPalette();
            await app.type(words);
            await waitFor(`${query("#palette-list li")}?.textContent.includes(${json(listed)})`);
            await app.press("Enter");
            await actions.waitDialogClosed("dlg-palette");
        },
        /** Ctrl+J: opens (or creates) a page; `crumb` is what the breadcrumb ends with afterwards. */
        async jump(words, crumb = words, listed = null) {
            await app.press("j", { ctrl: true });
            await actions.waitDialog("dlg-palette");
            await app.type(words);
            await waitFor(listed ? `${query("#palette-list li")}?.textContent.includes(${json(listed)})` : query("#palette-list li"));
            await app.press("Enter");
            await actions.waitForPage(crumb);
        },
        /** Opens an item of the page menu (the three dots in the page bar). */
        async pageMenu(action) {
            await app.click("#btn-page-menu");
            await waitFor("!document.querySelector('#page-menu')?.hidden");
            await app.click(`#page-menu [data-action="${action}"]`);
        },
        /** F2, then the new name; `updateLinks` is the dialog's checkbox. */
        async renamePage(name, { updateLinks = true } = {}) {
            await app.press("F2");
            await actions.waitDialog("dlg-move");
            await app.sleep(150); // the dialog selects its text on the next tick
            await actions.setValue("#dlg-move-input", name);
            await actions.setChecked("#dlg-move-links", updateLinks);
            await app.press("Enter");
        },

        // ── The editor ──────────────────────────────────────────────────────
        focusEditor: () => evaluate("document.querySelector('.cm-content').focus()"),
        /** Puts the cursor at the end of the page; a click first unless `click` is false. */
        async toEnd({ click = true } = {}) {
            if (click) await app.click(".cm-content");
            else await actions.focusEditor();
            await app.press("End", { ctrl: true });
        },
        waitSaved: () => waitFor("document.querySelector('#save-state')?.dataset.kind === 'saved'", { timeout: DISK_TIMEOUT }),
        async save() {
            await app.press("s", { ctrl: true });
            await actions.waitSaved();
        },
        /** Waits long enough for the autosave to have fired, to prove that it must not write. */
        settle: () => app.sleep(AUTOSAVE_SETTLE_MS),

        // ── The program's commands ──────────────────────────────────────────
        /** Calls a Tauri command from the page; never throws. Binary results come back as byte arrays. */
        invoke: (command, args = {}) =>
            evaluate(`(async () => {
                const start = performance.now();
                try {
                    const value = await window.__TAURI__.core.invoke(${json(command)}, ${json(args)});
                    return { ok: true, value: value && value.byteLength !== undefined ? [...new Uint8Array(value)] : value, ms: performance.now() - start };
                } catch (error) {
                    return { ok: false, error, code: error?.code, ms: performance.now() - start };
                }
            })()`),
        /** Calls a Tauri command that must succeed and returns its value. */
        async call(command, args) {
            const result = await actions.invoke(command, args);
            assert.ok(result.ok, `${command} failed: ${json(result.error)}`);
            return result.value;
        },

        // ── Notebooks and the vault ─────────────────────────────────────────
        /** Creates a notebook from the notebook manager (the folder comes from `MUMBIN_E2E_PICK_DIR`). */
        async createNotebook(name) {
            await app.click("#btn-notebook");
            await actions.waitDialog("dlg-notebooks");
            await app.click("#notebooks-create");
            await actions.waitDialog("dlg-name");
            await app.type(name);
            await app.press("Enter");
        },
        waitUnlockDialog: (options) =>
            waitFor("document.getElementById('dlg-vault').open === true && document.getElementById('dlg-vault').dataset.mode === 'unlock'", { timeout: 15000, ...options }),
        /** Types into the passphrase fields that are shown (Tab between them) and confirms. */
        async passphrase(...values) {
            await actions.waitDialog("dlg-vault");
            await waitFor("document.activeElement?.closest('#dlg-vault') !== null");
            const [first, ...rest] = values;
            await app.type(first);
            for (const value of rest) {
                await app.press("Tab");
                await app.type(value);
            }
            await app.click("#vault-confirm");
        },

        /** Fails the test if the window logged errors (exactly `count` of them are expected). */
        expectConsoleErrors(count = 0) {
            assert.equal(app.consoleErrors.length, count, app.consoleErrors.join("\n"));
        },
    };
    return actions;
}
