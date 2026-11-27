//! Encrypted pages: the vault, its passphrase and the decryption tool.

use std::io::Write;

use mumbin_core::PageName;
use mumbin_core::crypto::{CryptoError, KdfParams};
use serde::Serialize;
use tauri::{AppHandle, State};

use super::{choose_folder, first_free_name};
use crate::e2e;
use crate::error::{CommandError, CommandResult};
use crate::state::AppState;

/// The Python tool that decrypts a notebook without this program (`tools/mumbin_decrypt.py`).
const DECRYPT_TOOL: &str = include_str!("../../../tools/mumbin_decrypt.py");

/// Shortest passphrase, in characters.
const MIN_PASSPHRASE_CHARS: usize = 8;

/// What the window needs to know about encryption in the open notebook.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)] // the shape the webview reads
pub struct VaultStatus {
    /// The notebook has a vault (so it can hold encrypted pages).
    exists: bool,
    unlocked: bool,
    /// New pages are encrypted without asking.
    encrypt_new: bool,
    /// Every page and file is encrypted and the file names are hidden (E-025).
    sealed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertReport {
    changed: usize,
    failed: Vec<String>,
}

fn status_of(state: &AppState) -> CommandResult<VaultStatus> {
    let notebook = state.notebook()?;
    Ok(VaultStatus {
        exists: notebook.has_vault()?,
        unlocked: state.vault().is_some(),
        encrypt_new: notebook.property("encrypt_new_pages") == Some("True"),
        sealed: notebook.is_sealed(),
    })
}

/// Cost of the passphrase check. The test hook uses the weakest allowed setting so the tests stay fast.
pub(super) fn kdf_params() -> KdfParams {
    if e2e::enabled() {
        KdfParams::MINIMUM
    } else {
        KdfParams::default()
    }
}

pub(super) fn check_passphrase_length(passphrase: &str) -> CommandResult<()> {
    if passphrase.chars().count() < MIN_PASSPHRASE_CHARS {
        return Err(CommandError::new(
            "passphrase-short",
            "the passphrase is too short",
        ));
    }
    Ok(())
}

#[tauri::command(async)]
pub fn vault_status(state: State<'_, AppState>) -> CommandResult<VaultStatus> {
    status_of(&state.read())
}

/// Makes the vault of the notebook; it is open afterwards.
#[tauri::command(async)]
pub fn vault_create(
    state: State<'_, AppState>,
    passphrase: String,
    sealed: Option<bool>,
) -> CommandResult<VaultStatus> {
    let state = state.write()?;
    let notebook = state.notebook()?;
    check_passphrase_length(&passphrase)?;
    if notebook.has_vault()? {
        return Err(CommandError::new(
            "vault-exists",
            "the notebook already has a vault",
        ));
    }
    // A new notebook is protected completely: the file names are hidden too. That needs a
    // notebook without pages; later setups only encrypt what the person chooses.
    let vault = if sealed == Some(true) {
        notebook.create_sealed_vault(&passphrase, kdf_params())?
    } else {
        notebook.create_vault(&passphrase, kdf_params())?
    };
    state.unlock_vault(vault);
    status_of(&state)
}

#[tauri::command(async)]
pub fn vault_unlock(state: State<'_, AppState>, passphrase: String) -> CommandResult<VaultStatus> {
    let state = state.read();
    let vault = state.notebook()?.unlock_vault(&passphrase)?;
    state.unlock_vault(vault);
    status_of(&state)
}

/// Forgets the key; encrypted pages are closed again.
#[tauri::command(async)]
pub fn vault_lock(state: State<'_, AppState>) -> CommandResult<VaultStatus> {
    let state = state.read();
    state.forget_vault();
    status_of(&state)
}

#[tauri::command(async)]
pub fn vault_change_passphrase(
    state: State<'_, AppState>,
    old_passphrase: String,
    new_passphrase: String,
) -> CommandResult<()> {
    let state = state.write()?;
    check_passphrase_length(&new_passphrase)?;
    state
        .notebook()?
        .change_passphrase(&old_passphrase, &new_passphrase, kdf_params())?;
    Ok(())
}

/// Encrypts or decrypts one page (the vault must be open).
#[tauri::command(async)]
pub fn page_set_encrypted(
    state: State<'_, AppState>,
    name: String,
    encrypted: bool,
) -> CommandResult<()> {
    let state = state.write()?;
    let vault = state.require_vault()?;
    let notebook = state.notebook()?;
    let page = PageName::new(&name)?;
    // The page and the files next to it change together.
    notebook.set_page_encrypted(&page, &vault, encrypted)?;
    state.touch();
    Ok(())
}

/// Encrypts or decrypts every page of the notebook.
#[tauri::command(async)]
pub fn vault_convert_all(
    state: State<'_, AppState>,
    encrypt: bool,
) -> CommandResult<ConvertReport> {
    let state = state.write()?;
    let vault = state.require_vault()?;
    let report = state.notebook()?.convert_all_pages(&vault, encrypt)?;
    state.touch();
    Ok(ConvertReport {
        changed: report.changed,
        failed: report.failed,
    })
}

/// New pages are encrypted without asking (`encrypt_new_pages` in notebook.mumbin).
#[tauri::command(async)]
pub fn vault_encrypt_new(state: State<'_, AppState>, on: bool) -> CommandResult<VaultStatus> {
    let state = state.write()?;
    let notebook = state.notebook()?;
    if !notebook.has_vault()? {
        return Err(mumbin_core::NotebookError::Crypto(CryptoError::NoVault).into());
    }
    let changed = notebook.with_properties(
        "Notebook",
        &[("encrypt_new_pages", if on { "True" } else { "False" })],
    )?;
    state.update_notebook(changed);
    status_of(&state)
}

/// Names of the pages that are encrypted with the vault, open or not.
#[tauri::command(async)]
pub fn vault_pages(state: State<'_, AppState>) -> CommandResult<Vec<String>> {
    let state = state.read();
    // A notebook that hides its file names has nothing to list while it is locked.
    if state.notebook()?.is_locked() {
        return Ok(Vec::new());
    }
    let index = state.index()?;
    Ok(index
        .pages()
        .iter()
        .filter(|page| page.encrypted && !page.own_password)
        .map(|page| page.info.name.to_string())
        .collect())
}

/// Writes the decryption tool into a folder the person picks and returns its path. The
/// owner keeps it as a safety net: with it and the passphrase the notes can be read
/// even when this program no longer exists.
#[tauri::command(async)]
pub fn decrypt_tool_save(app: AppHandle) -> CommandResult<Option<String>> {
    let Some(folder) = choose_folder(&app, "mumbin_decrypt.py".to_owned(), e2e::export_dir())
    else {
        return Ok(None);
    };
    let target = first_free_name(&folder, "mumbin_decrypt", ".py")?;
    let mut temporary = tempfile::NamedTempFile::new_in(&folder)?;
    temporary.write_all(DECRYPT_TOOL.as_bytes())?;
    temporary.as_file().sync_all()?;
    temporary
        .persist_noclobber(&target)
        .map_err(|error| error.error)?;
    Ok(Some(target.to_string_lossy().into_owned()))
}
