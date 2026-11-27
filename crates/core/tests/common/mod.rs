//! Fixtures shared by the integration tests.

#![allow(dead_code)] // every test binary uses another part

use std::fs;
use std::path::Path;

use mumbin_core::crypto::{KdfParams, Vault};
use mumbin_core::notebook::SaveMode;
use mumbin_core::{Expect, LoadedPage, Notebook, PageName};

/// The cheapest key derivation the program accepts.
pub const FAST: KdfParams = KdfParams::MINIMUM;

/// A page that is a page file but has no text.
pub const PAGE_HEADER: &str = "Content-Type: text/x-mumbin-page\nPage-Format: mumbin 1\n\n";

pub fn page(name: &str) -> PageName {
    PageName::new(name).unwrap()
}

/// A new, empty notebook in a temporary folder.
pub fn new_notebook(name: &str) -> (tempfile::TempDir, Notebook) {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::create(dir.path(), name).unwrap();
    (dir, notebook)
}

/// A new notebook with an open vault (passphrase `pw`).
pub fn new_vault_notebook() -> (tempfile::TempDir, Notebook, Vault) {
    let (dir, notebook) = new_notebook("Tresor");
    let vault = notebook.create_vault("pw", FAST).unwrap();
    (dir, notebook, vault)
}

/// A new notebook that hides its file names, with its open vault.
pub fn new_sealed_notebook(name: &str, passphrase: &str) -> (tempfile::TempDir, Notebook, Vault) {
    let (dir, notebook) = new_notebook(name);
    let vault = notebook.create_sealed_vault(passphrase, FAST).unwrap();
    (dir, notebook, vault)
}

/// Saves a new page encrypted.
pub fn save_encrypted(notebook: &Notebook, vault: &Vault, name: &str, text: &str) {
    notebook
        .save_page_with(
            &page(name),
            text,
            Expect::Missing,
            Some(vault),
            SaveMode::Encrypt,
        )
        .unwrap();
}

/// Saves a page, new or existing, in whatever state it has.
pub fn save_keeping(notebook: &Notebook, vault: &Vault, name: &str, text: &str) {
    notebook
        .save_page_with(
            &page(name),
            text,
            Expect::Anything,
            Some(vault),
            SaveMode::Keep,
        )
        .unwrap();
}

/// A page read with the vault open; it must exist.
pub fn read_open(notebook: &Notebook, vault: &Vault, name: &str) -> LoadedPage {
    notebook
        .read_page_with(&page(name), Some(vault))
        .unwrap()
        .unwrap()
}

/// The text of a page, `None` when it does not exist.
pub fn read_body(notebook: &Notebook, vault: &Vault, name: &str) -> Option<String> {
    notebook
        .read_page_with(&page(name), Some(vault))
        .unwrap()
        .map(|loaded| loaded.body)
}

/// The page file as it lies on disk.
pub fn on_disk(notebook: &Notebook, name: &str) -> String {
    fs::read_to_string(notebook.page_file(&page(name))).unwrap()
}

/// The names of all pages, in tree order.
pub fn page_names(notebook: &Notebook) -> Vec<String> {
    notebook
        .all_pages()
        .unwrap()
        .into_iter()
        .map(|info| info.name.to_string())
        .collect()
}

/// Every file and folder name below `folder`, relative, with `/`, sorted.
pub fn walk(folder: &Path) -> Vec<String> {
    fn inner(base: &Path, folder: &Path, out: &mut Vec<String>) {
        for entry in fs::read_dir(folder).unwrap().flatten() {
            let path = entry.path();
            out.push(
                path.strip_prefix(base)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/"),
            );
            if path.is_dir() {
                inner(base, &path, out);
            }
        }
    }
    let mut out = Vec::new();
    inner(folder, folder, &mut out);
    out.sort();
    out
}
