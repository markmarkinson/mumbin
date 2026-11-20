// How a page is protected, and what the page menu offers for it. Pure functions, no window needed.

/**
 * @typedef {object} Facts
 * @property {boolean} sealed the whole notebook is encrypted (its pages are not chosen one by one)
 * @property {boolean} own the page has a password of its own
 * @property {boolean} ownOpen that password was entered and the page is open
 * @property {boolean} encrypted the page is encrypted with the vault
 */

/**
 * "own-open", "own-locked", "vault" or "none". In a notebook that is encrypted as a whole the
 * vault's mark is left out: one lock at the notebook says it for every page.
 * @param {Facts} facts
 */
export function protectionOf({ sealed, own, ownOpen, encrypted }) {
    if (own) return ownOpen ? "own-open" : "own-locked";
    return encrypted && !sealed ? "vault" : "none";
}

/**
 * The entries of the page menu that belong to protection. The two ways to protect a page are
 * offered for a page that has neither; a page that has one is offered what fits that one only.
 * @param {Facts} facts
 * @returns {{toggleEncrypted: boolean, protectPage: boolean, changePagePassword: boolean, removePageProtection: boolean, lockPage: boolean}}
 */
export function menuEntries({ sealed, own, ownOpen, encrypted }) {
    return {
        // The vault's entry reads "encrypt" or "decrypt"; without a vault a click first asks for a passphrase.
        toggleEncrypted: !sealed && !own,
        protectPage: !sealed && !own && !encrypted,
        changePagePassword: own,
        removePageProtection: own,
        lockPage: own && ownOpen,
    };
}
