// Saving the open page and switching pages without losing or mixing up edits.

/**
 * Returns `save({force})`: one write at a time; edits made while a write runs
 * are written right after it, before `save` resolves, so navigation can wait
 * for it. A write that fails with `{code: "conflict"}` blocks further saves
 * until one is forced.
 */
export function createSaver({ state, getText, write, onSaved = () => {}, onState = () => {} }) {
    let pending = null;
    return async function save({ force = false } = {}) {
        while (pending) await pending;
        if (!state.page || (!state.dirty && !force)) return;
        if (state.conflict && !force) throw { code: "conflict" };
        const flush = async () => {
            do {
                const name = state.page;
                const body = getText();
                const hadFile = state.stamp !== null;
                state.dirty = false;
                try {
                    const result = await write(name, body, state.stamp, force);
                    force = false;
                    state.stamp = result.stamp;
                    state.conflict = false;
                    await onSaved(result, hadFile);
                } catch (error) {
                    state.dirty = true;
                    if (error?.code === "conflict") state.conflict = true;
                    throw error;
                }
            } while (state.dirty);
        };
        pending = Promise.resolve().then(flush);
        state.saving = pending;
        onState();
        try {
            await pending;
        } finally {
            pending = null;
            state.saving = null;
            onState();
        }
    };
}

/** Runs page transitions one after the other so slower reads cannot replace a newer page. */
export function createTransitionQueue(setLocked) {
    let tail = Promise.resolve();
    return (work) => {
        const next = tail.then(async () => {
            setLocked(true);
            try {
                return await work();
            } finally {
                setLocked(false);
            }
        });
        tail = next.catch(() => {});
        return next;
    };
}
