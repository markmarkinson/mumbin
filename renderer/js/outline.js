// Table of contents of a page and jumping to a heading; no DOM access.
// Headings come from `outline()` in wiki.js (code blocks are skipped there).

import { headingAnchor, outline } from "./wiki.js";

/**
 * Entries of the table of contents.
 *
 * The page title is left out when it is the only heading of the
 * top level: it is the page's name, not part of its structure. `depth` counts
 * the headings above an entry, so a jump from level 2 to level 4 is one step
 * of indentation, not two.
 *
 * @param {{line: number, level: number, text: string, anchor: string}[]} headings
 * @returns {{line: number, level: number, text: string, anchor: string, depth: number}[]}
 */
export function tocEntries(headings) {
    if (headings.length === 0) return [];
    const top = Math.min(...headings.map((heading) => heading.level));
    const onlyTitle = top === 1 && headings.filter((heading) => heading.level === 1).length === 1 && headings[0].level === 1;
    const shown = onlyTitle ? headings.slice(1) : headings;
    const stack = [];
    return shown.map((heading) => {
        while (stack.length && stack[stack.length - 1] >= heading.level) stack.pop();
        const entry = { ...heading, depth: stack.length };
        stack.push(heading.level);
        return entry;
    });
}

/** The heading the cursor is in: the last one at or above its line, or null. */
export function activeEntry(entries, line) {
    let found = null;
    for (const entry of entries) {
        if (entry.line > line) break;
        found = entry;
    }
    return found;
}

const EXPLICIT_ANCHOR = /\{\{id:\s+(\w[\w-]+)\s*\}\}/g;

/**
 * Line of the place an anchor in a link points to, or -1. Headings answer to
 * their implicit anchor (`Mein Abschnitt` is `mein-abschnitt`, spelling of the
 * link is normalised the same way); `{{id: name}}` anchors answer to their name.
 */
export function anchorLine(lines, anchor) {
    const wanted = headingAnchor(decodeAnchor(anchor));
    if (!wanted) return -1;
    const heading = outline(lines).find((entry) => entry.anchor === wanted);
    if (heading) return heading.line;
    for (let index = 0; index < lines.length; index += 1) {
        for (const match of lines[index].matchAll(EXPLICIT_ANCHOR)) {
            if (match[1] === anchor.trim() || match[1].toLowerCase() === wanted) return index;
        }
    }
    return -1;
}

/** Decodes `%20` and friends; text that is not valid percent-encoding stays as it is. */
function decodeAnchor(anchor) {
    try {
        return decodeURIComponent(anchor.replace(/%(?![0-9a-fA-F]{2})/g, "%25"));
    } catch {
        return anchor;
    }
}
