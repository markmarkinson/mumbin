//! Page-link resolution on a snapshot of the notebook's page tree.
//! Algorithm: `.project/research/wiki-formatspezifikation.md`, chapter 4.

use std::collections::{HashMap, HashSet};

use crate::pagename::name_key;
use crate::{Notebook, NotebookError, PageInfo, PageName};

/// A place on the path of a source page that a relative link can start from.
struct Anchor {
    depth: usize,
    /// The link spells the name exactly as the page does.
    exact: bool,
    spelled: String,
}

impl Anchor {
    /// Deeper wins, then exact spelling, then the name that sorts first.
    fn beats(&self, other: &Anchor) -> bool {
        (self.depth, self.exact, std::cmp::Reverse(&self.spelled))
            > (other.depth, other.exact, std::cmp::Reverse(&other.spelled))
    }
}

/// All pages of a notebook with lookups that ignore case, so resolving a
/// link does not walk the whole list.
#[derive(Debug, Clone, Default)]
pub struct PageTree {
    pages: Vec<PageInfo>,
    exact: HashSet<String>,
    by_key: HashMap<String, usize>,
    by_base: HashMap<String, Vec<usize>>,
}

impl PageTree {
    /// `pages` must be sorted the way [`Notebook::all_pages`] returns them.
    pub fn new(pages: Vec<PageInfo>) -> Self {
        let mut tree = PageTree {
            exact: pages.iter().map(|page| page.name.to_string()).collect(),
            ..PageTree::default()
        };
        for (index, page) in pages.iter().enumerate() {
            tree.by_key.entry(page.name.key()).or_insert(index);
            tree.by_base
                .entry(name_key(page.name.basename()))
                .or_default()
                .push(index);
        }
        tree.pages = pages;
        tree
    }

    pub fn pages(&self) -> &[PageInfo] {
        &self.pages
    }

    /// Position of a page, ignoring case.
    pub fn position(&self, name: &PageName) -> Option<usize> {
        self.by_key.get(&name.key()).copied()
    }

    pub fn contains(&self, name: &PageName) -> bool {
        self.position(name).is_some()
    }

    /// Spells `parts` the way existing pages are spelled; parts below the
    /// last existing page are kept as given.
    fn canonical<'a>(
        &self,
        parts: impl Iterator<Item = &'a str>,
    ) -> Result<PageName, NotebookError> {
        let mut name = PageName::root();
        for part in parts {
            let wanted = name.child(part)?;
            name = if self.exact.contains(wanted.as_str()) {
                wanted
            } else {
                match self.position(&wanted) {
                    Some(index) => self.pages[index].name.clone(),
                    None => wanted,
                }
            };
        }
        Ok(name)
    }

    /// Resolves a page link written on `source`. An anchor part is ignored;
    /// a link that is only an anchor points at `source` itself.
    pub fn resolve(&self, source: &PageName, target: &str) -> Result<PageName, NotebookError> {
        let target = target.split('#').next().unwrap_or("").trim();
        if target.is_empty() {
            return Ok(source.clone());
        }
        let absolute = target.starts_with(':');
        let relative = target.starts_with('+');
        let name = PageName::from_input(target.trim_start_matches([':', '+']))?;
        if absolute || source.is_root() {
            return self.canonical(name.parts());
        }
        if relative {
            return self.canonical(source.parts().chain(name.parts()));
        }

        let source_parts: Vec<&str> = source.parts().collect();
        let anchor_depth = self.anchor_depth(&source_parts, name.parts().next().unwrap_or(""));
        self.canonical(
            source_parts[..anchor_depth - 1]
                .iter()
                .copied()
                .chain(name.parts()),
        )
    }

    /// How deep in the path of the source page a relative link starting with
    /// `first` is anchored: at the deepest page or path part of that name
    /// that lies on the source's own path. A link to nothing known is
    /// anchored at the source itself.
    fn anchor_depth(&self, source_parts: &[&str], first: &str) -> usize {
        let first_key = name_key(first);
        let source_keys: Vec<String> = source_parts.iter().map(|part| name_key(part)).collect();
        let mut best: Option<Anchor> = None;
        let mut consider = |anchor: Anchor| {
            if best.as_ref().is_none_or(|best| anchor.beats(best)) {
                best = Some(anchor);
            }
        };
        for index in self.by_base.get(&first_key).into_iter().flatten() {
            let candidate = &self.pages[*index].name;
            let depth = candidate.parts().count();
            if depth > source_parts.len() {
                continue;
            }
            let shares_ancestors = candidate
                .parts()
                .take(depth - 1)
                .zip(&source_keys)
                .all(|(part, key)| name_key(part) == *key);
            if shares_ancestors {
                consider(Anchor {
                    depth,
                    exact: candidate.basename() == first,
                    spelled: candidate.to_string(),
                });
            }
        }
        // A part of the source path that does not exist yet still anchors the link.
        for depth in 1..=source_parts.len() {
            if source_keys[depth - 1] != first_key {
                continue;
            }
            let prefix = source_parts[..depth].join(":");
            if !self.by_key.contains_key(&name_key(&prefix)) {
                consider(Anchor {
                    depth,
                    exact: source_parts[depth - 1] == first,
                    spelled: prefix,
                });
            }
        }
        best.map_or(source_parts.len(), |anchor| anchor.depth)
    }

    /// Shortest link text that leads from `source` to `target`.
    pub fn shortest_link(&self, source: &PageName, target: &PageName) -> String {
        if source == target {
            return target.basename().to_owned();
        }
        if target.is_within(source) && !source.is_root() {
            let rest: Vec<&str> = target.parts().skip(source.parts().count()).collect();
            return format!("+{}", rest.join(":"));
        }
        let target_parts: Vec<&str> = target.parts().collect();
        let common = source
            .parts()
            .zip(&target_parts)
            .take_while(|(a, b)| name_key(a) == name_key(b))
            .count()
            .min(target_parts.len() - 1);
        for start in (0..=common).rev() {
            let link = target_parts[start..].join(":");
            if self
                .resolve(source, &link)
                .is_ok_and(|resolved| resolved.key() == target.key())
            {
                return link;
            }
        }
        format!(":{target}")
    }
}

impl Notebook {
    /// Every page of the notebook in natural order.
    pub fn all_pages(&self) -> Result<Vec<PageInfo>, NotebookError> {
        Ok(self
            .scan_pages(&|_| None)?
            .into_iter()
            .map(|(page, _)| page)
            .collect())
    }

    /// The slow, level by level way to list every page: one `children` call per
    /// folder. Kept to check the single walk against it.
    #[cfg(test)]
    pub(crate) fn all_pages_by_levels(&self) -> Result<Vec<PageInfo>, NotebookError> {
        let mut pending = vec![PageName::root()];
        let mut pages = Vec::new();
        while let Some(parent) = pending.pop() {
            for page in self.children(&parent)? {
                if page.has_children {
                    pending.push(page.name.clone());
                }
                pages.push(page);
            }
        }
        pages.sort_by_cached_key(|page| page.name.sort_key());
        Ok(pages)
    }

    /// Resolves one link against the pages on disk right now.
    pub fn resolve_link(&self, source: &PageName, target: &str) -> Result<PageName, NotebookError> {
        PageTree::new(self.all_pages()?).resolve(source, target)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{notebook_with, page};

    #[test]
    fn the_single_walk_finds_what_the_level_by_level_listing_finds() {
        let (_dir, notebook) = notebook_with(&[
            ("Home", "x"),
            ("Projekt:Plan", "x"),
            ("Projekt:Plan:Teil Eins", "x"),
            ("Nur Kinder:Tief:Seite", "x"),
            ("Zahl 10", "x"),
            ("zahl 9", "x"),
            ("Über Größe", "x"),
        ]);
        let root = notebook.folder();
        // Things that must not show up: a text file that is no page, hidden and temporary
        // names, a folder without any page, a folder holding only such files.
        std::fs::write(root.join("notizen.txt"), "kein Seitenkopf").unwrap();
        std::fs::write(root.join(".versteckt.txt"), "x").unwrap();
        std::fs::write(root.join("Home.txt~"), "x").unwrap();
        std::fs::create_dir_all(root.join("Leerer Ordner")).unwrap();
        std::fs::create_dir_all(root.join("Anhang_Ordner")).unwrap();
        std::fs::write(root.join("Anhang_Ordner").join("bild.png"), b"x").unwrap();
        std::fs::write(root.join("Anhang_Ordner").join("liste.txt"), "plain").unwrap();
        std::fs::create_dir_all(root.join(".cache").join("Cache")).unwrap();

        let single = notebook.all_pages().unwrap();
        assert_eq!(single, notebook.all_pages_by_levels().unwrap());
        let names: Vec<&str> = single.iter().map(|page| page.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "Home",
                "Nur Kinder",
                "Nur Kinder:Tief",
                "Nur Kinder:Tief:Seite",
                "Projekt",
                "Projekt:Plan",
                "Projekt:Plan:Teil Eins",
                "zahl 9",
                "Zahl 10",
                "Über Größe",
            ]
        );
        let info = |name: &str| {
            single
                .iter()
                .find(|page| page.name.as_str() == name)
                .unwrap()
        };
        assert!(info("Home").has_content && !info("Home").has_children);
        assert!(!info("Nur Kinder").has_content && info("Nur Kinder").has_children);
        assert!(info("Projekt:Plan").has_content && info("Projekt:Plan").has_children);
    }

    #[test]
    fn the_walk_skips_files_it_already_knows_without_opening_them() {
        use crate::notebook::FileFacts;
        let (_dir, notebook) = notebook_with(&[("Home", "x"), ("Zwei", "y")]);
        let facts = |name: &str| {
            let path = notebook.page_file(&page(name));
            let metadata = std::fs::metadata(path).unwrap();
            FileFacts {
                size: metadata.len(),
                modified: metadata.modified().ok(),
            }
        };
        // "Home" is claimed to be known. Break its header: it is still taken as a page,
        // because the facts match (a file that really changed would not match).
        let known_home = facts("Home");
        std::fs::write(
            notebook.page_file(&page("Home")),
            "x".repeat(known_home.size as usize),
        )
        .unwrap();
        let restored = std::fs::OpenOptions::new()
            .write(true)
            .open(notebook.page_file(&page("Home")))
            .unwrap();
        restored.set_modified(known_home.modified.unwrap()).unwrap();
        drop(restored);
        let with_knowledge = notebook
            .scan_pages(&|name| (name.as_str() == "Home").then_some(known_home))
            .unwrap();
        assert!(
            with_knowledge
                .iter()
                .any(|(page, _)| page.name.as_str() == "Home")
        );
        // Without that knowledge the broken file is no page.
        let without = notebook.scan_pages(&|_| None).unwrap();
        assert!(!without.iter().any(|(page, _)| page.name.as_str() == "Home"));
        // The facts of the pages that are there are reported.
        let zwei = without
            .iter()
            .find(|(page, _)| page.name.as_str() == "Zwei")
            .unwrap();
        assert_eq!(zwei.1, Some(facts("Zwei")));
    }

    #[test]
    fn resolves_ancestors_children_and_case() {
        let (_dir, notebook) = notebook_with(&[
            ("Home", "home"),
            ("Project", "project"),
            ("Project:Notes", "notes"),
            ("Project:Plan", "plan"),
            ("Other", "other"),
        ]);
        let source = PageName::new("Project:Notes").unwrap();
        for (link, expected) in [
            (":home", "Home"),
            ("+Child", "Project:Notes:Child"),
            ("Project:plan", "Project:Plan"),
            ("Plan", "Project:Plan"),
            ("Other", "Other"),
            ("Missing", "Project:Missing"),
            ("#heading", "Project:Notes"),
            ("Plan#teil", "Project:Plan"),
        ] {
            assert_eq!(
                notebook.resolve_link(&source, link).unwrap().as_str(),
                expected,
                "{link}"
            );
        }
        assert_eq!(
            notebook
                .resolve_link(&PageName::new("New:Section:Draft").unwrap(), "Section:Next")
                .unwrap()
                .as_str(),
            "New:Section:Next"
        );
    }

    #[test]
    fn examples_from_the_specification() {
        let (_dir, notebook) = notebook_with(&[
            ("Home", "h"),
            ("Handbuch:Examples:Calendar", "c"),
            ("Handbuch:Examples:Linking:Absolute", "a"),
            ("Handbuch:Examples:Linking:Relative", "r"),
        ]);
        let source = PageName::new("Handbuch:Examples:Linking:Relative").unwrap();
        for (link, expected) in [
            ("Absolute", "Handbuch:Examples:Linking:Absolute"),
            ("Examples:Calendar", "Handbuch:Examples:Calendar"),
            ("+Sub", "Handbuch:Examples:Linking:Relative:Sub"),
            (":Home", "Home"),
        ] {
            assert_eq!(
                notebook.resolve_link(&source, link).unwrap().as_str(),
                expected,
                "{link}"
            );
        }
    }

    #[test]
    fn deepest_shared_ancestor_wins() {
        let (_dir, notebook) =
            notebook_with(&[("Notes", "top"), ("A:Notes", "inner"), ("A:B:Page", "p")]);
        let source = PageName::new("A:B:Page").unwrap();
        assert_eq!(
            notebook.resolve_link(&source, "Notes").unwrap().as_str(),
            "A:Notes"
        );
        let top = PageName::new("Other").unwrap();
        assert_eq!(
            notebook.resolve_link(&top, "Notes").unwrap().as_str(),
            "Notes"
        );
    }

    #[test]
    fn shortest_links_resolve_back_to_the_target() {
        let (_dir, notebook) = notebook_with(&[
            ("Home", "h"),
            ("A:Notes", "n"),
            ("A:B:Page", "p"),
            ("A:B:Page:Kind", "k"),
            ("Notes", "top"),
        ]);
        let tree = PageTree::new(notebook.all_pages().unwrap());
        let source = PageName::new("A:B:Page").unwrap();
        for (target, expected) in [
            ("A:B:Page", "Page"),
            ("A:B:Page:Kind", "+Kind"),
            ("A:Notes", "Notes"),
            ("Home", "Home"),
            ("Notes", ":Notes"),
        ] {
            let target = PageName::new(target).unwrap();
            let link = tree.shortest_link(&source, &target);
            assert_eq!(link, expected, "{target}");
            assert_eq!(tree.resolve(&source, &link).unwrap(), target);
        }
    }
}
