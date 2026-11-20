// Encryption in the window: the vault dialogs, the dialogs of pages with a password of their
// own, the lock on a page that is closed, the lock marks in the page tree. What is secret never
// lives here for longer than a form field: passphrases are cleared as soon as they have been sent.

import { api } from "./bridge.js";
import { showDialog } from "./dialogs.js";
import { t } from "./i18n.js";
import * as notebooks from "./notebooks.js";
import * as pages from "./pages.js";
import { preferences, storePreferences } from "./preferences.js";
import { menuEntries, protectionOf } from "./protection.js";
import { state } from "./state.js";
import { passphraseStrength } from "./strength.js";
import { $, LOCK, fail, onClick, showToast } from "./ui.js";

const MIN_PASSPHRASE = 10;
const LOCK_OPEN = "\u{1F513}";

/** What is wrong with a new passphrase, as a message; null when it is fine. */
function passphraseProblem(first, again) {
    if (first !== again) return t("vault.mismatch");
    if ([...first].length < MIN_PASSPHRASE) return t("vault.tooShort", { n: MIN_PASSPHRASE });
    if (passphraseStrength(first).level === 0) return t("vault.tooWeak");
    return null;
}

const vault = { exists: false, unlocked: false, encryptNew: false, sealed: false };
/** Pages encrypted with the vault. */
let encryptedPages = new Set();
/** Pages with a password of their own: name -> whether their key is open. */
let ownPages = new Map();

/** Some key is open, so something is readable that locks again after a pause. */
const anythingOpen = () => vault.unlocked || [...ownPages.values()].some(Boolean);

/** Reads what the program knows and redraws everything that shows it. */
export async function refresh() {
    if (!state.notebook) return;
    const notebook = state.notebook;
    try {
        const [status, names, own] = await Promise.all([api.vaultStatus(), api.vaultPages(), api.pagePasswords()]);
        if (state.notebook !== notebook) return;
        Object.assign(vault, status);
        encryptedPages = new Set(names);
        ownPages = new Map(own.map(({ name, unlocked }) => [name, unlocked]));
    } catch (error) {
        fail(error);
        return;
    }
    redraw();
    watchIdle();
}

/** Shows the lock marks as the keys are now. */
export function redraw() {
    const shown = Boolean(state.notebook) && vault.exists;
    const lockTip = t(vault.unlocked ? "vault.badgeOpen" : "vault.badgeLocked");
    const lockIcon = vault.unlocked ? LOCK_OPEN : LOCK;
    const badge = $("vault-badge");
    badge.hidden = !shown;
    badge.textContent = lockIcon;
    badge.title = lockTip;
    badge.classList.toggle("open", vault.unlocked);
    // The notebook button in the sidebar shows the same lock, so a protected notebook is recognised at a glance.
    const lock = $("notebook-lock");
    lock.hidden = !shown;
    lock.textContent = lockIcon;
    lock.title = lockTip;
    for (const row of $("tree").querySelectorAll(".tree-row")) {
        // A lock marks an encrypted page: closed while its key is closed, open while it is open.
        const kind = protectionOf(factsAbout(row.dataset.page));
        row.classList.toggle("sealed", kind !== "none");
        row.classList.toggle("open", kind === "own-open" || (kind === "vault" && vault.unlocked));
        if (kind === "none") row.removeAttribute("title");
        else row.title = t(kind === "vault" ? "pagepw.markVault" : kind === "own-open" ? "pagepw.markOpen" : "pagepw.markLocked");
    }
}

/** How the page is protected, as `protection.js` wants to know it. */
function factsAbout(page) {
    return { sealed: vault.sealed, own: ownPages.has(page), ownOpen: ownPages.get(page) === true, encrypted: encryptedPages.has(page) };
}

/** Shows the entries of the page menu that fit `page`: the vault, its own password, or neither yet. */
export function prepareMenu(page) {
    const shown = menuEntries(factsAbout(page));
    for (const [action, visible] of Object.entries(shown)) document.querySelector(`#page-menu [data-action="${action}"]`).hidden = !visible;
    document.querySelector('#page-menu [data-action="toggleEncrypted"]').textContent = t(encryptedPages.has(page) ? "menu.decryptPage" : "menu.encryptPage");
}

/** The page now open is encrypted and its key is closed: no text, a way to open it. */
export function pageShown(locked) {
    // A notebook that hides its file names is locked as a whole, not page by page.
    const own = !vault.sealed && state.ownPassword;
    $("locked-title").textContent = t(vault.sealed ? "vault.notebookLockedTitle" : own ? "pagepw.lockedTitle" : "vault.lockedTitle");
    $("locked-text").textContent = t(vault.sealed ? "vault.notebookLockedText" : own ? "pagepw.lockedText" : "vault.lockedText");
    $("locked-panel").hidden = !locked;
    $("page").classList.toggle("is-locked", locked);
    if (locked) $("locked-open").focus();
    redraw();
}

const oldField = $("vault-old");
const firstField = $("vault-new");
const againField = $("vault-again");

/** The bar under the new passphrase: how hard it is to guess, and what to do about it. */
function showStrength() {
    const text = firstField.value;
    const { level } = passphraseStrength(text);
    const box = $("vault-strength");
    box.dataset.level = text ? String(level) : "0";
    $("vault-strength-text").textContent = text ? t(`strength.${level}`) : "";
    const hint = $("vault-strength-hint");
    hint.hidden = !text || level >= 3 || box.hidden;
    hint.textContent = t("strength.hint");
}
firstField.addEventListener("input", showStrength);

/**
 * Asks for a passphrase: "create" and "change" ask twice and judge it, "unlock" asks once.
 * `labels` replace the texts of the dialog (title, text, confirm, skip, field, oldField, warning);
 * `error` is shown at once, for a retry after a wrong password.
 * @returns {Promise<{old: string, passphrase: string}|null>} the typed values, or null when cancelled
 */
async function askPassphrase(mode, labels = {}) {
    const asksTwice = mode !== "unlock";
    for (const field of [oldField, firstField, againField]) field.value = "";
    $("dlg-vault").dataset.mode = mode;
    $("vault-title").textContent = labels.title ?? t(`vault.title.${mode}`);
    $("vault-text").textContent = labels.text ?? t(`vault.text.${mode}`);
    $("vault-confirm").textContent = labels.confirm ?? t(`vault.confirm.${mode}`);
    $("vault-cancel").textContent = labels.skip ?? t("common.cancel");
    $("vault-old-row").hidden = mode !== "change";
    $("vault-new-label").textContent = labels.field ?? t(asksTwice ? "vault.newPassphrase" : "vault.passphrase");
    $("vault-old-label").textContent = labels.oldField ?? t("vault.oldPassphrase");
    $("vault-warning").textContent = labels.warning ?? t("vault.warning");
    $("vault-again-row").hidden = !asksTwice;
    $("vault-warning").hidden = !asksTwice;
    $("vault-strength").hidden = !asksTwice;
    $("vault-strength-hint").hidden = true;
    showStrength();
    $("vault-error").hidden = !labels.error;
    $("vault-error").textContent = labels.error ?? "";
    const answer = await showDialog($("dlg-vault"), {
        onOpen: () => setTimeout(() => (mode === "change" ? oldField : firstField).focus(), 0),
        collect() {
            const problem = asksTwice ? passphraseProblem(firstField.value, againField.value) : null;
            $("vault-error").hidden = !problem;
            if (problem) {
                $("vault-error").textContent = problem;
                return undefined;
            }
            return { old: oldField.value, passphrase: firstField.value };
        },
    });
    for (const field of [oldField, firstField, againField]) field.value = "";
    return answer;
}

async function setUp() {
    const answer = await askPassphrase("create");
    if (!answer) return;
    await api.vaultCreate(answer.passphrase);
    await refresh();
    showToast(t("vault.created"));
}

/**
 * A notebook was just created: offer to protect it with a passphrase right away. With one, the
 * vault is made, every page (and every page made later) is encrypted. "Without a password" leaves it plain.
 */
export async function protectNewNotebook() {
    if (!state.notebook || vault.exists) return false;
    const answer = await askPassphrase("create", {
        title: t("vault.newNotebook.title"),
        text: t("vault.newNotebook.text"),
        confirm: t("vault.newNotebook.confirm"),
        skip: t("vault.newNotebook.skip"),
    });
    if (!answer) return false;
    // A new notebook has no pages: it is made so that file names are hidden too, and every
    // page and file written into it afterwards is encrypted from the first save.
    await api.vaultCreate(answer.passphrase, true);
    await refresh();
    showToast(t("vault.created"));
    return true;
}

/** Changes the vault between two page moves: typing is saved first, the window is redrawn after. */
function changeVault(change) {
    return pages.transition(async () => {
        await pages.save();
        const result = await change();
        await refresh();
        await notebooks.vaultChanged();
        return result;
    });
}

async function unlock() {
    const notebook = state.notebook;
    const answer = await askPassphrase("unlock");
    if (!answer) return false;
    await changeVault(() => {
        if (state.notebook !== notebook) throw { code: "no-notebook" };
        return api.vaultUnlock(answer.passphrase);
    });
    showToast(t("vault.opened"));
    return true;
}

/**
 * A protected notebook was just opened: ask for the passphrase right away. Cancelling leaves it
 * locked (the lock stays visible, encrypted pages offer "Unlock"); a wrong passphrase asks again.
 */
export async function promptOnOpen() {
    if (!state.notebook || !vault.exists || vault.unlocked) return;
    for (;;) {
        try {
            await unlock();
            return;
        } catch (error) {
            if (error?.code !== "wrong-passphrase") throw error;
            fail(error);
        }
    }
}

/** Locks the vault and every page with a password of its own. */
export async function lock() {
    await changeVault(async () => {
        await api.vaultLock();
        await api.pageLockAll();
        notebooks.vaultLocked();
    });
    showToast(t("vault.closed"));
}

async function changePassphrase() {
    const answer = await askPassphrase("change");
    if (!answer) return;
    await api.vaultChangePassphrase(answer.old, answer.passphrase);
    showToast(t("vault.changed"));
}

export async function togglePageEncrypted() {
    if (!state.page) return;
    const on = !encryptedPages.has(state.page);
    // A page nobody wrote on has no file yet, so there is nothing to encrypt: write first.
    await pages.save();
    if (state.stamp === null) {
        showToast(t("vault.writeFirst"));
        return;
    }
    // No vault yet: choose the passphrase first, then this page is encrypted.
    if (!vault.exists) {
        await setUp();
        if (!vault.exists) return;
    }
    if (!vault.unlocked && !(await unlock())) return;
    await changeVault(() => api.setPageEncrypted(state.page, on));
    showToast(t(on ? "vault.pageEncrypted" : "vault.pageDecrypted"));
}

// ── Pages with a password of their own ─────────────────────────────────

const PAGE_DIALOGS = {
    set: (name) => ({ title: t("pagepw.title.set"), text: t("pagepw.text.set", { name }), confirm: t("pagepw.confirm.set"), field: t("pagepw.newPassword") }),
    unlock: (name) => ({ title: t("pagepw.title.unlock"), text: t("pagepw.text.unlock", { name }), confirm: t("pagepw.confirm.unlock"), field: t("pagepw.password") }),
    change: (name) => ({
        title: t("pagepw.title.change"),
        text: t("pagepw.text.change", { name }),
        confirm: t("pagepw.confirm.change"),
        field: t("pagepw.newPassword"),
        oldField: t("pagepw.oldPassword"),
    }),
    remove: (name) => ({ title: t("pagepw.title.remove"), text: t("pagepw.text.remove", { name }), confirm: t("pagepw.confirm.remove"), field: t("pagepw.password") }),
};

/**
 * Asks for the password(s) of a page and tries them; a wrong one is said in the dialog, which
 * asks again. Resolves to false when the person gave up.
 */
async function askAndTry(mode, labels, attempt) {
    let problem = null;
    for (;;) {
        const answer = await askPassphrase(mode, { ...labels, warning: t("pagepw.warning"), error: problem });
        if (!answer) return false;
        try {
            await attempt(answer);
            return true;
        } catch (error) {
            if (error?.code !== "wrong-passphrase") throw error;
            problem = t("pagepw.wrong");
        }
    }
}

/** Runs `change` on the open page; the window is redrawn after it. */
function changePage(change) {
    const page = state.page;
    return changeVault(() => {
        if (state.page !== page) throw { code: "no-notebook" };
        return change(page);
    });
}

/** Gives the open page a password of its own. */
export async function protectPage() {
    if (!state.page) return;
    // A page nobody wrote on has no file yet, so there is nothing to protect: write first.
    await pages.save();
    if (state.stamp === null) {
        showToast(t("vault.writeFirst"));
        return;
    }
    let failed = [];
    const done = await askAndTry("create", PAGE_DIALOGS.set(state.page), async (answer) => {
        failed = (await changePage((page) => api.pagePasswordSet(page, answer.passphrase))) ?? [];
    });
    if (!done) return;
    showToast(t("pagepw.protected") + (failed.length ? ` ${t("vault.someFailed", { names: failed.join(", ") })}` : ""));
}

/** Opens the open page with its own password. */
async function unlockPage() {
    if (!(await askAndTry("unlock", PAGE_DIALOGS.unlock(state.page), (answer) => changePage((page) => api.pagePasswordUnlock(page, answer.passphrase))))) return false;
    showToast(t("pagepw.unlocked"));
    return true;
}

export async function changePagePassword() {
    if (!state.page) return;
    let waiting = [];
    const changed = await askAndTry("change", PAGE_DIALOGS.change(state.page), async (answer) => {
        waiting = (await changePage((page) => api.pagePasswordChange(page, answer.old, answer.passphrase))) ?? [];
    });
    if (!changed) return;
    showToast(waiting.length ? t("pagepw.changedWaiting", { names: waiting.join(", ") }) : t("pagepw.changed"));
}

export async function removePageProtection() {
    if (!state.page) return;
    const removed = await askAndTry("unlock", PAGE_DIALOGS.remove(state.page), (answer) => changePage((page) => api.pagePasswordRemove(page, answer.passphrase)));
    if (removed) showToast(t("pagepw.removed"));
}

/** Closes the open page again; the other keys stay as they are. */
export async function lockPage() {
    if (!state.page || !ownPages.has(state.page)) return;
    await changePage(async (page) => {
        await api.pageLock(page);
        notebooks.vaultLocked();
    });
    showToast(t("pagepw.locked"));
}

async function convertAll(encrypt) {
    if (!vault.unlocked && !(await unlock())) return;
    const report = await changeVault(() => api.vaultConvertAll(encrypt));
    const failed = report.failed.length ? ` ${t("vault.someFailed", { names: report.failed.join(", ") })}` : "";
    showToast(t(encrypt ? "vault.allEncrypted" : "vault.allDecrypted", { n: report.changed }) + failed);
}

async function saveTool() {
    const path = await api.saveDecryptTool();
    if (path) showToast(t("vault.toolSaved", { path }));
}

let idleTimer = null;
// The tests have a window object of their own; there a "minute" is a second.
const minuteMs = () => (window.__mumbin ? 1000 : 60_000);

/** (Re)starts the countdown to the automatic lock; a no-op unless a key is open. */
function watchIdle() {
    clearTimeout(idleTimer);
    idleTimer = null;
    if (!anythingOpen() || preferences.autoLockMinutes <= 0) return;
    idleTimer = setTimeout(() => {
        idleTimer = null;
        if (anythingOpen()) {
            lock().catch((error) => {
                fail(error);
                watchIdle();
            });
        }
    }, preferences.autoLockMinutes * minuteMs());
}

for (const type of ["keydown", "pointerdown", "pointermove", "wheel"]) {
    window.addEventListener(
        type,
        () => {
            if (idleTimer !== null) watchIdle();
        },
        { passive: true, capture: true },
    );
}

function drawManager() {
    let status = t("vault.status.none");
    if (vault.exists) {
        status = t(vault.unlocked ? "vault.status.open" : "vault.status.locked");
        if (vault.sealed) status += ` ${t("vault.status.sealed")}`;
    }
    $("vault-status-text").textContent = status;
    $("vault-act-create").hidden = vault.exists;
    $("vault-act-unlock").hidden = !vault.exists || vault.unlocked;
    $("vault-act-lock").hidden = !vault.unlocked;
    $("vault-act-change").hidden = !vault.exists;
    // In a notebook that hides its file names everything is encrypted, always.
    for (const id of ["vault-act-encrypt-all", "vault-act-decrypt-all"]) $(id).hidden = !vault.exists || vault.sealed;
    $("vault-autolock-row").hidden = !vault.exists && ownPages.size === 0;
    $("vault-autolock").value = String(preferences.autoLockMinutes);
}

const MANAGE_ACTIONS = {
    "vault-act-create": setUp,
    "vault-act-unlock": unlock,
    "vault-act-lock": lock,
    "vault-act-change": changePassphrase,
    "vault-act-encrypt-all": () => convertAll(true),
    "vault-act-decrypt-all": () => convertAll(false),
    "vault-act-tool": saveTool,
};
let managing = false;

function setManageButtonsDisabled(disabled) {
    for (const id of Object.keys(MANAGE_ACTIONS)) $(id).disabled = disabled;
}

for (const [id, action] of Object.entries(MANAGE_ACTIONS)) {
    $(id).addEventListener("click", () => {
        if (managing) return;
        managing = true;
        setManageButtonsDisabled(true);
        // The window stays; the action may open the passphrase dialog above it.
        action()
            .then(drawManager, fail)
            .finally(() => {
                managing = false;
                setManageButtonsDisabled(false);
            });
    });
}
$("vault-autolock").addEventListener("change", (event) => {
    preferences.autoLockMinutes = Number(event.target.value);
    storePreferences();
    watchIdle();
});

export async function manage() {
    await refresh();
    drawManager();
    await showDialog($("dlg-crypto"));
}

onClick("vault-badge", () => (vault.unlocked ? lock() : unlock()));
onClick("locked-open", () => (state.ownPassword ? unlockPage() : unlock()));

/** Whether the notebook also hides its file names. */
export const isSealed = () => vault.sealed;
