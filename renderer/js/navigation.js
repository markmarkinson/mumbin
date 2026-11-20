// Back/forward history of visited pages. Names are colon-separated paths, so
// renaming or deleting a page also affects everything below it.

const inside = (entry, parent) => entry === parent || entry.startsWith(`${parent}:`);

export function createHistory() {
    let entries = [];
    let position = -1;
    return {
        reset() {
            entries = [];
            position = -1;
        },
        /** Records a visit; going somewhere new drops the forward path. */
        visit(name) {
            if (entries[position] === name) return;
            entries = entries.slice(0, position + 1);
            entries.push(name);
            position += 1;
        },
        /** Follows a rename of `from` (and everything below it) to `to`. */
        renamed(from, to) {
            entries = entries.map((entry) => (inside(entry, from) ? to + entry.slice(from.length) : entry));
        },
        /** Forgets deleted pages; the position stays on the nearest earlier entry. */
        removed(name) {
            const before = entries.slice(0, position + 1).filter((entry) => inside(entry, name)).length;
            entries = entries.filter((entry) => !inside(entry, name));
            position = Math.max(entries.length ? 0 : -1, position - before);
        },
        /** The page `delta` steps away, or null. */
        target(delta) {
            return entries[position + delta] ?? null;
        },
        moved(delta) {
            if (entries[position + delta]) position += delta;
        },
    };
}
