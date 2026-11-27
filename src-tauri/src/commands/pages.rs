//! Reading, saving, moving and deleting pages.

use mumbin_core::notebook::SaveMode;
use mumbin_core::ops::MoveReport;
use mumbin_core::{Expect, FileStamp, PageName, SaveOutcome};
use serde::Serialize;
use tauri::State;

use super::{page_or_root, trash_disabled};
use crate::error::CommandResult;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    name: String,
    basename: String,
    has_content: bool,
    has_children: bool,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageContent {
    name: String,
    exists: bool,
    body: String,
    stamp: Option<String>,
    /// Encrypted and its key is not open: the text is not available.
    locked: bool,
    /// The page has a password of its own (so the vault does not open it).
    own_password: bool,
}

/// What a save reports: the new stamp of the file, `None` when the page has no file now.
#[derive(Debug, Serialize)]
pub struct SaveResult {
    stamp: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletionSize {
    pages: usize,
    attachments: usize,
    /// Deleting cannot use the recycle bin (notebook setting `disable_trash`).
    permanent: bool,
}

/// The text a page that does not exist yet starts with, made from the page template.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPageText {
    text: String,
    /// Where the cursor goes, in the editor's units.
    cursor: usize,
}

/// Children of `parent`; the empty string is the notebook root.
#[tauri::command(async)]
pub fn page_children(state: State<'_, AppState>, parent: String) -> CommandResult<Vec<TreeEntry>> {
    let state = state.read();
    let entries = state
        .notebook()?
        .children(&page_or_root(&parent)?)?
        .into_iter()
        .map(|page| TreeEntry {
            basename: page.name.basename().to_owned(),
            name: page.name.to_string(),
            has_content: page.has_content,
            has_children: page.has_children,
        })
        .collect();
    Ok(entries)
}

/// Turns typed text into a canonical page name.
#[tauri::command]
pub fn page_name_from_input(input: String) -> CommandResult<String> {
    Ok(PageName::from_input(&input)?.to_string())
}

#[tauri::command(async)]
pub fn page_read(state: State<'_, AppState>, name: String) -> CommandResult<PageContent> {
    let state = state.read();
    let page = PageName::new(&name)?;
    let keys = state.open_keys();
    let notebook = state.notebook()?;
    let content = match notebook.read_page_with(&page, keys.keys())? {
        Some(loaded) => {
            // A password change that could not move every file into place is finished as soon as
            // the page is read with its key.
            if loaded.own_password
                && !loaded.locked
                && let Some(key) = keys.page(&page)
            {
                let _ = notebook.finish_pending_rekey(&page, &*key);
            }
            PageContent {
                name,
                exists: true,
                body: loaded.body,
                stamp: Some(loaded.stamp.as_str().to_owned()),
                locked: loaded.locked,
                own_password: loaded.own_password,
            }
        }
        None => PageContent {
            name,
            ..PageContent::default()
        },
    };
    Ok(content)
}

#[tauri::command(async)]
pub fn page_template(
    state: State<'_, AppState>,
    name: String,
    language: String,
) -> CommandResult<NewPageText> {
    let state = state.read();
    let notebook = state.notebook()?;
    let page = PageName::new(&name)?;
    // The page the notebook uses as template, when it exists and can be read (not locked).
    let keys = state.open_keys();
    let template = notebook
        .property("default_page_template")
        .and_then(|chosen| PageName::new(chosen).ok())
        .and_then(|chosen| notebook.read_page_with(&chosen, keys.keys()).ok().flatten())
        .filter(|loaded| !loaded.locked)
        .map(|loaded| loaded.body);
    let rendered = mumbin_core::template::new_page(
        template.as_deref(),
        &page,
        &language,
        mumbin_core::template::local_now(),
    );
    Ok(NewPageText {
        cursor: rendered.cursor_utf16(),
        text: rendered.text,
    })
}

/// Saves a page. `stamp` is the one received when the page was read (`None`
/// for a page that did not exist); `force` overwrites after a conflict.
#[tauri::command(async)]
pub fn page_save(
    state: State<'_, AppState>,
    name: String,
    body: String,
    stamp: Option<String>,
    force: bool,
) -> CommandResult<SaveResult> {
    let state = state.write()?;
    let page = PageName::new(&name)?;
    let stamp = stamp.as_deref().map(FileStamp::from);
    let expect = match (&stamp, force) {
        (_, true) => Expect::Anything,
        (Some(stamp), false) => Expect::Stamp(stamp),
        (None, false) => Expect::Missing,
    };
    let keys = state.open_keys();
    let outcome =
        state
            .notebook()?
            .save_page_with(&page, &body, expect, keys.keys(), SaveMode::Keep)?;
    state.touch();
    let stamp = match outcome {
        SaveOutcome::Saved(stamp) | SaveOutcome::Unchanged(stamp) => {
            Some(stamp.as_str().to_owned())
        }
        SaveOutcome::Removed => None,
    };
    Ok(SaveResult { stamp })
}

/// Moves or renames a page with everything below it.
#[tauri::command(async)]
pub fn page_move(
    state: State<'_, AppState>,
    from: String,
    to: String,
    update_links: bool,
) -> CommandResult<MoveReport> {
    let state = state.write()?;
    let (from, to) = (PageName::new(&from)?, PageName::from_input(&to)?);
    let keys = state.open_keys();
    let report = state
        .notebook()?
        .move_page_with(&from, &to, update_links, keys.keys())?;
    state.relocate_page_keys(&from, &to);
    state.touch();
    Ok(report)
}

#[tauri::command(async)]
pub fn page_deletion_size(state: State<'_, AppState>, name: String) -> CommandResult<DeletionSize> {
    let state = state.read();
    let notebook = state.notebook()?;
    let (pages, attachments) = notebook.deletion_size(&PageName::new(&name)?)?;
    Ok(DeletionSize {
        pages,
        attachments,
        permanent: trash_disabled(&notebook),
    })
}

/// Deletes a page with its sub-pages and attachments into the recycle bin.
#[tauri::command(async)]
pub fn page_delete(
    state: State<'_, AppState>,
    name: String,
    permanently: bool,
) -> CommandResult<()> {
    let state = state.write()?;
    let notebook = state.notebook()?;
    let page = PageName::new(&name)?;
    notebook.delete_page(&page, permanently || trash_disabled(&notebook))?;
    state.forget_pages_within(&page);
    state.touch();
    Ok(())
}
