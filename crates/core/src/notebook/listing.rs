//! Listing the page tree: the children of one page, or every page in a single walk.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::time::SystemTime;

use super::files::{is_hidden, is_link, is_page_file, pin_directory, read_dir_if_exists};
use super::{Notebook, NotebookError, PAGE_EXTENSION};
use crate::crypto::names::{LayoutKeys, NameKind};
use crate::pagename::PageName;

/// Size and modification time of a page file, as the directory listing
/// reports them (no separate look at each file is needed for them).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileFacts {
    pub size: u64,
    pub modified: Option<SystemTime>,
}

/// One entry in the page tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageInfo {
    pub name: PageName,
    /// A page file exists.
    pub has_content: bool,
    /// At least one page exists somewhere below this one.
    pub has_children: bool,
}

impl PageInfo {
    fn new(name: PageName) -> Self {
        PageInfo {
            name,
            has_content: false,
            has_children: false,
        }
    }

    /// Notes that a page file (`is_dir` false) or a folder of sub-pages exists for this name.
    fn mark(&mut self, is_dir: bool) {
        if is_dir {
            self.has_children = true;
        } else {
            self.has_content = true;
        }
    }
}

/// Folder depth beyond which nothing is searched for pages (the longest page name).
const MAX_DEPTH: usize = 128;

type Walked = (PageInfo, Option<FileFacts>);

impl Notebook {
    /// Direct children of `parent` in natural, case-insensitive order.
    pub fn children(&self, parent: &PageName) -> Result<Vec<PageInfo>, NotebookError> {
        let keys = self.layout_keys()?;
        let folder = self.page_folder(parent);
        let _parents = self.guard_parent(&folder.join(".listing"), false)?;
        self.check_path(&folder)?;
        let Some(entries) = read_dir_if_exists(&folder)? else {
            return Ok(Vec::new());
        };
        let mut found: BTreeMap<PageName, PageInfo> = BTreeMap::new();
        for entry in entries {
            let entry = entry?;
            let metadata = entry.metadata()?;
            let Some((name, is_dir)) = self.tree_entry(keys.as_deref(), parent, &entry, &metadata)
            else {
                continue;
            };
            let holds_page = if is_dir {
                contains_pages(&entry.path(), 0, keys.is_some())
            } else {
                is_page_file(&entry.path())
            };
            if holds_page {
                found
                    .entry(name.clone())
                    .or_insert_with(|| PageInfo::new(name))
                    .mark(is_dir);
            }
        }
        let mut pages: Vec<PageInfo> = found.into_values().collect();
        pages.sort_by_cached_key(|page| page.name.sort_key());
        Ok(pages)
    }

    /// Every page of the notebook in natural order, found in a single walk,
    /// with the facts of each page file.
    ///
    /// `known` tells what an earlier walk found for a page. A file that still
    /// has exactly those facts is taken as the page it was, without being
    /// opened to look at its first line again. That look costs a file open per
    /// page and is most of the time a walk takes in a large notebook.
    ///
    /// Same rules as [`Notebook::children`]: hidden names, links (junctions
    /// too) and names that are not page names are skipped, and a folder only
    /// counts if a page lies somewhere below it.
    pub fn scan_pages(
        &self,
        known: &dyn Fn(&PageName) -> Option<FileFacts>,
    ) -> Result<Vec<(PageInfo, Option<FileFacts>)>, NotebookError> {
        self.layout_keys()?;
        self.check_path(&self.folder)?;
        let mut found = Vec::new();
        self.scan_folder(&self.folder, &PageName::root(), known, &mut found)?;
        found.sort_by_cached_key(|(page, _)| page.name.sort_key());
        Ok(found)
    }

    /// Adds the pages in `folder` and below to `out`; false when there are none.
    fn scan_folder(
        &self,
        folder: &Path,
        parent: &PageName,
        known: &dyn Fn(&PageName) -> Option<FileFacts>,
        out: &mut Vec<Walked>,
    ) -> Result<bool, NotebookError> {
        let keys = self.layout_keys()?;
        let _parents = self.guard_parent(&folder.join(".listing"), false)?;
        let Some(entries) = read_dir_if_exists(folder)? else {
            return Ok(false);
        };
        let mut found: BTreeMap<PageName, Walked> = BTreeMap::new();
        for entry in entries {
            let entry = entry?;
            // The directory entry already carries the file's metadata (without
            // following links), so this costs no further look at the file.
            let metadata = entry.metadata()?;
            let Some((name, is_dir)) = self.tree_entry(keys.as_deref(), parent, &entry, &metadata)
            else {
                continue;
            };
            let mut facts = None;
            if is_dir {
                if !self.scan_folder(&entry.path(), &name, known, out)? {
                    continue;
                }
            } else {
                let current = FileFacts {
                    size: metadata.len(),
                    modified: metadata.modified().ok(),
                };
                let unchanged = current.modified.is_some() && known(&name) == Some(current);
                if !unchanged && !is_page_file(&entry.path()) {
                    continue;
                }
                facts = Some(current);
            }
            let slot = found
                .entry(name.clone())
                .or_insert_with(|| (PageInfo::new(name), None));
            slot.0.mark(is_dir);
            if !is_dir {
                slot.1 = facts;
            }
        }
        let any = !found.is_empty();
        out.extend(found.into_values());
        Ok(any)
    }

    /// The page or page folder that a directory entry of `parent` stands for.
    /// `None` for links, hidden entries, files that are no pages and names that are not page names.
    fn tree_entry(
        &self,
        keys: Option<&LayoutKeys>,
        parent: &PageName,
        entry: &fs::DirEntry,
        metadata: &fs::Metadata,
    ) -> Option<(PageName, bool)> {
        if is_link(metadata) {
            return None;
        }
        let file_name = entry.file_name();
        let text = file_name.to_str().filter(|text| !is_hidden(text))?;
        let is_dir = metadata.is_dir();
        if !is_dir && !metadata.is_file() {
            return None;
        }
        let name = if let Some(keys) = keys {
            let real = self.sealed_entry(
                keys,
                &entry.path(),
                is_dir,
                metadata.len(),
                metadata.modified().ok(),
            )?;
            if real.kind == NameKind::File {
                return None;
            }
            parent.child(&real.name).ok()?
        } else {
            let extension = if is_dir { "" } else { PAGE_EXTENSION };
            let part = PageName::from_relative_path(Path::new(text), extension)?;
            parent.child(part.as_str()).ok()?
        };
        Some((name, is_dir))
    }
}

/// True when the folder holds a page file at any depth below it (`depth` is how deep `folder` is).
fn contains_pages(folder: &Path, depth: usize, sealed: bool) -> bool {
    if depth >= MAX_DEPTH {
        return false;
    }
    let Ok(_guard) = pin_directory(folder) else {
        return false;
    };
    let Ok(entries) = fs::read_dir(folder) else {
        return false;
    };
    let mut sub_folders = Vec::new();
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let file_name = entry.file_name();
        let Some(text) = file_name.to_str().filter(|text| !is_hidden(text)) else {
            continue;
        };
        if is_link(&metadata) {
            continue;
        }
        if metadata.is_file() {
            if (sealed || PageName::from_relative_path(Path::new(text), PAGE_EXTENSION).is_some())
                && is_page_file(&entry.path())
            {
                return true;
            }
        } else if metadata.is_dir()
            && (sealed || PageName::from_relative_path(Path::new(text), "").is_some())
        {
            sub_folders.push(entry.path());
        }
    }
    sub_folders
        .iter()
        .any(|folder| contains_pages(folder, depth + 1, sealed))
}
