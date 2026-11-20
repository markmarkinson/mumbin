// Starts the window. Every part of it is a module that binds its own buttons when it is
// loaded and exports what the others may call. The parts call each other in a ring (a page
// is opened from the tree, the tree is redrawn when a page is saved), which works because
// they only use each other while they run, never while they are loaded.

import { api } from "./bridge.js";
import "./actions.js";
import { languageChanged } from "./chrome.js";
import { FOLDED_KEY } from "./dock.js";
import { editor } from "./editor.js";
import "./editmenu.js";
import { dragEvent, drop } from "./files.js";
import { applyTranslations, t } from "./i18n.js";
import { placeMascots } from "./mascot.js";
import * as notebooks from "./notebooks.js";
import * as pages from "./pages.js";
import { loadPreferences, preferences } from "./preferences.js";
import { state } from "./state.js";
import { recall, remember } from "./storage.js";
import { fail, showToast } from "./ui.js";

applyTranslations();
placeMascots();

api.onDragDrop(dragEvent).catch(fail);

api.startup()
    .then((startup) => {
        // Only the end-to-end tests get this: the operating system's drag and drop cannot be scripted.
        if (startup.e2e) window.__mumbin = { dragEvent, dropFiles: drop, getText: () => editor.getText() };
        if (startup.e2eDockOpen && recall(FOLDED_KEY) === null) remember(FOLDED_KEY, "");
        state.version = startup.version;
        if (startup.notice) showToast(t(`error.${startup.notice}`));
        loadPreferences(startup.preferences);
        if (preferences.readOnly) pages.setReadOnly(true).catch(fail);
        languageChanged();
        return startup.notebook ? pages.transition(() => notebooks.show(startup.notebook)) : undefined;
    })
    .catch(fail)
    .finally(() => {
        document.body.classList.add("ready");
    });
