// The settings kept next to the program (font size, language, ...).

import { api } from "./bridge.js";
import { clampFontSize } from "./commands.js";
import { currentLanguage, setLanguage } from "./i18n.js";
import { state } from "./state.js";
import { $ } from "./ui.js";

/** Minutes without input after which the vault locks itself; 0 = never. */
const AUTO_LOCK_CHOICES = [0, 1, 5, 10, 30, 60];

export const DEFAULT_PREFERENCES = { fontSize: 15, pageTemplate: true, sidebar: true, readOnly: false, autoLockMinutes: 10 };

/** The current values; change them, then call `applyPreferences` and `storePreferences`. */
export const preferences = { ...DEFAULT_PREFERENCES };

export function applyPreferences() {
    preferences.fontSize = clampFontSize(preferences.fontSize);
    document.documentElement.style.setProperty("--editor-font-size", `${preferences.fontSize}px`);
    if (state.notebook) $("sidebar").hidden = !preferences.sidebar;
}

export function storePreferences() {
    api.savePreferences({ ...preferences, language: currentLanguage() }).catch(() => {});
}

/** Takes what the shell read from disk; values of the wrong kind are ignored. */
export function loadPreferences(stored) {
    if (stored && typeof stored === "object") {
        for (const key of Object.keys(DEFAULT_PREFERENCES)) {
            if (typeof stored[key] === typeof DEFAULT_PREFERENCES[key]) preferences[key] = stored[key];
        }
        if (stored.language === "de" || stored.language === "en") setLanguage(stored.language);
    }
    if (!AUTO_LOCK_CHOICES.includes(preferences.autoLockMinutes)) preferences.autoLockMinutes = DEFAULT_PREFERENCES.autoLockMinutes;
    applyPreferences();
}

export function setFontSize(size) {
    preferences.fontSize = clampFontSize(size);
    applyPreferences();
    storePreferences();
}

/** Shows the sidebar if it was hidden: the commands that use it need it. */
export function revealSidebar() {
    preferences.sidebar = true;
    applyPreferences();
}

export function toggleSidebar() {
    preferences.sidebar = !preferences.sidebar;
    applyPreferences();
    storePreferences();
}
