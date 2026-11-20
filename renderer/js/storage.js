// Things the window remembers between runs. Storage can be blocked or read-only; then the
// window works as if nothing was remembered.

export function recall(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function remember(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Remembering is a convenience only.
    }
}
