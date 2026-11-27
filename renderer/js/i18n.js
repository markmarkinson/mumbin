// All visible text lives in texts.de.js and texts.en.js. The product name appears only in `appName`.

import { recall, remember } from "./storage.js";
import { de } from "./texts.de.js";
import { en } from "./texts.en.js";

export const appName = "Mumbin";

const TEXTS = { de, en };
const STORAGE_KEY = "language";

const stored = recall(STORAGE_KEY);
let language = stored && TEXTS[stored] ? stored : (navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en";

export function currentLanguage() {
    return language;
}

export function setLanguage(next) {
    if (!TEXTS[next]) return;
    language = next;
    remember(STORAGE_KEY, next);
    applyTranslations();
}

/** The text of `key` in the current language, with `{name}` placeholders filled from `values`. */
export function t(key, values = {}) {
    let text = (TEXTS[language][key] ?? key).replaceAll("{app}", appName);
    for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
    return text;
}

/** Message for an error object coming from the backend. */
export function errorText(error) {
    const key = `error.${error?.code}`;
    return TEXTS[language][key] ? t(key) : t("error.unknown");
}

/** Fills every element that names its text via data attributes. */
export function applyTranslations() {
    document.documentElement.lang = language;
    for (const element of document.querySelectorAll("[data-i18n]")) {
        element.textContent = t(element.dataset.i18n);
    }
    for (const element of document.querySelectorAll("[data-i18n-title]")) {
        const text = t(element.dataset.i18nTitle);
        element.title = text;
        element.setAttribute("aria-label", text);
    }
    for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
        element.placeholder = t(element.dataset.i18nPlaceholder);
    }
}
