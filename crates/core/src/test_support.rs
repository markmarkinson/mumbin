//! Helpers shared by the unit tests.

use crate::{Expect, Index, Notebook, PageName};

pub(crate) fn page(name: &str) -> PageName {
    PageName::new(name).unwrap()
}

/// A fresh notebook, in the folder `nb` of a temporary folder, with the given pages
/// `(name, body)`. The rest of the temporary folder is free for exports and sources.
pub(crate) fn notebook_with(pages: &[(&str, &str)]) -> (tempfile::TempDir, Notebook) {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::create(&dir.path().join("nb"), "Test").unwrap();
    for (name, body) in pages {
        notebook
            .save_page(&page(name), body, Expect::Missing)
            .unwrap();
    }
    (dir, notebook)
}

/// [`notebook_with`] and the index of it.
pub(crate) fn index_with(pages: &[(&str, &str)]) -> (tempfile::TempDir, Notebook, Index) {
    let (dir, notebook) = notebook_with(pages);
    let index = Index::build(&notebook, None).unwrap();
    (dir, notebook, index)
}

pub(crate) fn body(notebook: &Notebook, name: &str) -> String {
    notebook.read_page(&page(name)).unwrap().unwrap().body
}

/// The names of all pages, in tree order.
pub(crate) fn page_names(notebook: &Notebook) -> Vec<String> {
    notebook
        .all_pages()
        .unwrap()
        .into_iter()
        .map(|info| info.name.to_string())
        .collect()
}
