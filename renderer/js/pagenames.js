// Page names are paths with ":" between the parts, like "Projects:Garden:Beds".
// Pure functions; tested with `node --test`.

/** True when `name` is `parent` or lies below it. */
export const isWithin = (name, parent) => name === parent || name.startsWith(`${parent}:`);

/** The page above `name`, or "" at the top level. */
export const parentName = (name) => name.slice(0, Math.max(0, name.lastIndexOf(":")));

/** The last part of a page name. */
export const leafName = (name) => name.slice(name.lastIndexOf(":") + 1);

/** `name` after the page `from` (and everything below it) was renamed to `to`. */
export const renamedName = (name, from, to) => (isWithin(name, from) ? to + name.slice(from.length) : name);

/** The pages above `name`, topmost first: "a:b:c" gives "a" and "a:b". */
export function ancestors(name) {
    const parts = name.split(":");
    return parts.slice(0, -1).map((_, depth) => parts.slice(0, depth + 1).join(":"));
}
