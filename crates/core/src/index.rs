//! In-memory index of a notebook: every page with its text, links, tags and
//! tasks. It is derived data and can be rebuilt from the files at any time;
//! rebuilding reuses whatever did not change on disk.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::time::SystemTime;

use crate::crypto::{Keys, Vault};
use crate::links::PageTree;
use crate::notebook::FileFacts;
use crate::scan::{LinkKind, PageScan, scan_page};
use crate::{Notebook, NotebookError, PageInfo, PageName};

/// Page text beyond this many bytes (all pages together) is not indexed; the
/// pages stay in the tree. Keeps a notebook of thousands of huge files from
/// using all memory.
const MAX_INDEXED_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct IndexedPage {
    pub info: PageInfo,
    pub modified: Option<SystemTime>,
    pub size: u64,
    pub created: Option<String>,
    /// Wiki text with `\n` line endings; empty for pages without a file.
    pub body: String,
    /// Lower-cased text for searching.
    pub lower: String,
    pub scan: PageScan,
    /// Pages this page links to, resolved, without duplicates.
    pub links: Vec<PageName>,
    /// The page is stored encrypted.
    pub encrypted: bool,
    /// The page has a password of its own, not the vault's.
    pub own_password: bool,
    /// Encrypted, and its text is not in the index because its key was not open.
    pub locked: bool,
}

impl IndexedPage {
    /// A page in the tree whose text is not (yet) known.
    fn unread(info: PageInfo) -> Self {
        IndexedPage {
            info,
            modified: None,
            size: 0,
            created: None,
            body: String::new(),
            lower: String::new(),
            scan: PageScan::default(),
            links: Vec::new(),
            encrypted: false,
            own_password: false,
            locked: false,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Index {
    tree: PageTree,
    pages: Vec<IndexedPage>,
    /// Name key of a page to the positions of the pages linking to it.
    backlinks: HashMap<String, Vec<usize>>,
}

/// The state of one [`Index::build_with`] run.
struct Build<'a> {
    notebook: &'a Notebook,
    previous: Option<&'a Index>,
    keys: Keys<'a>,
    /// The set of pages is the same as in `previous`, so the links of a page
    /// that did not change are still right.
    same_tree: bool,
    indexed_bytes: u64,
}

impl Build<'_> {
    /// The indexed page for one page of the tree, and whether its links were
    /// taken over from the previous index.
    fn page(&mut self, info: &PageInfo, facts: Option<FileFacts>) -> (IndexedPage, bool) {
        let mut page = IndexedPage::unread(info.clone());
        if !info.has_content {
            return (page, false);
        }
        page.modified = facts.and_then(|facts| facts.modified);
        page.size = facts.map_or(0, |facts| facts.size);
        self.indexed_bytes = self.indexed_bytes.saturating_add(page.size);
        if self.indexed_bytes > MAX_INDEXED_BYTES {
            return (page, false);
        }
        if let Some(old) = self.unchanged(&page) {
            page.created = old.created.clone();
            page.encrypted = old.encrypted;
            page.own_password = old.own_password;
            page.locked = old.locked;
            page.body = old.body.clone();
            page.lower = old.lower.clone();
            page.scan = old.scan.clone();
            if self.same_tree {
                page.links = old.links.clone();
            }
            return (page, self.same_tree);
        }
        // A file that cannot be read as a page stays in the tree without
        // text instead of failing the whole index.
        if let Ok(Some(loaded)) = self.notebook.read_page_with(&info.name, self.keys) {
            page.created = loaded.creation_date;
            page.encrypted = loaded.encrypted;
            page.own_password = loaded.own_password;
            page.locked = loaded.locked;
            page.lower = loaded.body.to_lowercase();
            page.scan = scan_page(&loaded.body);
            page.body = loaded.body;
        }
        (page, false)
    }

    /// The key that opens this page is at hand.
    fn can_open(&self, page: &IndexedPage) -> bool {
        if page.own_password {
            self.keys.page(&page.info.name).is_some()
        } else {
            self.keys.vault.is_some()
        }
    }

    /// The previous entry of `page` when its file still has the same size and
    /// modification time.
    fn unchanged(&self, page: &IndexedPage) -> Option<&IndexedPage> {
        self.previous?.page(&page.info.name).filter(|old| {
            old.info.name == page.info.name
                    && old.info.has_content
                    && old.modified.is_some()
                    && old.modified == page.modified
                    && old.size == page.size
                    // An encrypted page read before its key was opened (or after it
                    // was closed) has no usable text.
                    && (!old.encrypted || old.locked != self.can_open(old))
        })
    }
}

/// Resolves the links of every page whose links were not taken over and
/// returns the pages linking to each page, by name key.
fn resolve_links(
    pages: &mut [IndexedPage],
    links_known: &[bool],
    tree: &PageTree,
) -> HashMap<String, Vec<usize>> {
    let mut backlinks: HashMap<String, Vec<usize>> = HashMap::new();
    for (index, page) in pages.iter_mut().enumerate() {
        if links_known[index] {
            for target in &page.links {
                backlinks.entry(target.key()).or_default().push(index);
            }
            continue;
        }
        let mut seen = HashSet::new();
        for link in &page.scan.links {
            if link.kind != LinkKind::Page {
                continue;
            }
            let Ok(target) = tree.resolve(&page.info.name, &link.target) else {
                continue;
            };
            let key = target.key();
            if target != page.info.name && seen.insert(key.clone()) {
                backlinks.entry(key).or_default().push(index);
                page.links.push(target);
            }
        }
    }
    backlinks
}

impl Index {
    /// Reads the notebook. Pages whose file has the same size and
    /// modification time as in `previous` are taken over without reading.
    /// Encrypted pages are listed but have no text.
    pub fn build(notebook: &Notebook, previous: Option<&Index>) -> Result<Self, NotebookError> {
        Self::build_with(notebook, previous, None::<&Vault>)
    }

    /// Like [`Index::build`]; with keys the encrypted pages are opened, and
    /// their text then lives in this index (in memory only) until it is dropped.
    pub fn build_with<'k>(
        notebook: &Notebook,
        previous: Option<&Index>,
        keys: impl Into<Keys<'k>>,
    ) -> Result<Self, NotebookError> {
        // What the last build knew about each page file; a file that still looks
        // the same is not opened again.
        let known = |name: &PageName| {
            previous
                .and_then(|index| index.page(name))
                .filter(|old| old.info.has_content && old.info.name == *name)
                .and_then(|old| {
                    old.modified.map(|modified| FileFacts {
                        size: old.size,
                        modified: Some(modified),
                    })
                })
        };
        let scanned = notebook.scan_pages(&known)?;
        let tree = PageTree::new(scanned.iter().map(|(info, _)| info.clone()).collect());
        let mut build = Build {
            notebook,
            previous,
            keys: keys.into(),
            same_tree: previous.is_some_and(|old| old.tree.pages() == tree.pages()),
            indexed_bytes: 0,
        };
        let (mut pages, links_known): (Vec<_>, Vec<_>) = scanned
            .iter()
            .map(|(info, facts)| build.page(info, *facts))
            .unzip();
        let backlinks = resolve_links(&mut pages, &links_known, &tree);
        Ok(Index {
            tree,
            pages,
            backlinks,
        })
    }

    pub fn tree(&self) -> &PageTree {
        &self.tree
    }

    pub fn pages(&self) -> &[IndexedPage] {
        &self.pages
    }

    pub fn page(&self, name: &PageName) -> Option<&IndexedPage> {
        self.tree.position(name).map(|index| &self.pages[index])
    }

    /// Pages that link to `name`, in natural order.
    pub fn backlinks(&self, name: &PageName) -> Vec<&PageName> {
        self.backlinks
            .get(&name.key())
            .map(|sources| {
                sources
                    .iter()
                    .map(|index| &self.pages[*index].info.name)
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Link targets that have no page yet, each with the number of pages
    /// linking to it.
    pub fn placeholders(&self) -> Vec<(PageName, usize)> {
        let mut found: BTreeMap<String, (PageName, usize)> = BTreeMap::new();
        for page in &self.pages {
            for target in &page.links {
                if !self.tree.contains(target) {
                    found
                        .entry(target.key())
                        .or_insert_with(|| (target.clone(), 0))
                        .1 += 1;
                }
            }
        }
        found.into_values().collect()
    }

    /// All tags with the number of pages carrying them, sorted by name.
    pub fn tags(&self) -> Vec<(String, usize)> {
        let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
        for page in &self.pages {
            for tag in &page.scan.tags {
                *counts.entry(tag).or_default() += 1;
            }
        }
        counts
            .into_iter()
            .map(|(tag, count)| (tag.to_owned(), count))
            .collect()
    }

    /// Pages carrying `tag` (without `@`, any case).
    pub fn pages_with_tag(&self, tag: &str) -> Vec<&PageName> {
        let tag = tag.trim_start_matches('@').to_lowercase();
        self.pages
            .iter()
            .filter(|page| page.scan.tags.contains(&tag))
            .map(|page| &page.info.name)
            .collect()
    }

    /// Pages with a file, most recently changed first.
    pub fn recent(&self, limit: usize) -> Vec<&IndexedPage> {
        let mut pages: Vec<&IndexedPage> = self
            .pages
            .iter()
            .filter(|page| page.info.has_content)
            .collect();
        pages.sort_by_key(|page| std::cmp::Reverse(page.modified));
        pages.truncate(limit);
        pages
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Expect;
    use crate::test_support::{index_with, page};

    /// Everything an index says about links, in a form that can be compared.
    fn summary(index: &Index) -> Vec<(String, bool, Vec<String>, Vec<String>)> {
        index
            .pages()
            .iter()
            .map(|page| {
                (
                    page.info.name.to_string(),
                    page.info.has_content,
                    page.links.iter().map(PageName::to_string).collect(),
                    index
                        .backlinks(&page.info.name)
                        .into_iter()
                        .map(PageName::to_string)
                        .collect(),
                )
            })
            .collect()
    }

    fn links_of(index: &Index, name: &str) -> Vec<String> {
        index
            .page(&page(name))
            .unwrap()
            .links
            .iter()
            .map(PageName::to_string)
            .collect()
    }

    #[test]
    fn a_rebuild_that_reuses_links_agrees_with_one_from_scratch() {
        let (_dir, notebook, first) = index_with(&[
            ("Home", "[[Projekt:Plan]] [[Notiz]]"),
            ("Projekt:Plan", "[[Notiz]] [[:Home]]"),
            ("Notiz", "[[Home]]"),
            ("Weit:Weg:Seite", "[[Notiz]]"),
        ]);
        let save = |name: &str, body: &str, expect: Expect<'_>| {
            notebook.save_page(&page(name), body, expect).unwrap();
        };
        let again = Index::build(&notebook, Some(&first)).unwrap();
        assert_eq!(
            summary(&again),
            summary(&first),
            "nothing changed, but the result did"
        );

        // A page changes: its links are read again, the others are reused.
        save("Home", "[[Weit:Weg:Seite]] [[Notiz]]", Expect::Anything);
        let edited = Index::build(&notebook, Some(&again)).unwrap();
        assert_eq!(
            summary(&edited),
            summary(&Index::build(&notebook, None).unwrap())
        );

        // A page appears. For Projekt:Plan, whose file did not change, "Notiz" now means
        // Projekt:Notiz (the deepest match) instead of the one at the top. The set of pages
        // changed, so no old link may be reused.
        assert_eq!(
            links_of(&edited, "Projekt:Plan"),
            ["Notiz", "Home"],
            "setup: the link should reach the top-level Notiz"
        );
        save("Projekt:Notiz", "x", Expect::Missing);
        let grown = Index::build(&notebook, Some(&edited)).unwrap();
        let fresh = Index::build(&notebook, None).unwrap();
        assert_eq!(summary(&grown), summary(&fresh));
        assert_eq!(
            links_of(&grown, "Projekt:Plan"),
            ["Projekt:Notiz", "Home"],
            "Projekt:Plan still points at the old Notiz"
        );

        // A page disappears.
        notebook.delete_page(&page("Projekt:Notiz"), true).unwrap();
        let shrunk = Index::build(&notebook, Some(&grown)).unwrap();
        assert_eq!(
            summary(&shrunk),
            summary(&Index::build(&notebook, None).unwrap())
        );
    }

    #[test]
    fn backlinks_tags_placeholders_and_reuse() {
        let (_dir, notebook, index) = index_with(&[
            ("Home", "[[Projekt:Plan]] [[Fehlt]] @wichtig"),
            (
                "Projekt:Plan",
                "[[:Home]] [[Home]] [[+Kind]] @Wichtig @plan",
            ),
            ("Projekt:Notiz", "[[Plan]] ''[[Home]]'' https://example.org"),
        ]);
        let names = |pages: Vec<&PageName>| -> Vec<String> {
            pages.into_iter().map(PageName::to_string).collect()
        };
        assert_eq!(names(index.backlinks(&page("Home"))), ["Projekt:Plan"]);
        assert_eq!(
            names(index.backlinks(&page("Projekt:Plan"))),
            ["Home", "Projekt:Notiz"]
        );
        assert_eq!(
            index.tags(),
            [("plan".to_owned(), 1), ("wichtig".to_owned(), 2)]
        );
        assert_eq!(
            names(index.pages_with_tag("@Wichtig")),
            ["Home", "Projekt:Plan"]
        );
        let placeholders: Vec<String> = index
            .placeholders()
            .into_iter()
            .map(|(name, count)| format!("{name}={count}"))
            .collect();
        assert_eq!(placeholders, ["Fehlt=1", "Projekt:Plan:Kind=1"]);

        // Unchanged files are taken over; a changed one is read again.
        notebook
            .save_page(&page("Home"), "kein Link mehr", Expect::Anything)
            .unwrap();
        let rebuilt = Index::build(&notebook, Some(&index)).unwrap();
        assert_eq!(rebuilt.backlinks(&page("Projekt:Plan")).len(), 1);
        assert_eq!(
            rebuilt.page(&page("Projekt:Plan")).unwrap().body,
            index.page(&page("Projekt:Plan")).unwrap().body
        );
        assert_eq!(
            rebuilt.page(&page("Home")).unwrap().body,
            "kein Link mehr\n"
        );
    }
}
