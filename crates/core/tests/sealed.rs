//! Notebooks that hide their file names (decision E-025): what is on disk, what a listing shows,
//! and what happens when the notebook is locked or the files are tampered with.

// The tests read top to bottom like a story, and names on disk are plain lower-case tokens.
#![allow(
    clippy::too_many_lines,
    clippy::case_sensitive_file_extension_comparisons
)]

use std::fs;
use std::path::PathBuf;

use mumbin_core::crypto::{KdfParams, VAULT_BACKUP, VAULT_FILE};
use mumbin_core::notebook::{Expect, Notebook, NotebookError, SaveMode};

mod common;
use common::{new_sealed_notebook, page, page_names, read_body, save_keeping, walk};

const PASSPHRASE: &str = "ein langer geheimer Satz";

fn sealed_notebook() -> (tempfile::TempDir, Notebook, mumbin_core::crypto::Vault) {
    new_sealed_notebook("Geheimbuch", PASSPHRASE)
}

#[test]
fn nothing_on_disk_carries_a_real_name_or_text() {
    let (dir, notebook, vault) = sealed_notebook();
    save_keeping(
        &notebook,
        &vault,
        "Projekte:Garten:Beet",
        "Tomaten pflanzen\n",
    );
    save_keeping(&notebook, &vault, "Steuer 2026", "Geheime Zahlen\n");
    save_keeping(&notebook, &vault, "Home", "Start\n");

    let on_disk = walk(dir.path());
    let listing = on_disk.join("\n");
    for secret in ["Projekte", "Garten", "Beet", "Steuer", "2026", "Home"] {
        assert!(
            !listing.to_lowercase().contains(&secret.to_lowercase()),
            "{secret} is in a file name:\n{listing}"
        );
    }
    for relative in &on_disk {
        let name = relative.rsplit('/').next().unwrap();
        let known = matches!(name, "notebook.mumbin" | VAULT_FILE | VAULT_BACKUP | ".mnm");
        let token = name.strip_suffix(".txt").unwrap_or(name);
        assert!(
            known
                || (token.len() == 26
                    && token
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || (b'2'..=b'7').contains(&b))),
            "not an opaque name: {relative}"
        );
    }
    // The text is not in any file either.
    for relative in &on_disk {
        let path = dir.path().join(relative);
        if path.is_file() && !relative.ends_with("notebook.mumbin") {
            let bytes = fs::read(&path).unwrap();
            for secret in ["Tomaten", "Geheime Zahlen"] {
                assert!(
                    !bytes.windows(secret.len()).any(|w| w == secret.as_bytes()),
                    "{secret} is readable in {relative}"
                );
            }
        }
    }
    // The pages read back, with their real names in the tree.
    assert_eq!(
        read_body(&notebook, &vault, "Projekte:Garten:Beet").as_deref(),
        Some("Tomaten pflanzen\n")
    );
    assert_eq!(
        read_body(&notebook, &vault, "steuer 2026").as_deref(),
        Some("Geheime Zahlen\n"),
        "names ignore case, as in other notebooks"
    );
    let names = page_names(&notebook);
    for expected in [
        "Home",
        "Projekte",
        "Projekte:Garten",
        "Projekte:Garten:Beet",
        "Steuer 2026",
    ] {
        assert!(
            names.iter().any(|name| name == expected),
            "{expected} missing in {names:?}"
        );
    }
    let children: Vec<String> = notebook
        .children(&page("Projekte"))
        .unwrap()
        .iter()
        .map(|info| info.name.to_string())
        .collect();
    assert_eq!(children, ["Projekte:Garten"]);
}

#[test]
fn a_locked_notebook_shows_nothing_and_opens_again_with_the_passphrase() {
    let (dir, notebook, vault) = sealed_notebook();
    save_keeping(&notebook, &vault, "Projekte:Plan", "Plan\n");
    notebook.detach_vault();
    assert!(notebook.is_locked());
    assert!(matches!(notebook.all_pages(), Err(NotebookError::Locked)));
    assert!(matches!(
        notebook.read_page_with(&page("Projekte:Plan"), None),
        Err(NotebookError::Locked)
    ));
    assert!(matches!(
        notebook.save_page_with(&page("Neu"), "x\n", Expect::Anything, None, SaveMode::Keep),
        Err(NotebookError::Locked)
    ));

    // Another start of the program: the folder alone says it is sealed and locked.
    let again = Notebook::open(dir.path()).unwrap();
    assert!(again.is_sealed() && again.is_locked());
    assert!(matches!(
        again.unlock_vault("falsch falsch falsch").map(|_| ()),
        Err(NotebookError::Crypto(_))
    ));
    assert!(again.is_locked());
    let vault = again.unlock_vault(PASSPHRASE).unwrap();
    assert!(!again.is_locked());
    assert_eq!(page_names(&again), ["Projekte", "Projekte:Plan"]);
    assert_eq!(
        read_body(&again, &vault, "Projekte:Plan").as_deref(),
        Some("Plan\n")
    );
}

#[test]
fn a_file_renamed_or_copied_by_hand_is_not_accepted() {
    let (dir, notebook, vault) = sealed_notebook();
    save_keeping(&notebook, &vault, "Eins", "Text eins\n");
    save_keeping(&notebook, &vault, "Zwei", "Text zwei\n");
    let files: Vec<PathBuf> = walk(dir.path())
        .into_iter()
        .filter(|name| name.ends_with(".txt"))
        .map(|name| dir.path().join(name))
        .collect();
    assert_eq!(files.len(), 2);
    // Swap the two files: each token now holds the other page.
    let (a, b) = (fs::read(&files[0]).unwrap(), fs::read(&files[1]).unwrap());
    fs::write(&files[0], &b).unwrap();
    fs::write(&files[1], &a).unwrap();
    let again = Notebook::open(dir.path()).unwrap();
    again.unlock_vault(PASSPHRASE).unwrap();
    assert!(
        page_names(&again).is_empty(),
        "swapped files were listed: {:?}",
        page_names(&again)
    );
    // A copy under another opaque name is ignored too.
    fs::write(&files[0], &a).unwrap();
    fs::write(&files[1], &b).unwrap();
    fs::copy(&files[0], dir.path().join("aaaaaaaaaaaaaaaaaaaaaaaaaa.txt")).unwrap();
    let reopened = Notebook::open(dir.path()).unwrap();
    reopened.unlock_vault(PASSPHRASE).unwrap();
    let names = page_names(&reopened);
    assert_eq!(names.len(), 2, "{names:?}");
}

#[test]
fn removing_the_last_page_removes_its_folders_and_a_page_cannot_be_made_plain() {
    let (dir, notebook, vault) = sealed_notebook();
    save_keeping(&notebook, &vault, "A:B:C", "x\n");
    assert!(walk(dir.path()).iter().any(|name| name.ends_with(".mnm")));
    save_keeping(&notebook, &vault, "A:B:C", "\n");
    let left = walk(dir.path());
    assert!(
        !left
            .iter()
            .any(|name| name.ends_with(".mnm") || name.ends_with(".txt")),
        "{left:?}"
    );
    // The pages of a notebook like this are always encrypted.
    let refused = notebook.save_page_with(
        &page("Neu"),
        "x\n",
        Expect::Anything,
        Some(&vault),
        SaveMode::Decrypt,
    );
    assert!(refused.is_err());
}

#[test]
fn a_notebook_with_pages_cannot_start_hiding_its_names() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::create(dir.path(), "Offen").unwrap();
    notebook
        .save_page(&page("Home"), "Hallo\n", Expect::Anything)
        .unwrap();
    assert!(
        notebook
            .create_sealed_vault(PASSPHRASE, KdfParams::MINIMUM)
            .is_err()
    );
}

#[test]
fn the_passphrase_can_change_and_the_names_stay_hidden() {
    let (dir, notebook, vault) = sealed_notebook();
    save_keeping(&notebook, &vault, "Plan", "Text\n");
    notebook
        .change_passphrase(
            PASSPHRASE,
            "ein ganz anderer langer Satz",
            KdfParams::MINIMUM,
        )
        .unwrap();
    let again = Notebook::open(dir.path()).unwrap();
    assert!(
        again.is_sealed(),
        "the flag was lost with the new passphrase"
    );
    again.unlock_vault("ein ganz anderer langer Satz").unwrap();
    assert_eq!(page_names(&again), ["Plan"]);
}

#[test]
fn attachments_are_sealed_with_their_names_and_come_back() {
    let (dir, notebook, vault) = sealed_notebook();
    save_keeping(&notebook, &vault, "Projekte:Plan", "Plan\n");
    let plan = page("Projekte:Plan");
    let stored = notebook
        .attach_bytes_sealed(&plan, "Skizze.png", b"\x89PNG bild", &vault)
        .unwrap();
    assert_eq!(stored, "Skizze.png");
    // The same wish again gets a free name, never overwrites.
    assert_eq!(
        notebook
            .attach_bytes_sealed(&plan, "Skizze.png", b"zwei", &vault)
            .unwrap(),
        "Skizze-2.png"
    );
    // Plain storing is refused: it would leave the content readable.
    assert!(notebook.attach_bytes(&plan, "x.txt", b"klartext").is_err());
    let source = dir
        .path()
        .join("..")
        .join(format!("mumbin-source-{}.pdf", std::process::id()));
    fs::write(&source, b"%PDF geheim").unwrap();
    assert!(
        notebook
            .attach_file_sealed(&plan, &source, &vault)
            .unwrap()
            .ends_with(".pdf")
    );
    let _ = fs::remove_file(&source);

    let listing = walk(dir.path()).join("\n").to_lowercase();
    assert!(
        !listing.contains("skizze") && !listing.contains("png") && !listing.contains("pdf"),
        "{listing}"
    );

    let list = notebook.attachments(&plan).unwrap();
    let names: Vec<&str> = list.iter().map(|a| a.name.as_str()).collect();
    assert_eq!(names.len(), 3, "{names:?}");
    assert!(names.contains(&"Skizze.png") && names.contains(&"Skizze-2.png"));
    let first = list.iter().find(|a| a.name == "Skizze.png").unwrap();
    assert!(first.encrypted && first.is_image);
    assert_eq!(first.size, 9, "the size is the size of the content");

    // A link written on the page finds the file; its content opens with the vault only.
    let path = notebook.resolve_file(&plan, "./Skizze.png").unwrap();
    assert!(notebook.is_sealed_only(&path));
    assert_eq!(
        notebook.read_attachment(&path, Some(&vault)).unwrap(),
        b"\x89PNG bild"
    );
    assert!(matches!(
        notebook.read_attachment(&path, None),
        Err(NotebookError::Locked)
    ));
    assert_eq!(
        notebook
            .read_picture(&plan, "./Skizze.png", Some(&vault))
            .unwrap(),
        b"\x89PNG bild"
    );
    // Another page of the notebook can reach it with a relative link.
    save_keeping(&notebook, &vault, "Projekte", "Start\n");
    let from_parent = notebook
        .resolve_file(&page("Projekte"), "./Plan/Skizze.png")
        .unwrap();
    assert_eq!(from_parent, path);
    assert_eq!(
        notebook
            .resolve_file(&page("Projekte:Plan"), "../Plan/Skizze.png")
            .unwrap(),
        path
    );

    // Renaming rewrites the sealed name; the content stays.
    let renamed = notebook
        .rename_attachment_with(&plan, "Skizze.png", "Entwurf.png", Some(&vault))
        .unwrap();
    assert_eq!(renamed.name, "Entwurf.png");
    let names: Vec<String> = notebook
        .attachments(&plan)
        .unwrap()
        .into_iter()
        .map(|a| a.name)
        .collect();
    assert!(
        names.contains(&"Entwurf.png".to_owned()) && !names.contains(&"Skizze.png".to_owned()),
        "{names:?}"
    );
    let path = notebook.resolve_file(&plan, "./Entwurf.png").unwrap();
    assert_eq!(
        notebook.read_attachment(&path, Some(&vault)).unwrap(),
        b"\x89PNG bild"
    );
    assert!(
        notebook
            .rename_attachment_with(&plan, "Entwurf.png", "skizze-2.png", Some(&vault))
            .is_err(),
        "a name that exists"
    );
    // Case only.
    notebook
        .rename_attachment_with(&plan, "Entwurf.png", "ENTWURF.png", Some(&vault))
        .unwrap();
    assert!(
        notebook
            .attachments(&plan)
            .unwrap()
            .iter()
            .any(|a| a.name == "ENTWURF.png")
    );

    notebook
        .delete_attachment(&plan, "ENTWURF.png", true)
        .unwrap();
    assert_eq!(notebook.attachments(&plan).unwrap().len(), 2);
    // Nothing of a locked notebook is listed.
    notebook.detach_vault();
    assert!(matches!(
        notebook.attachments(&plan),
        Err(NotebookError::Locked)
    ));
}

#[test]
fn moving_takes_the_children_and_attachments_and_keeps_every_name_hidden() {
    let (dir, notebook, vault) = sealed_notebook();
    save_keeping(
        &notebook,
        &vault,
        "Projekte:Garten",
        "Garten siehe [[Projekte:Garten:Beet]]\n",
    );
    save_keeping(&notebook, &vault, "Projekte:Garten:Beet", "Beet\n");
    save_keeping(&notebook, &vault, "Links", "Zum [[Projekte:Garten]]\n");
    notebook
        .attach_bytes_sealed(&page("Projekte:Garten"), "plan.png", b"png", &vault)
        .unwrap();

    let report = notebook
        .move_page_with(
            &page("Projekte:Garten"),
            &page("Archiv:Wiese"),
            true,
            Some(&vault),
        )
        .unwrap();
    assert!(report.failed.is_empty(), "{report:?}");
    let names = page_names(&notebook);
    for expected in ["Archiv", "Archiv:Wiese", "Archiv:Wiese:Beet", "Links"] {
        assert!(
            names.contains(&expected.to_owned()),
            "{expected} missing in {names:?}"
        );
    }
    assert!(!names.contains(&"Projekte:Garten".to_owned()), "{names:?}");
    assert_eq!(
        read_body(&notebook, &vault, "Archiv:Wiese:Beet").as_deref(),
        Some("Beet\n")
    );
    // The links followed the move, the attachment came along under its own name.
    assert!(
        read_body(&notebook, &vault, "Links")
            .unwrap()
            .contains("[[Archiv:Wiese]]")
    );
    let moved: Vec<String> = notebook
        .attachments(&page("Archiv:Wiese"))
        .unwrap()
        .into_iter()
        .map(|a| a.name)
        .collect();
    assert_eq!(moved, ["plan.png"]);
    let listing = walk(dir.path()).join("\n").to_lowercase();
    for secret in ["garten", "wiese", "archiv", "projekte", "beet", "plan"] {
        assert!(
            !listing.contains(secret),
            "{secret} is in a file name:\n{listing}"
        );
    }

    // Case only, and onto a name that exists.
    notebook
        .move_page_with(
            &page("Archiv:Wiese"),
            &page("Archiv:WIESE"),
            true,
            Some(&vault),
        )
        .unwrap();
    assert!(
        page_names(&notebook).contains(&"Archiv:WIESE".to_owned()),
        "{:?}",
        page_names(&notebook)
    );
    assert!(
        notebook
            .move_page_with(&page("Links"), &page("Archiv:Wiese"), true, Some(&vault))
            .is_err()
    );
    // Without the vault a sealed notebook moves nothing.
    assert!(matches!(
        notebook.move_page(&page("Links"), &page("Neu"), false),
        Err(NotebookError::Locked)
    ));

    // Deleting takes the page, its children and their files; no empty folder stays behind.
    let (pages, files) = notebook.deletion_size(&page("Archiv:WIESE")).unwrap();
    assert_eq!((pages, files), (2, 1));
    notebook.delete_page(&page("Archiv:WIESE"), true).unwrap();
    notebook.delete_page(&page("Links"), true).unwrap();
    assert!(
        page_names(&notebook).is_empty(),
        "{:?}",
        page_names(&notebook)
    );
    let left = walk(dir.path());
    assert!(
        !left.iter().any(|name| name.ends_with(".mnm")
            || name.ends_with(".txt")
            || name.ends_with(".swenc")),
        "{left:?}"
    );
}

#[test]
fn search_tags_and_export_work_on_a_sealed_notebook() {
    let (dir, notebook, vault) = sealed_notebook();
    save_keeping(
        &notebook,
        &vault,
        "Rezepte:Kuchen",
        "Kuchen mit Marzipan @lecker\n[ ] Eier kaufen\n",
    );
    notebook
        .attach_bytes_sealed(&page("Rezepte:Kuchen"), "foto.png", b"bildbytes", &vault)
        .unwrap();

    let index = mumbin_core::Index::build_with(&notebook, None, Some(&vault)).unwrap();
    assert_eq!(
        index.pages().len(),
        2,
        "the placeholder parent and the page"
    );
    assert_eq!(index.pages_with_tag("lecker").len(), 1);
    // Without the vault the sealed text is not in the index.
    let blind = mumbin_core::Index::build_with(&notebook, None, None).unwrap();
    assert!(blind.pages_with_tag("lecker").is_empty());

    let out = dir
        .path()
        .join("..")
        .join(format!("mumbin-export-{}", std::process::id()));
    let texts = mumbin_core::export::Texts {
        language: "de".to_owned(),
        contents: "Inhalt".to_owned(),
        exported: "Exportiert".to_owned(),
        print_hint: "Drucken".to_owned(),
    };
    let report = index
        .export_html_with(&notebook, None, &out, &texts, Some(&vault))
        .unwrap();
    assert!(report.files >= 1);
    assert_eq!(
        fs::read(out.join("Rezepte/Kuchen/foto.png"))
            .unwrap_or_else(
                |_| fs::read(out.join("Rezepte").join("Kuchen").join("foto.png")).unwrap()
            ),
        b"bildbytes"
    );
    let _ = fs::remove_dir_all(&out);
}

#[test]
fn the_vault_file_has_a_copy_that_takes_over_when_it_is_gone() {
    let (dir, notebook, vault) = sealed_notebook();
    save_keeping(&notebook, &vault, "Plan", "Text\n");
    drop(notebook);
    let main = dir.path().join(VAULT_FILE);
    let copy = dir.path().join(VAULT_BACKUP);
    assert!(main.is_file() && copy.is_file());
    // The main file is deleted by mistake: the notebook still opens, knows it is sealed, and the file is made again.
    fs::remove_file(&main).unwrap();
    let again = Notebook::open(dir.path()).unwrap();
    assert!(again.is_sealed() && again.is_locked());
    assert!(main.is_file(), "the main vault file was not made again");
    again.unlock_vault(PASSPHRASE).unwrap();
    assert_eq!(page_names(&again), ["Plan"]);
    // Damaged instead of gone: same.
    fs::write(&main, "kaputt").unwrap();
    let damaged = Notebook::open(dir.path()).unwrap();
    damaged.unlock_vault(PASSPHRASE).unwrap();
    assert_eq!(page_names(&damaged), ["Plan"]);
}
