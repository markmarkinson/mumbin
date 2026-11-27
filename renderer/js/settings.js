// The settings dialog. Every change in it is applied and stored at once.

import { api } from "./bridge.js";
import { languageChanged } from "./chrome.js";
import { clampFontSize } from "./commands.js";
import { showDialog } from "./dialogs.js";
import { currentLanguage, setLanguage, t } from "./i18n.js";
import { applyPreferences, preferences, storePreferences } from "./preferences.js";
import { state } from "./state.js";
import { $, el, fail } from "./ui.js";
import { refresh as refreshVault } from "./vault.js";

const language = $("set-language");
const size = $("set-font-size");
const template = $("set-template");
const sidebar = $("set-sidebar");
const trash = $("set-trash");
const encryptNew = $("set-encrypt-new");
const templatePage = $("set-template-page");
// What the notebook file says now, to go back to when a change is refused.
let saved = { disableTrash: false, template: "" };

const showSize = () => {
    $("set-font-size-value").textContent = `${preferences.fontSize} px`;
};

$("dlg-settings-form").addEventListener("input", () => {
    preferences.fontSize = clampFontSize(size.value);
    preferences.pageTemplate = template.checked;
    preferences.sidebar = sidebar.checked;
    showSize();
    if (language.value !== currentLanguage()) {
        setLanguage(language.value);
        languageChanged();
    }
    applyPreferences();
    storePreferences();
});

/** Settings that belong to the open notebook (stored in its notebook file). */
async function showNotebookSettings() {
    const group = $("set-notebook");
    group.hidden = !state.notebook;
    if (!state.notebook) return;
    const [settings, vault, names] = await Promise.all([api.notebookSettings(), api.vaultStatus(), api.names()]);
    saved = settings;
    trash.checked = settings.disableTrash;
    templatePage.value = settings.template;
    $("set-template-pages").replaceChildren(...names.map((page) => el("option", { value: page.name })));
    encryptNew.checked = vault.encryptNew;
    // Pages are only encrypted with a vault; a protected notebook encrypts everything anyway.
    encryptNew.disabled = !vault.exists || vault.sealed;
    const hint = $("set-encrypt-hint");
    hint.hidden = !encryptNew.disabled;
    hint.textContent = t(vault.sealed ? "settings.encryptSealed" : "settings.encryptNone");
}

async function saveNotebookSettings() {
    try {
        saved = await api.saveNotebookSettings(trash.checked, templatePage.value);
    } catch (error) {
        fail(error);
    }
    trash.checked = saved.disableTrash;
    templatePage.value = saved.template;
}

trash.addEventListener("change", saveNotebookSettings);
templatePage.addEventListener("change", saveNotebookSettings);
encryptNew.addEventListener("change", () => {
    api.vaultEncryptNew(encryptNew.checked).then(refreshVault).catch((error) => {
        fail(error);
        encryptNew.checked = !encryptNew.checked;
    });
});

export async function openSettings() {
    language.value = currentLanguage();
    size.value = String(preferences.fontSize);
    showSize();
    template.checked = preferences.pageTemplate;
    sidebar.checked = preferences.sidebar;
    $("set-version").textContent = t("settings.version", { version: state.version });
    await showNotebookSettings().catch(fail);
    return showDialog($("dlg-settings"));
}
