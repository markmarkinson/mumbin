//! Attachments of a page, opening files and addresses, and pictures for the editor.

use std::ffi::OsString;
use std::path::Path;
use std::sync::Arc;

use mumbin_core::crypto::{FileSeal, PageKey, Vault};
use mumbin_core::ops::{Attachment, AttachmentRename, is_executable, is_openable_url};
use mumbin_core::{Notebook, NotebookError, PageName};
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use super::{open_path, page_or_root, trash_disabled};
use crate::e2e;
use crate::error::{CommandError, CommandResult};
use crate::state::AppState;

/// Largest pasted file that is stored (the page also limits it before sending).
const MAX_STORED_BYTES: usize = 64 * 1024 * 1024;

/// Most files taken from one drop; more is almost certainly a mistake.
const MAX_DROPPED: usize = 200;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum OpenOutcome {
    Opened,
    /// A program or script: shown in the file manager instead of run.
    Revealed,
    Missing,
    /// On another machine: not touched.
    Remote,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    outcome: OpenOutcome,
    path: String,
}

impl Opened {
    fn new(outcome: OpenOutcome, path: &Path) -> Self {
        Opened {
            outcome,
            path: path.to_string_lossy().into_owned(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DropResult {
    /// Wiki text for each file that could be referenced.
    texts: Vec<String>,
    /// Names of the copies made in the page's attachment folder.
    added: Vec<String>,
    /// Paths that could not be taken over (missing, a folder to copy, ...).
    skipped: Vec<String>,
}

/// What files of a page are sealed with: the vault, or the key of a page with its own password.
enum Sealer {
    Vault(Arc<Vault>),
    Page(Arc<PageKey>),
}

impl Sealer {
    fn seal(&self) -> &dyn FileSeal {
        match self {
            Sealer::Vault(vault) => &**vault,
            Sealer::Page(key) => &**key,
        }
    }

    /// The vault, for a notebook that keeps names and files under it.
    fn vault(&self) -> Option<&Vault> {
        match self {
            Sealer::Vault(vault) => Some(vault),
            Sealer::Page(_) => None,
        }
    }
}

/// What files of this page must be sealed with, if they must be: the page is stored encrypted,
/// or the whole notebook hides its file names. A locked page cannot take files.
fn sealer_for(
    state: &AppState,
    notebook: &Notebook,
    page: &PageName,
) -> CommandResult<Option<Sealer>> {
    // In a notebook that hides its file names everything is sealed, whether the page exists or not.
    if notebook.is_sealed() {
        return Ok(Some(Sealer::Vault(state.require_vault()?)));
    }
    Ok(match notebook.read_page(page)? {
        Some(loaded) if loaded.own_password => Some(Sealer::Page(
            state.open_keys().page(page).ok_or(NotebookError::Locked)?,
        )),
        Some(loaded) if loaded.encrypted => Some(Sealer::Vault(state.require_vault()?)),
        _ => None,
    })
}

#[tauri::command(async)]
pub fn attachments_list(
    state: State<'_, AppState>,
    name: String,
) -> CommandResult<Vec<Attachment>> {
    let state = state.read();
    Ok(state.notebook()?.attachments(&page_or_root(&name)?)?)
}

/// Lets the person choose files and copies them into the page's folder.
/// Returns the names of the copies.
#[tauri::command(async)]
pub fn attachment_add(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    title: String,
) -> CommandResult<Vec<String>> {
    let state = state.write()?;
    let notebook = state.notebook()?;
    let page = page_or_root(&name)?;
    let Some(files) = app.dialog().file().set_title(title).blocking_pick_files() else {
        return Ok(Vec::new());
    };
    let sealer = sealer_for(&state, &notebook, &page)?;
    let mut added = Vec::new();
    for path in files.into_iter().filter_map(|file| file.into_path().ok()) {
        added.push(match sealer.as_ref().and_then(Sealer::vault) {
            Some(vault) if notebook.is_sealed() => {
                notebook.attach_file_sealed(&page, &path, vault)?
            }
            _ => notebook.attach_file(&page, &path)?,
        });
    }
    if let Some(sealer) = sealer {
        notebook.convert_attachments(&page, sealer.seal(), true)?;
    }
    Ok(added)
}

/// Stores data handed over by the webview (a pasted or dropped picture).
#[tauri::command(async)]
pub fn attachment_store(
    state: State<'_, AppState>,
    name: String,
    file_name: String,
    data: Vec<u8>,
) -> CommandResult<String> {
    let state = state.write()?;
    if data.len() > MAX_STORED_BYTES {
        return Err(CommandError::new(
            "too-large",
            "the file is too large to store",
        ));
    }
    let notebook = state.notebook()?;
    let page = page_or_root(&name)?;
    Ok(match sealer_for(&state, &notebook, &page)? {
        Some(Sealer::Vault(vault)) => {
            notebook.attach_bytes_sealed(&page, &file_name, &data, &vault)?
        }
        Some(Sealer::Page(key)) => notebook.attach_bytes_with(&page, &file_name, &data, &*key)?,
        None => notebook.attach_bytes(&page, &file_name, &data)?,
    })
}

/// Moves an attachment of the page to the recycle bin.
#[tauri::command(async)]
pub fn attachment_delete(
    state: State<'_, AppState>,
    name: String,
    file: String,
) -> CommandResult<()> {
    let state = state.write()?;
    let notebook = state.notebook()?;
    notebook.delete_attachment(&page_or_root(&name)?, &file, trash_disabled(&notebook))?;
    state.touch();
    Ok(())
}

/// Errors of an attachment rename that need their own words.
fn rename_error(error: NotebookError) -> CommandError {
    match error {
        NotebookError::AlreadyExists(_) => {
            CommandError::new("attachment-exists", "a file with this name exists")
        }
        NotebookError::Io(io) if io.kind() == std::io::ErrorKind::InvalidInput => {
            CommandError::new("attachment-name", "not a usable file name")
        }
        other => other.into(),
    }
}

/// Renames an attachment and the links to it on the page.
#[tauri::command(async)]
pub fn attachment_rename(
    state: State<'_, AppState>,
    name: String,
    file: String,
    new_name: String,
) -> CommandResult<AttachmentRename> {
    let state = state.write()?;
    let keys = state.open_keys();
    let report = state
        .notebook()?
        .rename_attachment_with(&page_or_root(&name)?, &file, &new_name, keys.keys())
        .map_err(rename_error)?;
    state.touch();
    Ok(report)
}

/// Opens `path`, or shows it in the file manager when it is a program or script.
/// `tolerate_failure` lets tests run where no program can be started.
fn open_or_reveal(app: &AppHandle, path: &Path, tolerate_failure: bool) -> CommandResult<Opened> {
    let reveal = path.is_file() && is_executable(path);
    let result = if reveal {
        app.opener()
            .reveal_item_in_dir(path)
            .map_err(CommandError::io)
    } else {
        open_path(app, path)
    };
    if !tolerate_failure {
        result?;
    }
    let outcome = if reveal {
        OpenOutcome::Revealed
    } else {
        OpenOutcome::Opened
    };
    Ok(Opened::new(outcome, path))
}

/// Opens the target of a file link with its default program. Programs and
/// scripts are never started; their folder is shown instead.
#[tauri::command(async)]
pub fn file_open(
    app: AppHandle,
    state: State<'_, AppState>,
    page: String,
    target: String,
) -> CommandResult<Opened> {
    let state = state.read();
    let notebook = state.notebook()?;
    let path = notebook
        .resolve_file(&page_or_root(&page)?, &target)
        .ok_or_else(|| CommandError::new("not-found", "the link has no file target"))?;
    // Even asking whether a `\\server\share` file exists makes Windows connect to
    // that server and hand over the user's credentials.
    if notebook.is_foreign_remote(&path) {
        return Ok(Opened::new(OpenOutcome::Remote, &path));
    }
    // A sealed file is opened as a plain copy in the program's own temporary folder,
    // which is emptied when the vault is locked and at the next start.
    if notebook.is_sealed_only(&path) {
        let bytes = notebook.read_attachment(&path, state.open_keys().keys())?;
        // The plain copy carries the real name (with its extension), not the opaque one of a
        // notebook that hides its file names.
        let file_name = if notebook.is_sealed() {
            OsString::from(
                target
                    .replace('\\', "/")
                    .rsplit('/')
                    .next()
                    .unwrap_or_default(),
            )
        } else {
            path.file_name().unwrap_or_default().to_owned()
        };
        let copy = state.private_files.stage(Path::new(&file_name), &bytes)?;
        return open_or_reveal(&app, &copy, e2e::enabled());
    }
    if !path.exists() {
        return Ok(Opened::new(OpenOutcome::Missing, &path));
    }
    open_or_reveal(&app, &path, false)
}

/// Shows the page's attachment folder in the file manager, creating it if
/// the page has none yet.
#[tauri::command(async)]
pub fn folder_open(app: AppHandle, state: State<'_, AppState>, name: String) -> CommandResult<()> {
    let state = state.read();
    let folder = state.notebook()?.page_folder(&page_or_root(&name)?);
    std::fs::create_dir_all(&folder)?;
    open_path(&app, &folder)
}

/// Opens a web or mail address in the default program. Other schemes are
/// refused.
#[tauri::command(async)]
pub fn url_open(app: AppHandle, url: String) -> CommandResult<()> {
    if !is_openable_url(&url) {
        return Err(CommandError::new(
            "blocked-url",
            "only web and mail addresses are opened",
        ));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(CommandError::io)
}

/// Raw bytes of a picture referenced on a page. Only picture files inside the
/// notebook or its document root are returned; the webview turns the bytes
/// into an object URL, which the content security policy allows.
#[tauri::command(async)]
pub fn picture_read(
    state: State<'_, AppState>,
    page: String,
    src: String,
) -> CommandResult<tauri::ipc::Response> {
    let state = state.read();
    let notebook = state.notebook()?;
    let page = page_or_root(&page)?;
    let keys = state.open_keys();
    let bytes = notebook.read_picture(&page, &src, keys.keys())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Takes files dropped onto a page: copies them into the page's attachment
/// folder or, with `link_only`, only refers to them where they are.
#[tauri::command(async)]
pub fn attachment_drop(
    state: State<'_, AppState>,
    name: String,
    paths: Vec<String>,
    link_only: bool,
) -> CommandResult<DropResult> {
    let state = state.write()?;
    let notebook = state.notebook()?;
    let page = page_or_root(&name)?;
    let sealer = sealer_for(&state, &notebook, &page)?;
    let mut result = DropResult {
        texts: Vec::new(),
        added: Vec::new(),
        skipped: Vec::new(),
    };
    for path in paths.iter().take(MAX_DROPPED) {
        let shown = Path::new(path)
            .file_name()
            .map_or_else(|| path.clone(), |name| name.to_string_lossy().into_owned());
        let vault = sealer.as_ref().and_then(Sealer::vault);
        match notebook.reference_file_with(&page, Path::new(path), link_only, vault) {
            Ok(done) => {
                result.added.extend(done.copied);
                match done.text {
                    Some(text) => result.texts.push(text),
                    None => result.skipped.push(shown),
                }
            }
            Err(_) => result.skipped.push(shown),
        }
    }
    if let Some(sealer) = sealer {
        let _ = notebook.convert_attachments(&page, sealer.seal(), true);
    }
    result
        .skipped
        .extend(paths.iter().skip(MAX_DROPPED).cloned());
    Ok(result)
}
