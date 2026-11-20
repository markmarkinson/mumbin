// Helpers for the attachment list and the tag view; no DOM access.

export const DOCK_TABS = ["backlinks", "attachments", "tags", "outline"];

const PICTURE_TYPES = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    avif: "image/avif",
};

/** MIME type of a file name that is a picture the window can show, else null. */
export function pictureType(name) {
    const extension = /\.([^.]+)$/.exec(name)?.[1].toLowerCase();
    return Object.hasOwn(PICTURE_TYPES, extension) ? PICTURE_TYPES[extension] : null;
}

/** Human readable file size, e.g. "512 B", "1,5 KB", "2,0 MB". */
export function formatSize(bytes, language = "en") {
    const units = ["B", "KB", "MB", "GB"];
    let value = Number(bytes) || 0;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    const text = unit === 0 ? String(Math.round(value)) : value.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `${text} ${units[unit]}`;
}

/**
 * Text that refers to an attachment of the page: a picture for images, a link
 * for everything else. `null` when the name contains characters the link
 * syntax cannot carry.
 */
export function insertTextFor(attachment) {
    if (/[|\]}\n\r]/.test(attachment.name)) return null;
    return attachment.isImage ? `{{./${attachment.name}}}` : `[[./${attachment.name}]]`;
}

/** Names that appear in every list, in the order of the first list. */
export function intersect(lists) {
    if (lists.length === 0) return [];
    const [first, ...rest] = lists;
    const others = rest.map((list) => new Set(list));
    return first.filter((name, index) => first.indexOf(name) === index && others.every((set) => set.has(name)));
}

/**
 * `text` for insertion at `at` in `doc`, with a space on each side that would
 * otherwise glue it to neighbouring text (two links dropped at one spot must
 * stay two links).
 */
export function paddedInsertion(doc, at, text) {
    let padded = text;
    if (at > 0 && !/\s/.test(doc[at - 1])) padded = ` ${padded}`;
    if (at < doc.length && !/\s/.test(doc[at])) padded = `${padded} `;
    return padded;
}

/**
 * Text for dropping several links at `at`: one per line on an empty line,
 * otherwise side by side with spaces. A line break inside a heading or a
 * sentence would tear it apart.
 */
export function insertionText(doc, at, texts) {
    const start = at === 0 ? 0 : doc.lastIndexOf("\n", at - 1) + 1;
    const end = doc.indexOf("\n", at);
    const line = doc.slice(start, end === -1 ? doc.length : end);
    return paddedInsertion(doc, at, texts.join(line.trim() === "" ? "\n" : " "));
}

/** Adds or removes a tag from a selection (lower-case, no `@`). */
export function toggleTag(selected, tag) {
    const key = tag.replace(/^@/, "").toLowerCase();
    return selected.includes(key) ? selected.filter((entry) => entry !== key) : [...selected, key];
}
