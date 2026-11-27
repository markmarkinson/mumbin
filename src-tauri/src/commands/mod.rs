//! Commands the webview may call. Each one is a thin wrapper around
//! `mumbin-core`; no notebook logic lives here.
//!
//! The webview never passes file paths of pages. It names pages, and the
//! core maps names to files inside the open notebook. A command starts with
//! `state.read()` or `state.write()`, which serialises it with the others and,
//! for `write`, refuses it in read-only mode.

// The commands receive their arguments by value: that is what `tauri::command` hands them.
#![allow(clippy::needless_pass_by_value)]

pub mod about;
pub mod attachments;
pub mod clipboard;
pub mod export;
pub mod index;
pub mod notebooks;
pub mod page_password;
pub mod pages;
pub mod vault;

use std::path::{Path, PathBuf};

use mumbin_core::{Notebook, PageName};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::error::{CommandError, CommandResult};

/// A page name sent by the webview; the empty string is the notebook root.
fn page_or_root(name: &str) -> CommandResult<PageName> {
    if name.is_empty() {
        Ok(PageName::root())
    } else {
        Ok(PageName::new(name)?)
    }
}

/// The notebook setting that forbids the recycle bin.
fn trash_disabled(notebook: &Notebook) -> bool {
    notebook.property("disable_trash") == Some("True")
}

/// Opens a file or folder with its default program.
fn open_path(app: &AppHandle, path: &Path) -> CommandResult<()> {
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(CommandError::io)
}

/// Lets the person choose a folder. A test hook, when given, answers instead of the dialog.
fn choose_folder(app: &AppHandle, title: String, test_hook: Option<PathBuf>) -> Option<PathBuf> {
    test_hook.or_else(|| {
        app.dialog()
            .file()
            .set_title(title)
            .blocking_pick_folder()
            .and_then(|folder| folder.into_path().ok())
    })
}

/// `folder/stem.extension`, else `folder/stem (2).extension`, ... the first that is free.
fn first_free_name(folder: &Path, stem: &str, extension: &str) -> CommandResult<PathBuf> {
    (1..1000)
        .map(|number| {
            if number == 1 {
                folder.join(format!("{stem}{extension}"))
            } else {
                folder.join(format!("{stem} ({number}){extension}"))
            }
        })
        .find(|candidate| std::fs::symlink_metadata(candidate).is_err())
        .ok_or_else(|| CommandError::io("no free file name"))
}
