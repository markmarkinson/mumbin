//! Notebooks can come from anywhere. A page written to make the program slow
//! or to eat memory must not be able to freeze indexing, searching or opening.

use std::fs;
use std::time::{Duration, Instant};

use mumbin_core::index::Index;

mod common;
use common::{PAGE_HEADER, new_notebook, page};

/// Lines that make naive "find the closing marker" scanners quadratic.
fn hostile_lines(size: usize) -> Vec<(&'static str, String)> {
    vec![
        ("open brackets", "[[a ]".repeat(size / 5)),
        ("open braces", "{{a ".repeat(size / 4)),
        ("open links", "[[a|b ".repeat(size / 6)),
        ("tags", "@a ".repeat(size / 3)),
        ("urls", "http://a ".repeat(size / 9)),
        ("checkboxes", "[ ] ".repeat(size / 4)),
        ("pipes", "|".repeat(size)),
        ("marks", "**a //b __c ~~d ''e ".repeat(size / 20)),
    ]
}

#[test]
fn indexing_and_searching_hostile_pages_stays_fast() {
    let (dir, notebook) = new_notebook("Hostile");
    for (index, (name, line)) in hostile_lines(300_000).into_iter().enumerate() {
        let file = dir.path().join(format!("Feind_{index}.txt"));
        fs::write(
            &file,
            format!("{PAGE_HEADER}{line}\n[ ] Aufgabe nach {name}\n"),
        )
        .unwrap();
    }

    let started = Instant::now();
    let index = Index::build(&notebook, None).unwrap();
    let tasks = index.tasks();
    let results = index.search("aufgabe", 50);
    let elapsed = started.elapsed();

    assert!(
        !tasks.is_empty() && !results.hits.is_empty(),
        "the pages were not read at all"
    );
    assert!(
        elapsed < Duration::from_secs(5),
        "indexing, tasks and search took {elapsed:?} on hostile pages"
    );
}

#[test]
fn a_huge_page_is_refused_instead_of_read_into_memory() {
    let (dir, notebook) = new_notebook("Huge");
    let big = dir.path().join("Riesig.txt");
    let mut text = String::from(PAGE_HEADER);
    text.push_str(&"x".repeat(80 * 1024 * 1024));
    fs::write(&big, text).unwrap();
    fs::write(dir.path().join("Normal.txt"), format!("{PAGE_HEADER}ok\n")).unwrap();

    let name = page("Riesig");
    assert!(notebook.read_page(&name).is_err(), "an 80 MB page was read");

    // The index must not choke on it either: the normal page is still there.
    let index = Index::build(&notebook, None).unwrap();
    assert!(index.page(&page("Normal")).is_some());
    let huge = index.page(&name);
    assert!(
        huge.is_none_or(|page| page.body.is_empty()),
        "the huge page's text was indexed"
    );
}
