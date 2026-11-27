// Logic behind the command palette, shortcuts and insert helpers. Pure
// functions without DOM access.

import { isoDate } from "./tasks.js";

/**
 * Parses a shortcut such as "Ctrl+Shift+P", "Alt+Left" or "F2".
 * @returns {{ctrl: boolean, shift: boolean, alt: boolean, key: string}}
 */
export function parseShortcut(text) {
    const parts = text.split("+").map((part) => part.trim());
    const key = parts.pop();
    const has = (name) => parts.some((part) => part.toLowerCase() === name);
    return { ctrl: has("ctrl"), shift: has("shift"), alt: has("alt"), key: normaliseKey(key) };
}

const KEY_NAMES = {
    left: "arrowleft",
    right: "arrowright",
    up: "arrowup",
    down: "arrowdown",
    pos1: "home",
    pgup: "pageup",
    pgdn: "pagedown",
    plus: "+",
    minus: "-",
    comma: ",",
    space: " ",
    esc: "escape",
};

function normaliseKey(key) {
    const lower = key.toLowerCase();
    return KEY_NAMES[lower] ?? lower;
}

/**
 * True when a keyboard event is the given shortcut. `event.key` decides,
 * except for digits and letters, where the physical key is used so that
 * Ctrl+Shift+1 and keyboard layouts with dead keys still match.
 */
export function matchesShortcut(event, shortcut) {
    const wanted = parseShortcut(shortcut);
    if (Boolean(event.ctrlKey) !== wanted.ctrl || Boolean(event.altKey) !== wanted.alt) return false;
    let key = String(event.key ?? "").toLowerCase();
    const code = String(event.code ?? "");
    if (/^Digit\d$/.test(code)) key = code.slice(5);
    else if (/^Numpad\d$/.test(code) && wanted.ctrl) key = code.slice(6);
    else if (/^Key[A-Z]$/.test(code) && (wanted.ctrl || wanted.alt)) key = code.slice(3).toLowerCase();
    else if (code === "NumpadAdd") key = "+";
    else if (code === "NumpadSubtract") key = "-";
    // "+" needs Shift on most layouts; do not insist on the Shift state for it.
    if (wanted.key === "+" && (key === "+" || key === "=")) return true;
    if (Boolean(event.shiftKey) !== wanted.shift) return false;
    return key === wanted.key;
}

/** Shortcut as shown to the person, with German key names if wanted. */
export function shortcutLabel(shortcut, language = "en") {
    if (!shortcut) return "";
    const german = { Ctrl: "Strg", Shift: "Umschalt", Left: "←", Right: "→", Up: "↑", Down: "↓", Home: "Pos1", PgUp: "Bild↑", PgDn: "Bild↓", Plus: "+", Minus: "-", Comma: "," };
    const english = { Left: "←", Right: "→", Up: "↑", Down: "↓", Plus: "+", Minus: "-", Comma: "," };
    const names = language.startsWith("de") ? german : english;
    return shortcut
        .split("+")
        .map((part) => names[part] ?? part)
        .join("+");
}

/**
 * Filters and orders entries for the palette. Every word typed must occur in
 * the entry's text; matches at the start of the text or of a name part rank
 * higher, shorter texts break ties.
 * @param {string} query
 * @param {{text: string}[]} entries
 */
export function rankEntries(query, entries, limit = 60) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return entries.slice(0, limit);
    const scored = [];
    for (const entry of entries) {
        const text = entry.text.toLowerCase();
        let score = 0;
        let matched = true;
        for (const word of words) {
            const index = text.indexOf(word);
            if (index < 0) {
                matched = false;
                break;
            }
            if (index === 0) score += 4;
            else if (/[:\s/._-]/.test(text[index - 1])) score += 2;
            // A hit in the last name part is what people usually mean.
            if (text.lastIndexOf(":") < index) score += 1;
        }
        if (matched) scored.push({ entry, score, length: text.length });
    }
    scored.sort((a, b) => b.score - a.score || a.length - b.length || a.entry.text.localeCompare(b.entry.text));
    return scored.slice(0, limit).map((item) => item.entry);
}

/**
 * Texts offered by "insert date", most common first.
 * @param {Date} date
 * @param {string} language "de" or "en"
 * @returns {string[]}
 */
export function dateTexts(date, language) {
    const locale = language.startsWith("de") ? "de-DE" : "en-GB";
    const iso = isoDate(date);
    const time = date.toTimeString().slice(0, 5);
    const short = date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
    const long = date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return [short, `${short} ${time}`, long, iso, `${iso} ${time}`, time, `[d: ${iso}]`];
}

/**
 * Neighbour of `current` in the flat, ordered list of page names.
 * @param {string[]} names
 * @param {number} delta -1 for the previous page, 1 for the next
 */
export function neighbourPage(names, current, delta) {
    const index = names.indexOf(current);
    if (index < 0) return names.length ? names[delta > 0 ? 0 : names.length - 1] : null;
    return names[index + delta] ?? null;
}

/** Keeps a text size within the range the settings offer. */
export function clampFontSize(size) {
    const number = Number(size);
    if (!Number.isFinite(number)) return 15;
    return Math.max(11, Math.min(26, Math.round(number)));
}
