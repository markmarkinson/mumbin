//! Questions the index answers: links, names, tags, tasks, search, recent changes.

use std::time::UNIX_EPOCH;

use mumbin_core::PageName;
use mumbin_core::search::SearchResults;
use mumbin_core::tasks::Task;
use serde::Serialize;
use tauri::State;

use super::page_or_root;
use crate::error::CommandResult;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedLink {
    name: String,
    anchor: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageRef {
    name: String,
    exists: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    tag: String,
    count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentPage {
    name: String,
    /// Seconds since 1970.
    modified: u64,
}

/// Most hits of one search.
const MAX_SEARCH_HITS: usize = 200;
/// Length of the list of recent changes.
const MAX_RECENT_CHANGES: usize = 50;

#[tauri::command(async)]
pub fn page_resolve_link(
    state: State<'_, AppState>,
    source: String,
    target: String,
) -> CommandResult<ResolvedLink> {
    let state = state.read();
    let resolved = state
        .index()?
        .tree()
        .resolve(&page_or_root(&source)?, &target)?;
    Ok(ResolvedLink {
        name: resolved.to_string(),
        anchor: target
            .split_once('#')
            .map_or("", |(_, anchor)| anchor)
            .to_owned(),
    })
}

#[tauri::command(async)]
pub fn page_backlinks(state: State<'_, AppState>, name: String) -> CommandResult<Vec<String>> {
    let state = state.read();
    let index = state.index()?;
    Ok(index
        .backlinks(&PageName::new(&name)?)
        .into_iter()
        .map(PageName::to_string)
        .collect())
}

/// Every page name, followed by link targets that have no page yet.
#[tauri::command(async)]
pub fn index_names(state: State<'_, AppState>) -> CommandResult<Vec<PageRef>> {
    let state = state.read();
    let index = state.index()?;
    let mut names: Vec<PageRef> = index
        .pages()
        .iter()
        .map(|page| PageRef {
            name: page.info.name.to_string(),
            exists: page.info.has_content,
        })
        .collect();
    names.extend(index.placeholders().into_iter().map(|(name, _)| PageRef {
        name: name.to_string(),
        exists: false,
    }));
    Ok(names)
}

#[tauri::command(async)]
pub fn tags_list(state: State<'_, AppState>) -> CommandResult<Vec<TagCount>> {
    let state = state.read();
    let index = state.index()?;
    Ok(index
        .tags()
        .into_iter()
        .map(|(tag, count)| TagCount { tag, count })
        .collect())
}

#[tauri::command(async)]
pub fn tag_pages(state: State<'_, AppState>, tag: String) -> CommandResult<Vec<String>> {
    let state = state.read();
    let index = state.index()?;
    Ok(index
        .pages_with_tag(&tag)
        .into_iter()
        .map(PageName::to_string)
        .collect())
}

#[tauri::command(async)]
pub fn tasks_list(state: State<'_, AppState>) -> CommandResult<Vec<Task>> {
    let state = state.read();
    // The list is asked for on purpose, often right after a change; pages
    // edited by other programs must show up even within the cache window.
    state.touch();
    Ok(state.index()?.tasks())
}

#[tauri::command(async)]
pub fn notebook_search(state: State<'_, AppState>, query: String) -> CommandResult<SearchResults> {
    let state = state.read();
    let index = state.index()?;
    Ok(index.search(&query, MAX_SEARCH_HITS))
}

#[tauri::command(async)]
pub fn recent_changes(state: State<'_, AppState>) -> CommandResult<Vec<RecentPage>> {
    let state = state.read();
    let index = state.index()?;
    Ok(index
        .recent(MAX_RECENT_CHANGES)
        .into_iter()
        .map(|page| RecentPage {
            name: page.info.name.to_string(),
            modified: page
                .modified
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |duration| duration.as_secs()),
        })
        .collect())
}
