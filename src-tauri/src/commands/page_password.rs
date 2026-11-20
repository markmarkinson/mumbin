//! Pages with a password of their own: setting, opening, changing and taking off the password.
//!
//! A page opened with its password stays open (its key is kept in memory) until the person
//! locks it, the idle lock fires, or the notebook is closed. Nothing here writes a key or a
//! password anywhere, and neither is sent back to the webview.

use mumbin_core::PageName;
use mumbin_core::crypto::Zeroizing;
use serde::Serialize;
use tauri::State;

use super::vault::{check_passphrase_length, kdf_params};
use crate::error::CommandResult;
use crate::state::AppState;

/// A page that has a password of its own, and whether its key is open.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnPage {
    name: String,
    unlocked: bool,
}

/// Gives a page a password of its own; the page stays open afterwards. The page must have
/// been saved, because an empty page has no file to protect. Answers with the files that could
/// not be sealed (they stay plain).
#[tauri::command(async)]
pub fn page_password_set(
    state: State<'_, AppState>,
    name: String,
    password: String,
) -> CommandResult<Vec<String>> {
    let password = Zeroizing::new(password);
    let state = state.write()?;
    check_passphrase_length(&password)?;
    let page = PageName::new(&name)?;
    let protected = state
        .notebook()?
        .protect_page(&page, &password, kdf_params())?;
    state.unlock_page(&page, protected.key);
    state.touch();
    Ok(protected.failed)
}

/// Opens a page with its own password. A wrong password is `wrong-passphrase`.
#[tauri::command(async)]
pub fn page_password_unlock(
    state: State<'_, AppState>,
    name: String,
    password: String,
) -> CommandResult<()> {
    let password = Zeroizing::new(password);
    let state = state.read();
    let page = PageName::new(&name)?;
    let key = state.notebook()?.unlock_page(&page, &password)?;
    state.unlock_page(&page, key);
    Ok(())
}

/// Closes one page again.
#[tauri::command(async)]
pub fn page_lock(state: State<'_, AppState>, name: String) -> CommandResult<()> {
    let state = state.read();
    state.lock_page(&PageName::new(&name)?);
    Ok(())
}

/// Closes every page that was opened with its own password.
#[tauri::command(async)]
pub fn page_lock_all(state: State<'_, AppState>) {
    state.read().forget_page_keys();
}

/// Changes the password of a page; the old one must be right. The page is open afterwards.
/// Answers with the files whose new copy has not been moved into place yet (it is finished the
/// next time the page is read or opened).
#[tauri::command(async)]
pub fn page_password_change(
    state: State<'_, AppState>,
    name: String,
    old_password: String,
    new_password: String,
) -> CommandResult<Vec<String>> {
    let (old_password, new_password) = (Zeroizing::new(old_password), Zeroizing::new(new_password));
    let state = state.write()?;
    check_passphrase_length(&new_password)?;
    let page = PageName::new(&name)?;
    let changed = state.notebook()?.change_page_password(
        &page,
        &old_password,
        &new_password,
        kdf_params(),
    )?;
    state.unlock_page(&page, changed.key);
    state.touch();
    Ok(changed.failed)
}

/// Takes the password off a page; the page and its files are plain afterwards.
#[tauri::command(async)]
pub fn page_password_remove(
    state: State<'_, AppState>,
    name: String,
    password: String,
) -> CommandResult<()> {
    let password = Zeroizing::new(password);
    let state = state.write()?;
    let page = PageName::new(&name)?;
    state.notebook()?.unprotect_page(&page, &password)?;
    state.lock_page(&page);
    state.touch();
    Ok(())
}

/// The pages with a password of their own, open or not.
#[tauri::command(async)]
pub fn page_passwords_list(state: State<'_, AppState>) -> CommandResult<Vec<OwnPage>> {
    let state = state.read();
    // A notebook that hides its file names has nothing to list while it is locked (and no such pages).
    if state.notebook()?.is_locked() {
        return Ok(Vec::new());
    }
    let keys = state.open_keys();
    Ok(state
        .index()?
        .pages()
        .iter()
        .filter(|page| page.own_password)
        .map(|page| OwnPage {
            name: page.info.name.to_string(),
            unlocked: keys.page(&page.info.name).is_some(),
        })
        .collect())
}
