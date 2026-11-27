//! Start-up, opening and creating notebooks, the recent list and preferences.

use std::path::{Path, PathBuf};

use mumbin_core::Notebook;
use mumbin_core::crypto::{VAULT_BACKUP, VAULT_FILE};
use serde::Serialize;
use tauri::{AppHandle, State};

use super::choose_folder;
use crate::e2e;
use crate::error::{CommandError, CommandResult};
use crate::settings;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookInfo {
    name: String,
    folder: String,
    home: String,
    /// Sealed and not opened with the passphrase yet: nothing can be listed or read.
    locked: bool,
}

impl NotebookInfo {
    fn of(notebook: &Notebook) -> Self {
        NotebookInfo {
            name: notebook.name(),
            folder: notebook.folder().to_string_lossy().into_owned(),
            home: notebook.home().to_string(),
            locked: notebook.is_locked(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentNotebook {
    folder: String,
    name: String,
    exists: bool,
    /// The notebook has an encryption vault (passphrase): shown with a lock.
    protected: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Startup {
    version: &'static str,
    notebook: Option<NotebookInfo>,
    preferences: serde_json::Value,
    /// Tests only (`MUMBIN_E2E=1`): the page then offers a handle to replay events
    /// that only the operating system can create.
    e2e: bool,
    /// Tests only (`MUMBIN_E2E_DOCK_OPEN=1`): the dock of a first start is open, not folded.
    e2e_dock_open: bool,
    /// Why the notebook used last was not opened, if that is worth telling.
    notice: Option<&'static str>,
}

/// A notebook may be given as its folder or as the `notebook.mumbin` inside it.
fn notebook_folder(path: &Path) -> PathBuf {
    if path.is_file() {
        path.parent().map(Path::to_owned).unwrap_or_default()
    } else {
        path.to_owned()
    }
}

fn open_and_remember(state: &AppState, folder: &Path) -> CommandResult<NotebookInfo> {
    let mut notebook = Notebook::open(&notebook_folder(folder))?;
    // A section of the notebook file that belongs to a feature the program no longer has
    // is removed; where the file cannot be written it stays and is ignored.
    if !state.is_read_only()
        && let Ok(cleaned) = notebook.without_section("Journal")
    {
        notebook = cleaned;
    }
    let folder = notebook.folder().to_owned();
    // Clones share the keys of a notebook that hides its file names: what it says about itself
    // is read after the window took it over (and gave it the keys of an open vault).
    let probe = notebook.clone();
    state.open_notebook(notebook)?;
    let info = NotebookInfo::of(&probe);
    // Only a notebook that really opened becomes the one used last.
    settings::remember_notebook(&folder, &info.name);
    Ok(info)
}

/// Called once by the webview: opens the notebook given on the command line,
/// else the one used last.
#[tauri::command(async)]
pub fn startup(state: State<'_, AppState>) -> Startup {
    let state = state.read();
    state.private_files.cleanup_orphans();
    let candidate = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .or_else(settings::last_notebook);
    let (notebook, notice) = match candidate.map(|folder| open_and_remember(&state, &folder)) {
        Some(Ok(info)) => (Some(info), None),
        Some(Err(error)) => (
            None,
            (error.code() == "notebook-in-use").then_some("notebook-in-use"),
        ),
        None => (None, None),
    };
    Startup {
        version: mumbin_core::VERSION,
        notebook,
        notice,
        preferences: settings::preferences(),
        e2e: e2e::enabled(),
        e2e_dock_open: e2e::dock_open(),
    }
}

/// Switches read-only mode on or off for the whole program.
#[tauri::command(async)]
pub fn read_only_set(state: State<'_, AppState>, on: bool) {
    state.read().set_read_only(on);
}

#[tauri::command(async)]
pub fn preferences_save(preferences: serde_json::Value) {
    settings::set_preferences(preferences);
}

/// Lets the person choose a folder; `None` when the dialog was cancelled.
#[tauri::command(async)]
pub fn pick_folder(app: AppHandle, title: String) -> Option<String> {
    choose_folder(&app, title, e2e::pick_dir()).map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command(async)]
pub fn notebook_open(state: State<'_, AppState>, folder: String) -> CommandResult<NotebookInfo> {
    let state = state.read();
    open_and_remember(&state, Path::new(&folder))
}

#[tauri::command(async)]
pub fn notebook_create(
    state: State<'_, AppState>,
    folder: String,
    name: String,
) -> CommandResult<NotebookInfo> {
    let state = state.read();
    let notebook = Notebook::create(Path::new(&folder), name.trim())?;
    let info = NotebookInfo::of(&notebook);
    let folder = notebook.folder().to_owned();
    state.open_notebook(notebook)?;
    // Only a notebook that really opened becomes the one used last.
    settings::remember_notebook(&folder, &info.name);
    Ok(info)
}

#[tauri::command(async)]
pub fn notebook_recent() -> Vec<RecentNotebook> {
    settings::recent_notebooks()
        .into_iter()
        .map(|entry| {
            let path = Path::new(&entry.folder);
            RecentNotebook {
                exists: path.is_dir(),
                protected: path.join(VAULT_FILE).is_file() || path.join(VAULT_BACKUP).is_file(),
                folder: entry.folder,
                name: entry.name,
            }
        })
        .collect()
}

#[tauri::command(async)]
pub fn notebook_forget(folder: String) {
    settings::forget_notebook(&folder);
}

/// Settings of the open notebook that live in its `notebook.mumbin`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookSettings {
    /// Deleting never uses the recycle bin.
    disable_trash: bool,
    /// Name of the page whose text new pages start with; empty for the built-in template.
    template: String,
}

fn settings_of(notebook: &Notebook) -> NotebookSettings {
    NotebookSettings {
        disable_trash: super::trash_disabled(notebook),
        template: notebook
            .property("default_page_template")
            .unwrap_or_default()
            .to_owned(),
    }
}

#[tauri::command(async)]
pub fn notebook_settings(state: State<'_, AppState>) -> CommandResult<NotebookSettings> {
    Ok(settings_of(&state.read().notebook()?))
}

/// Saves the settings. The template must be an existing page (or empty).
#[tauri::command(async)]
pub fn notebook_settings_save(
    state: State<'_, AppState>,
    disable_trash: bool,
    template: String,
) -> CommandResult<NotebookSettings> {
    let state = state.write()?;
    let notebook = state.notebook()?;
    let template = template.trim();
    if !template.is_empty() {
        let chosen = mumbin_core::PageName::from_input(template)?;
        let keys = state.open_keys();
        if notebook.read_page_with(&chosen, keys.keys())?.is_none() {
            return Err(CommandError::new("not-found", "there is no such page"));
        }
    }
    let template = if template.is_empty() {
        String::new()
    } else {
        mumbin_core::PageName::from_input(template)?.to_string()
    };
    let changed = notebook.with_properties(
        "Notebook",
        &[
            (
                "disable_trash",
                if disable_trash { "True" } else { "False" },
            ),
            ("default_page_template", &template),
        ],
    )?;
    state.update_notebook(changed);
    Ok(settings_of(&state.notebook()?))
}
