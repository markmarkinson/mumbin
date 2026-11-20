//! Moving and renaming pages together with their sub-pages and attachments, and keeping the
//! links to them working.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;

use crate::crypto::names::LayoutKeys;
use crate::crypto::{Keys, Vault};
use crate::index::{Index, IndexedPage};
use crate::links::PageTree;
use crate::notebook::{SaveMode, is_page_file};
use crate::scan::LinkKind;
use crate::{Expect, Notebook, NotebookError, PageName};

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveReport {
    /// New name of the moved page.
    pub name: String,
    /// Pages whose links were rewritten.
    pub updated: Vec<String>,
    /// Pages whose links could not be rewritten (changed meanwhile).
    pub failed: Vec<String>,
}

/// One link on a page that has to be written differently.
struct LinkEdit {
    line: usize,
    old_target: String,
    new_target: String,
}

/// The paths a move touches; the guards keep the parent folders in place while it runs.
struct MovePlan {
    old_file: PathBuf,
    old_folder: PathBuf,
    new_file: PathBuf,
    new_folder: PathBuf,
    old_parents: Vec<fs::File>,
    _new_parents: Vec<fs::File>,
}

impl Notebook {
    /// Moves or renames a page together with its sub-pages and attachments
    /// and, if wanted, rewrites the links that would otherwise break.
    pub fn move_page(
        &self,
        from: &PageName,
        to: &PageName,
        update_links: bool,
    ) -> Result<MoveReport, NotebookError> {
        self.move_page_with(from, to, update_links, None::<&Vault>)
    }

    pub fn move_page_with<'k>(
        &self,
        from: &PageName,
        to: &PageName,
        update_links: bool,
        keys: impl Into<Keys<'k>>,
    ) -> Result<MoveReport, NotebookError> {
        let keys = keys.into();
        if from.is_root() || to.is_root() {
            return Err(NotebookError::RootHasNoPage);
        }
        let layout = self.layout_keys()?;
        if layout.is_some() && keys.vault.is_none() {
            return Err(NotebookError::Locked);
        }
        let mut report = MoveReport {
            name: to.to_string(),
            ..MoveReport::default()
        };
        if from == to {
            return Ok(report);
        }
        let case_only = from.key() == to.key();
        if !case_only && to.is_within(from) {
            return Err(NotebookError::invalid(
                "a page cannot be moved below itself",
            ));
        }
        let plan = self.plan_move(from, to, layout.as_deref(), case_only)?;
        let before = if update_links {
            Some(Index::build_with(self, None, keys)?)
        } else {
            None
        };
        self.apply_move(&plan, to, layout.as_deref(), keys.vault)?;
        drop(plan.old_parents);
        self.remove_empty_folders(plan.old_file.parent());

        if let Some(before) = before {
            self.rewrite_links_after_move(&before, from, to, keys, &mut report)?;
        }
        Ok(report)
    }

    /// Checks that the move can be made and finds the paths it touches.
    fn plan_move(
        &self,
        from: &PageName,
        to: &PageName,
        keys: Option<&LayoutKeys>,
        case_only: bool,
    ) -> Result<MovePlan, NotebookError> {
        let (old_file, old_folder) = (self.page_file(from), self.page_folder(from));
        let (new_file, new_folder) = (self.page_file(to), self.page_folder(to));
        let old_parents = self.guard_parent(&old_file, false)?;
        let new_parents = self.guard_parent(&new_file, true)?;
        if let Some(keys) = keys {
            self.write_dir_names(keys, to, false)?;
        }
        for path in [&old_file, &old_folder, &new_file, &new_folder] {
            self.check_path(path)?;
        }
        if !old_file.exists() && !old_folder.exists() {
            return Err(NotebookError::not_found("page does not exist"));
        }
        if old_file.exists() && !is_page_file(&old_file) {
            return Err(NotebookError::NotAPage(old_file));
        }
        if !case_only && (new_file.exists() || new_folder.exists()) {
            return Err(NotebookError::AlreadyExists(new_file));
        }
        Ok(MovePlan {
            old_file,
            old_folder,
            new_file,
            new_folder,
            old_parents,
            _new_parents: new_parents,
        })
    }

    fn apply_move(
        &self,
        plan: &MovePlan,
        to: &PageName,
        keys: Option<&LayoutKeys>,
        vault: Option<&Vault>,
    ) -> Result<(), NotebookError> {
        if plan.old_file.exists() {
            fs::rename(&plan.old_file, &plan.new_file)?;
        }
        if plan.old_folder.exists()
            && let Err(error) = fs::rename(&plan.old_folder, &plan.new_folder)
        {
            // Keep page and folder together when the second step fails.
            if plan.new_file.exists() {
                let _ = fs::rename(&plan.new_file, &plan.old_file);
            }
            return Err(error.into());
        }
        // In a sealed notebook the names inside the moved page and its folder are the old ones.
        if let (Some(keys), Some(vault)) = (keys, vault) {
            if plan.new_file.exists() {
                self.reseal_page_name(&plan.new_file, to.basename(), vault)?;
            }
            if plan.new_folder.exists() {
                self.rewrite_dir_name(keys, &plan.new_folder, to.basename())?;
            }
        }
        Ok(())
    }

    /// Rewrites the links that pointed into the moved pages (or were written on them) so that
    /// they lead to the same pages as before. `before` is the index from before the move.
    fn rewrite_links_after_move(
        &self,
        before: &Index,
        from: &PageName,
        to: &PageName,
        keys: Keys<'_>,
        report: &mut MoveReport,
    ) -> Result<(), NotebookError> {
        let tree = PageTree::new(self.all_pages()?);
        for page in before.pages() {
            let new_source = page.info.name.relocated(from, to);
            let edits = link_edits(before, &tree, page, &new_source, from, to);
            if edits.is_empty() {
                continue;
            }
            match self.apply_link_edits(&new_source, &edits, keys) {
                Ok(true) => report.updated.push(new_source.to_string()),
                Ok(false) => {}
                Err(_) => report.failed.push(new_source.to_string()),
            }
        }
        Ok(())
    }

    /// Writes the edits into the page; false when nothing in it changed.
    fn apply_link_edits(
        &self,
        name: &PageName,
        edits: &[LinkEdit],
        keys: Keys<'_>,
    ) -> Result<bool, NotebookError> {
        let Some(loaded) = self.read_page_with(name, keys)? else {
            return Ok(false);
        };
        let mut lines: Vec<String> = loaded.body.split('\n').map(str::to_owned).collect();
        let mut changed = false;
        for edit in edits {
            let Some(text) = lines.get_mut(edit.line) else {
                continue;
            };
            let (old, new) = (&edit.old_target, &edit.new_target);
            let rewritten = text
                .replace(&format!("[[{old}]]"), &format!("[[{new}]]"))
                .replace(&format!("[[{old}|"), &format!("[[{new}|"));
            if rewritten != *text {
                *text = rewritten;
                changed = true;
            }
        }
        if changed {
            self.save_page_with(
                name,
                &lines.join("\n"),
                Expect::Stamp(&loaded.stamp),
                keys,
                SaveMode::Keep,
            )?;
        }
        Ok(changed)
    }
}

/// The links of `page` that no longer lead where they led before the move, with the text that
/// makes them lead there again. `new_source` is the page's name after the move.
fn link_edits(
    before: &Index,
    tree: &PageTree,
    page: &IndexedPage,
    new_source: &PageName,
    from: &PageName,
    to: &PageName,
) -> Vec<LinkEdit> {
    let source_moved = page.info.name.is_within(from);
    page.scan
        .links
        .iter()
        .filter(|link| link.kind == LinkKind::Page)
        .filter_map(|link| {
            let old_target = before.tree().resolve(&page.info.name, &link.target).ok()?;
            if !source_moved && !old_target.is_within(from) {
                return None;
            }
            let new_target = old_target.relocated(from, to);
            let still_right = tree
                .resolve(new_source, &link.target)
                .is_ok_and(|resolved| resolved.key() == new_target.key());
            if still_right {
                return None;
            }
            let (page_part, anchor) = match link.target.split_once('#') {
                Some((page_part, anchor)) => (page_part, Some(anchor)),
                None => (link.target.as_str(), None),
            };
            if page_part.trim().is_empty() {
                return None;
            }
            let mut replacement = tree.shortest_link(new_source, &new_target);
            if let Some(anchor) = anchor {
                replacement.push('#');
                replacement.push_str(anchor);
            }
            Some(LinkEdit {
                line: link.line,
                old_target: link.target.clone(),
                new_target: replacement,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::*;

    #[test]
    fn moving_a_page_takes_children_and_attachments_and_fixes_links() {
        let (_dir, notebook) = notebook_with(&[
            (
                "Home",
                "Siehe [[Projekt:Plan]] und [[Projekt:Plan:Teil|den Teil]] und [[Projekt:Plan#ziel]].",
            ),
            (
                "Projekt:Plan",
                "Zurück zu [[Home]], runter zu [[+Teil]], rüber zu [[Notiz]].",
            ),
            ("Projekt:Plan:Teil", "Hoch zu [[Plan]]."),
            ("Projekt:Notiz", "Der [[Plan]] steht."),
            ("Fremd", "Kein Link."),
        ]);
        fs::write(
            notebook.page_folder(&page("Projekt:Plan")).join("bild.png"),
            b"x",
        )
        .unwrap();

        let report = notebook
            .move_page(&page("Projekt:Plan"), &page("Archiv:Alter Plan"), true)
            .unwrap();

        assert_eq!(report.name, "Archiv:Alter Plan");
        assert!(notebook.read_page(&page("Projekt:Plan")).unwrap().is_none());
        assert!(
            notebook
                .page_folder(&page("Archiv:Alter Plan"))
                .join("bild.png")
                .exists()
        );
        assert_eq!(
            body(&notebook, "Home"),
            "Siehe [[Archiv:Alter Plan]] und [[Archiv:Alter Plan:Teil|den Teil]] und [[Archiv:Alter Plan#ziel]].\n"
        );
        assert_eq!(
            body(&notebook, "Archiv:Alter Plan"),
            "Zurück zu [[Home]], runter zu [[+Teil]], rüber zu [[Projekt:Notiz]].\n"
        );
        assert_eq!(
            body(&notebook, "Archiv:Alter Plan:Teil"),
            "Hoch zu [[Alter Plan]].\n"
        );
        assert_eq!(
            body(&notebook, "Projekt:Notiz"),
            "Der [[Archiv:Alter Plan]] steht.\n"
        );
        assert_eq!(body(&notebook, "Fremd"), "Kein Link.\n");
        let mut updated = report.updated.clone();
        updated.sort();
        assert_eq!(
            updated,
            [
                "Archiv:Alter Plan",
                "Archiv:Alter Plan:Teil",
                "Home",
                "Projekt:Notiz"
            ]
        );
        assert!(report.failed.is_empty());

        // Every rewritten link resolves to an existing page.
        let index = Index::build(&notebook, None).unwrap();
        assert!(
            index.placeholders().is_empty(),
            "{:?}",
            index.placeholders()
        );
    }

    #[test]
    fn moving_refuses_to_overwrite_or_nest() {
        let (_dir, notebook) = notebook_with(&[("A", "a"), ("B", "b"), ("A:Kind", "k")]);
        assert!(matches!(
            notebook.move_page(&page("A"), &page("B"), true),
            Err(NotebookError::AlreadyExists(_))
        ));
        assert!(
            notebook
                .move_page(&page("A"), &page("A:Kind:Tiefer"), true)
                .is_err()
        );
        assert!(
            notebook
                .move_page(&page("Fehlt"), &page("C"), true)
                .is_err()
        );
        assert_eq!(body(&notebook, "A"), "a\n");
        assert_eq!(body(&notebook, "B"), "b\n");
    }

    #[test]
    fn renaming_only_the_case_is_allowed() {
        let (_dir, notebook) = notebook_with(&[("alt", "inhalt"), ("Home", "[[alt]]")]);
        notebook
            .move_page(&page("alt"), &page("Alt"), true)
            .unwrap();
        assert_eq!(page_names(&notebook), ["Alt", "Home"]);
    }
}
