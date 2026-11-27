use std::fs;

use mumbin_core::{Expect, Notebook, SaveOutcome};

mod common;
use common::page;

#[test]
fn pictures_obey_document_root_and_size_limits() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("notebook");
    let documents = dir.path().join("documents");
    fs::create_dir(&documents).unwrap();
    let notebook = Notebook::create(&root, "Pictures").unwrap();
    let notebook = notebook
        .with_properties(
            "Notebook",
            &[("document_root", documents.to_str().unwrap())],
        )
        .unwrap();
    let home = page("Home");
    fs::write(documents.join("image.png"), b"picture bytes").unwrap();
    assert_eq!(
        notebook.read_picture(&home, "/image.png", None).unwrap(),
        b"picture bytes"
    );
    fs::write(dir.path().join("outside.png"), b"private").unwrap();
    assert!(
        notebook
            .read_picture(&home, "/../outside.png", None)
            .is_err()
    );
    let large = fs::File::create(documents.join("large.png")).unwrap();
    large.set_len(32 * 1024 * 1024 + 1).unwrap();
    drop(large);
    assert!(notebook.read_picture(&home, "/large.png", None).is_err());
    fs::write(documents.join("text.txt"), b"private").unwrap();
    assert!(notebook.read_picture(&home, "/text.txt", None).is_err());
}

#[cfg(windows)]
#[test]
fn an_open_notebook_root_cannot_be_replaced() {
    let parent = tempfile::tempdir().unwrap();
    let root = parent.path().join("notebook");
    let notebook = Notebook::create(&root, "Pinned").unwrap();
    let moved = parent.path().join("moved");
    assert!(
        fs::rename(&root, &moved).is_err(),
        "a path substitution must be refused while open"
    );
    let cloned = notebook.clone();
    drop(notebook);
    assert!(
        fs::rename(&root, &moved).is_err(),
        "clones retain the directory handle"
    );
    drop(cloned);
    fs::rename(&root, &moved).unwrap();
}

#[test]
fn similarly_sorted_names_remain_distinct_and_cannot_overwrite_each_other() {
    for (left, right) in [("Page1", "Page01"), ("Café", "Cafe\u{301}")] {
        let dir = tempfile::tempdir().unwrap();
        let notebook = Notebook::open(dir.path()).unwrap();
        let left = page(left);
        let right = page(right);
        notebook.save_page(&left, "first", Expect::Missing).unwrap();
        notebook
            .save_page(&right, "second", Expect::Missing)
            .unwrap();
        let index = mumbin_core::Index::build(&notebook, None).unwrap();
        assert_eq!(index.page(&left).unwrap().body, "first\n");
        assert_eq!(index.page(&right).unwrap().body, "second\n");
        assert!(notebook.move_page(&left, &right, true).is_err());
        assert_eq!(notebook.read_page(&left).unwrap().unwrap().body, "first\n");
        assert_eq!(
            notebook.read_page(&right).unwrap().unwrap().body,
            "second\n"
        );
    }
}

#[test]
fn unchanged_lf_page_is_preserved_byte_for_byte() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Home.txt");
    let original = b"Content-Type: text/x-mumbin-page\nPage-Format: mumbin 1\n\nKeep me\n";
    fs::write(&path, original).unwrap();
    let notebook = Notebook::open(dir.path()).unwrap();
    let name = page("Home");
    let loaded = notebook.read_page(&name).unwrap().unwrap();
    let result = notebook
        .save_page(&name, &loaded.body, Expect::Stamp(&loaded.stamp))
        .unwrap();
    assert_eq!(
        fs::read(&path).unwrap(),
        original,
        "saving an unedited page changed its bytes"
    );
    assert!(matches!(result, SaveOutcome::Unchanged(_)));
}

#[test]
fn existing_temporary_file_is_not_destroyed() {
    let dir = tempfile::tempdir().unwrap();
    let temporary = dir.path().join("Home.txt.mumbin-new~");
    fs::write(&temporary, b"another writer's recovery data").unwrap();
    let notebook = Notebook::open(dir.path()).unwrap();
    let _result = notebook.save_page(&page("Home"), "new page", Expect::Missing);
    assert_eq!(
        fs::read(&temporary).ok().as_deref(),
        Some(b"another writer's recovery data".as_slice())
    );
}

#[test]
fn unchanged_unusual_headers_and_blank_pages_survive() {
    for original in [
        "\u{feff}Content-Type: text/x-mumbin-page\nX-Custom:   value\nPage-Format: mumbin 0\n\nbody without newline",
        "Content-Type: text/x-mumbin-page\n\n   \n",
    ] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Home.txt");
        fs::write(&path, original).unwrap();
        let notebook = Notebook::open(dir.path()).unwrap();
        let name = page("Home");
        let loaded = notebook.read_page(&name).unwrap().unwrap();
        assert!(matches!(
            notebook
                .save_page(&name, &loaded.body, Expect::Stamp(&loaded.stamp))
                .unwrap(),
            SaveOutcome::Unchanged(_)
        ));
        assert_eq!(fs::read(&path).unwrap(), original.as_bytes());
    }
}

#[cfg(windows)]
#[test]
fn junction_cannot_redirect_page_writes_outside_notebook() {
    let dir = tempfile::tempdir().unwrap();
    let prepared = std::env::var_os("MUMBIN_JUNCTION_FIXTURE").map(std::path::PathBuf::from);
    let base = prepared.as_deref().unwrap_or(dir.path());
    let root = base.join("notebook");
    let outside = base.join("outside");
    let junction = root.join("Linked");
    if prepared.is_none() {
        fs::create_dir(&root).unwrap();
        fs::create_dir(&outside).unwrap();
        junction::create(&outside, &junction).expect("create junction fixture");
    } else {
        assert!(
            junction::exists(&junction).unwrap(),
            "prepared fixture must contain a real junction"
        );
    }
    let notebook = Notebook::open(&root).unwrap();
    let existing = outside.join("Existing.txt");
    let original = b"Content-Type: text/x-mumbin-page\n\nkeep\n";
    fs::write(&existing, original).unwrap();
    let external_name = page("Linked:Existing");
    let read_blocked = notebook.read_page(&external_name).is_err();
    let delete_blocked = notebook
        .save_page(&external_name, "", Expect::Anything)
        .is_err();
    let list_blocked = notebook.children(&page("Linked")).is_err();
    let result = notebook.save_page(&page("Linked:Page"), "outside write", Expect::Missing);
    let escaped = outside.join("Page.txt").exists();
    fs::remove_dir(&junction).unwrap();
    assert!(read_blocked && delete_blocked && list_blocked);
    assert_eq!(fs::read(existing).unwrap(), original);
    assert!(
        !escaped,
        "save_page wrote outside notebook via a directory junction: {result:?}"
    );
    assert!(result.is_err());
}
