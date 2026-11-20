//! Export to HTML and the print view.

use std::path::{Path, PathBuf};

use mumbin_core::export::{ExportReport, Texts};
use tauri::{AppHandle, State};

use super::{choose_folder, first_free_name, open_path, page_or_root};
use crate::e2e;
use crate::error::{CommandError, CommandResult};
use crate::state::AppState;

/// A name for the export folder that Windows accepts.
fn folder_label(text: &str) -> String {
    let cleaned: String = text
        .chars()
        .map(|c| {
            if c.is_control() || r#"<>:"/\|?*"#.contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.trim_matches(|c: char| c == '.' || c.is_whitespace());
    if cleaned.is_empty() {
        "export".to_owned()
    } else {
        cleaned.chars().take(80).collect()
    }
}

/// Writes the notebook, or one page with its sub-pages, as HTML into a new
/// folder inside a folder the person picks. The webview names no path:
/// the folder dialog is shown here, and what is written lies in a new
/// sub-folder, so nothing existing is replaced. `None` when cancelled.
#[tauri::command(async)]
pub fn export_html(
    app: AppHandle,
    state: State<'_, AppState>,
    scope: Option<String>,
    texts: Texts,
) -> CommandResult<Option<ExportReport>> {
    let state = state.read();
    let notebook = state.notebook()?;
    let scope = match scope.as_deref() {
        None | Some("") => None,
        Some(name) => Some(page_or_root(name)?),
    };
    let Some(parent) = choose_folder(&app, texts.contents.clone(), e2e::export_dir()) else {
        return Ok(None);
    };
    if std::fs::canonicalize(&parent).is_ok_and(|folder| folder.starts_with(notebook.folder())) {
        return Err(CommandError::new(
            "export-inside",
            "the export folder must lie outside the notebook",
        ));
    }
    let label = folder_label(
        &scope
            .as_ref()
            .map_or_else(|| notebook.name(), |page| page.basename().to_owned()),
    );
    let destination = first_free_name(&parent, &label, "")?;
    let index = state.index()?;
    let report = index.export_html_with(
        &notebook,
        scope.as_ref(),
        &destination,
        &texts,
        state.open_keys().keys(),
    )?;
    state.set_last_export(PathBuf::from(&report.entry));
    Ok(Some(report))
}

/// Opens the first file of the last export in the default browser.
#[tauri::command(async)]
pub fn export_show(app: AppHandle, state: State<'_, AppState>) -> CommandResult<()> {
    let state = state.read();
    let entry = state
        .last_export()
        .ok_or_else(|| CommandError::new("not-found", "nothing was exported yet"))?;
    if e2e::export_dir().is_some() {
        return Ok(());
    }
    open_path(&app, &entry)
}

/// Makes a print view of the page as shown in the editor (with its pictures
/// inside) and opens it in the default browser, which has the print dialog.
/// Returns the file written.
#[tauri::command(async)]
pub fn page_print(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    body: String,
    texts: Texts,
) -> CommandResult<String> {
    let state = state.read();
    let notebook = state.notebook()?;
    let page = page_or_root(&name)?;
    let index = state.index()?;
    let html = index.print_html_with(&notebook, &page, &body, &texts, state.open_keys().keys());
    let file = state.private_files.stage(
        Path::new(&format!("{}.html", folder_label(page.basename()))),
        html.as_bytes(),
    )?;
    if e2e::export_dir().is_none() {
        open_path(&app, &file)?;
    }
    Ok(file.to_string_lossy().into_owned())
}
