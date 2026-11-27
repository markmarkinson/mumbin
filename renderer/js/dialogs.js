// The one helper behind every modal dialog.

/**
 * Shows a modal dialog until its form is submitted or it is cancelled (Esc, or the button
 * whose id ends in "-cancel").
 * @param {HTMLDialogElement} dialog its first form is the one that submits
 * @param {object} [options]
 * @param {() => any} [options.collect] runs on submit; its result is what the promise
 *   resolves to, `undefined` keeps the dialog open (the input was not acceptable)
 * @param {(finish: (value: any) => void) => void} [options.onOpen] runs once the dialog
 *   is shown; `finish` closes it from a button that is neither submit nor cancel
 * @returns {Promise<any>} the collected value, or null when cancelled
 */
export function showDialog(dialog, { collect = () => true, onOpen = () => {} } = {}) {
    const form = dialog.querySelector("form");
    const cancel = form.querySelector('[id$="-cancel"]');
    return new Promise((resolve) => {
        const finish = (value) => {
            form.removeEventListener("submit", onSubmit);
            cancel?.removeEventListener("click", onCancel);
            dialog.removeEventListener("cancel", onCancel);
            dialog.close();
            resolve(value);
        };
        const onSubmit = (event) => {
            event.preventDefault();
            const value = collect();
            if (value !== undefined) finish(value);
        };
        const onCancel = (event) => {
            event.preventDefault();
            finish(null);
        };
        form.addEventListener("submit", onSubmit);
        cancel?.addEventListener("click", onCancel);
        dialog.addEventListener("cancel", onCancel);
        dialog.showModal();
        onOpen(finish);
    });
}
