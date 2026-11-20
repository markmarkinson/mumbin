// What the window shows right now. Everybody may read it; pages.js, notebooks.js,
// vault.js and saving.js change it.

export const state = {
    /** The open notebook as the shell described it, or null. */
    notebook: null,
    /** Name of the page in the editor, or null. */
    page: null,
    /** Stamp of the file as last read or written; null when no file exists. */
    stamp: null,
    /** The editor holds text that is not written yet. */
    dirty: false,
    /** The write in flight, or null. */
    saving: null,
    /** The file changed on disk while there was unsaved text. */
    conflict: false,
    /** The page, or the whole notebook, is encrypted and its key is closed. */
    locked: false,
    /** The page in the editor has a password of its own (not the vault's). */
    ownPassword: false,
    /** The person switched the notebook to read-only. */
    readOnly: false,
    /** Names of the page tree branches that are open. */
    expanded: new Set(),
    /** Program version, from the startup call. */
    version: "",
};

/**
 * The page that is open now. Its `same()` tells whether that page of that notebook is still
 * the one in the window, so a slow answer is dropped when the person has moved on.
 */
export function currentView() {
    const { page, notebook } = state;
    return { page, same: () => state.page === page && state.notebook === notebook };
}
