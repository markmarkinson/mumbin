// The frame of the window: title bar buttons, and closing.

import { api } from "./bridge.js";
import * as actions from "./actions.js";
import * as dock from "./dock.js";
import { editor } from "./editor.js";
import * as notebooks from "./notebooks.js";
import * as pages from "./pages.js";
import { state } from "./state.js";
import * as taskList from "./tasklist.js";
import * as tree from "./tree.js";
import { $, fail, onClick } from "./ui.js";

/** Redraws everything that shows translated text. */
export function languageChanged() {
    editor.refreshPlaceholder();
    pages.showSaveState();
    notebooks.renderRecent().catch(() => {});
    if (!state.notebook) return undefined;
    dock.languageChanged();
    taskList.languageChanged();
    return Promise.all([tree.refresh(), dock.refreshBacklinks()]).catch(fail);
}

onClick("win-min", () => api.window.minimize());
onClick("win-max", () => api.window.toggleMaximize());
onClick("win-close", () => api.window.close());
onClick("readonly-badge", () => actions.runById("view.readonly"));

// Nothing typed may be lost when the window closes.
api.window
    .onCloseRequested(async (event) => {
        event.preventDefault();
        try {
            await pages.transition(async () => {
                await pages.save();
                pages.rememberPosition();
                await api.window.destroy();
            });
        } catch (error) {
            fail(error);
        }
    })
    .catch(fail);
