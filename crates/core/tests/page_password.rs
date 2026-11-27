//! Pages with a password of their own, next to plain pages and pages of the vault: what lies on
//! disk, what a locked page refuses, and that page, files and index agree.

use std::fs;
use std::sync::Arc;
use std::time::{Duration, Instant};

use mumbin_core::crypto::{CryptoError, FileSeal, Keys, PageKey, PageKeys, Vault};
use mumbin_core::export::Texts;
use mumbin_core::notebook::SaveMode;
use mumbin_core::{Expect, Index, LoadedPage, Notebook, NotebookError, SaveOutcome};

mod common;
use common::{FAST, new_notebook, new_sealed_notebook, new_vault_notebook, on_disk, page};
use common::{read_open, save_encrypted};

const ONE: &str = "erstes Passwort";
const TWO: &str = "zweites Passwort";
const TEXT_ONE: &str = "Konto 4711 @privat\n[ ] Geheime Aufgabe\n";

/// Saves a plain page and gives it a password of its own.
fn protect(notebook: &Notebook, name: &str, text: &str, password: &str) -> Arc<PageKey> {
    notebook
        .save_page(&page(name), text, Expect::Missing)
        .unwrap();
    notebook
        .protect_page(&page(name), password, FAST)
        .unwrap()
        .key
}

fn keys_of(entries: &[(&str, &Arc<PageKey>)]) -> PageKeys {
    let mut keys = PageKeys::default();
    for (name, key) in entries {
        keys.insert(&page(name), Arc::clone(key));
    }
    keys
}

fn read_with(notebook: &Notebook, keys: &PageKeys, name: &str) -> LoadedPage {
    notebook.read_page_with(&page(name), keys).unwrap().unwrap()
}

fn wrong_password(error: &NotebookError) -> bool {
    matches!(error, NotebookError::Crypto(CryptoError::WrongPassphrase))
}

fn files_in(folder: &std::path::Path) -> usize {
    fs::read_dir(folder).unwrap().count()
}

#[test]
fn a_page_has_its_own_password_without_a_vault_and_without_other_pages() {
    let (_dir, notebook) = new_notebook("Notizen");
    assert!(!notebook.has_vault().unwrap());
    let one = protect(&notebook, "Eins", TEXT_ONE, ONE);
    let two = protect(&notebook, "Zwei", "Zweites Geheimnis", TWO);
    notebook
        .save_page(&page("Offen"), "offen", Expect::Missing)
        .unwrap();

    for (name, leaked) in [("Eins", "Konto"), ("Zwei", "Zweites"), ("Eins", "privat")] {
        let file = on_disk(&notebook, name);
        assert!(
            file.starts_with("Content-Type: text/x-mumbin-page"),
            "{file}"
        );
        assert!(file.contains("Encrypted: swenc3") && !file.contains(leaked));
    }
    let locked = notebook.read_page(&page("Eins")).unwrap().unwrap();
    assert!(locked.encrypted && locked.own_password && locked.locked);
    assert!(locked.body.is_empty());

    // A key opens its own page only.
    let only_one = keys_of(&[("Eins", &one)]);
    let opened = read_with(&notebook, &only_one, "Eins");
    assert_eq!((opened.body.as_str(), opened.locked), (TEXT_ONE, false));
    assert!(read_with(&notebook, &only_one, "Zwei").locked);
    let swapped = keys_of(&[("Eins", &two)]);
    assert!(
        read_with(&notebook, &swapped, "Eins").locked,
        "the key of another page"
    );
    let both = keys_of(&[("Eins", &one), ("Zwei", &two)]);
    assert_eq!(
        read_with(&notebook, &both, "Zwei").body.trim_end(),
        "Zweites Geheimnis"
    );

    // Passwords: each opens its page, never the other.
    assert!(notebook.unlock_page(&page("Eins"), ONE).is_ok());
    for (name, password) in [
        ("Eins", TWO),
        ("Zwei", ONE),
        ("Eins", ""),
        ("Zwei", "zweites"),
    ] {
        let error = notebook.unlock_page(&page(name), password).unwrap_err();
        assert!(wrong_password(&error), "{name} with {password:?}");
    }
    assert!(notebook.unlock_page(&page("Offen"), ONE).is_err());
    assert!(notebook.unlock_page(&page("Fehlt"), ONE).is_err());
}

#[test]
fn a_locked_page_refuses_every_write_and_an_open_one_stays_protected() {
    let (_dir, notebook, vault) = new_vault_notebook();
    let one = protect(&notebook, "Eins", TEXT_ONE, ONE);
    let two = protect(&notebook, "Zwei", "zwei", TWO);
    let before = on_disk(&notebook, "Eins");
    let wrong = keys_of(&[("Eins", &two)]);
    let correct = keys_of(&[("Eins", &one)]);

    // No key, the vault alone, the key of another page: nothing is written, whatever the mode.
    // (A password is changed with `change_page_password`, not by saving.)
    for mode in [
        SaveMode::Keep,
        SaveMode::Decrypt,
        SaveMode::Own,
        SaveMode::Encrypt,
    ] {
        for keys in [Keys::default(), Keys::from(&vault), Keys::from(&wrong)] {
            let result = notebook.save_page_with(&page("Eins"), "x", Expect::Anything, keys, mode);
            assert!(result.is_err(), "{mode:?}: {result:?}");
        }
    }
    let result = notebook.save_page_with(
        &page("Eins"),
        "x",
        Expect::Anything,
        &correct,
        SaveMode::Own,
    );
    assert!(matches!(result, Err(NotebookError::Locked)), "{result:?}");
    assert!(matches!(
        notebook.save_page(&page("Eins"), "", Expect::Anything),
        Err(NotebookError::Locked)
    ));
    assert_eq!(on_disk(&notebook, "Eins"), before);
    // The vault does not take such a page over, one by one or in bulk.
    assert!(
        notebook
            .set_page_encrypted(&page("Eins"), &vault, true)
            .is_err()
    );
    assert!(
        notebook
            .set_page_encrypted(&page("Eins"), &vault, false)
            .is_err()
    );
    assert_eq!(notebook.convert_all_pages(&vault, true).unwrap().changed, 0);
    assert_eq!(
        notebook.convert_all_pages(&vault, false).unwrap().changed,
        0
    );
    assert_eq!(on_disk(&notebook, "Eins"), before);

    // Saving with the key keeps the page protected; the same text is not written again.
    let loaded = read_with(&notebook, &correct, "Eins");
    let same = notebook
        .save_page_with(
            &page("Eins"),
            &loaded.body,
            Expect::Stamp(&loaded.stamp),
            &correct,
            SaveMode::Keep,
        )
        .unwrap();
    assert!(matches!(same, SaveOutcome::Unchanged(_)));
    assert_eq!(on_disk(&notebook, "Eins"), before);
    notebook
        .save_page_with(
            &page("Eins"),
            "neuer Text",
            Expect::Stamp(&loaded.stamp),
            &correct,
            SaveMode::Keep,
        )
        .unwrap();
    let after = on_disk(&notebook, "Eins");
    assert!(after.contains("Encrypted: swenc3") && !after.contains("neuer"));
    let loaded = read_with(&notebook, &correct, "Eins");
    assert_eq!(loaded.body.trim_end(), "neuer Text");
    assert!(notebook.unlock_page(&page("Eins"), ONE).is_ok());
    // An emptied page is removed like any other.
    let removed = notebook
        .save_page_with(
            &page("Eins"),
            " \n",
            Expect::Stamp(&loaded.stamp),
            &correct,
            SaveMode::Keep,
        )
        .unwrap();
    assert_eq!(removed, SaveOutcome::Removed);
    assert!(!notebook.page_file(&page("Eins")).exists());
}

#[test]
fn the_files_of_a_page_are_sealed_with_its_password_and_follow_the_page() {
    let (_dir, notebook) = new_notebook("Notizen");
    let name = page("Akte");
    let key = protect(&notebook, "Akte", "Bild {{./foto.png}}", ONE);
    let keys = keys_of(&[("Akte", &key)]);
    notebook
        .attach_bytes_with(&name, "foto.png", b"Bildinhalt", &*key)
        .unwrap();
    // A plain file put there by hand is sealed by the next conversion.
    notebook.attach_bytes(&name, "roh.txt", b"Rohtext").unwrap();
    let (done, failed) = notebook.convert_attachments(&name, &*key, true).unwrap();
    assert_eq!((done, failed.len()), (1, 0));

    let folder = notebook.page_folder(&name);
    let sealed = fs::read(folder.join("foto.png.swenc")).unwrap();
    assert!(sealed.starts_with(b"SWENC3F\0"));
    assert!(!String::from_utf8_lossy(&sealed).contains("Bildinhalt"));
    assert!(!folder.join("roh.txt").exists());
    let listed: Vec<(String, bool)> = notebook
        .attachments(&name)
        .unwrap()
        .into_iter()
        .map(|file| (file.name, file.encrypted))
        .collect();
    assert_eq!(
        listed,
        [("foto.png".to_owned(), true), ("roh.txt".to_owned(), true)]
    );

    // Read: with the key of the page (also as a picture on it), never without it.
    let path = folder.join("foto.png");
    assert_eq!(
        notebook.read_attachment(&path, &keys).unwrap(),
        b"Bildinhalt"
    );
    assert_eq!(
        notebook.read_picture(&name, "./foto.png", &keys).unwrap(),
        b"Bildinhalt"
    );
    for other in [PageKeys::default(), keys_of(&[("Anders", &key)])] {
        assert!(matches!(
            notebook.read_attachment(&path, &other),
            Err(NotebookError::Locked)
        ));
    }
    assert!(matches!(
        notebook.read_attachment(&path, None::<&Vault>),
        Err(NotebookError::Locked)
    ));
    let vault = notebook.create_vault("pw", FAST).unwrap();
    assert!(matches!(
        notebook.read_attachment(&path, &vault),
        Err(NotebookError::Locked)
    ));

    // Rename with the links; a locked rename is refused.
    assert!(matches!(
        notebook.rename_attachment(&name, "foto.png", "bild.png"),
        Err(NotebookError::Locked)
    ));
    let report = notebook
        .rename_attachment_with(&name, "foto.png", "bild.png", &keys)
        .unwrap();
    assert_eq!(report.links_updated, 1);
    assert!(
        read_with(&notebook, &keys, "Akte")
            .body
            .contains("./bild.png")
    );
    assert!(!on_disk(&notebook, "Akte").contains("bild.png"));
}

#[test]
fn a_page_with_files_is_moved_and_renamed_without_its_password() {
    let (_dir, notebook) = new_notebook("Notizen");
    let name = page("Akte");
    let key = protect(&notebook, "Akte", "Bild {{./bild.png}}", ONE);
    notebook
        .attach_bytes_with(&name, "bild.png", b"Bildinhalt", &*key)
        .unwrap();
    let keys = keys_of(&[("Akte", &key)]);

    // The page moves with its files and opens with the same key and password.
    let target = page("Archiv:Akte 2");
    notebook
        .move_page_with(&name, &target, true, &keys)
        .unwrap();
    assert!(!notebook.page_file(&name).exists());
    let moved_keys = keys_of(&[("Archiv:Akte 2", &key)]);
    let moved = notebook.page_folder(&target).join("bild.png");
    assert_eq!(
        notebook.read_attachment(&moved, &moved_keys).unwrap(),
        b"Bildinhalt"
    );
    let reopened = notebook.unlock_page(&target, ONE).unwrap();
    let sealed_file = fs::read(notebook.page_folder(&target).join("bild.png.swenc")).unwrap();
    assert_eq!(
        reopened.open_file(&sealed_file).unwrap().as_slice(),
        b"Bildinhalt"
    );

    // A locked page is renamed without its password; links in other pages follow.
    notebook
        .save_page(&page("Hinweis"), "[[Archiv:Akte 2]]", Expect::Missing)
        .unwrap();
    let report = notebook
        .move_page(&target, &page("Archiv:Akte 3"), true)
        .unwrap();
    assert_eq!(report.updated, ["Hinweis"]);
    let renamed = page("Archiv:Akte 3");
    let renamed_keys = keys_of(&[("Archiv:Akte 3", &key)]);
    assert_eq!(
        read_with(&notebook, &renamed_keys, "Archiv:Akte 3")
            .body
            .trim_end(),
        "Bild {{./bild.png}}"
    );

    notebook
        .delete_attachment(&renamed, "bild.png", true)
        .unwrap();
    assert!(
        !notebook
            .page_folder(&renamed)
            .join("bild.png.swenc")
            .exists()
    );
    notebook.delete_page(&renamed, true).unwrap();
    assert!(!notebook.page_file(&renamed).exists());
}

#[test]
fn the_index_holds_the_text_of_an_own_password_page_only_while_its_key_is_open() {
    let (_dir, notebook, vault) = new_vault_notebook();
    notebook
        .save_page(&page("Offen"), "offen [[Eins]]", Expect::Missing)
        .unwrap();
    save_encrypted(&notebook, &vault, "Tresor", "Tresortext @tresor");
    let one = protect(&notebook, "Eins", TEXT_ONE, ONE);
    let two = protect(&notebook, "Zwei", "zwei @zwei", TWO);

    let locked = Index::build(&notebook, None).unwrap();
    let entry = locked.page(&page("Eins")).unwrap();
    assert!(entry.info.has_content && entry.encrypted && entry.own_password && entry.locked);
    assert!(entry.body.is_empty() && entry.lower.is_empty());
    assert!(locked.search("Konto", 10).hits.is_empty() && locked.tasks().is_empty());
    assert!(
        locked.search("@privat", 10).hits.is_empty() && locked.pages_with_tag("privat").is_empty()
    );
    assert_eq!(
        locked.backlinks(&page("Eins")).len(),
        1,
        "a link to a locked page still counts"
    );

    // The vault opens its own pages and none of the others.
    let vault_open = Index::build_with(&notebook, Some(&locked), &vault).unwrap();
    assert!(!vault_open.page(&page("Tresor")).unwrap().locked);
    assert!(vault_open.page(&page("Eins")).unwrap().locked);
    // One page key opens that page only.
    let keys = keys_of(&[("Eins", &one)]);
    let open =
        Index::build_with(&notebook, Some(&vault_open), Keys::new(Some(&vault), &keys)).unwrap();
    assert!(!open.page(&page("Eins")).unwrap().locked);
    assert!(open.page(&page("Zwei")).unwrap().locked);
    assert_eq!(open.search("Konto", 10).hits.len(), 1);
    assert_eq!(open.tasks().len(), 1);
    assert_eq!(open.pages_with_tag("privat").len(), 1);
    assert!(open.pages_with_tag("zwei").is_empty());
    // Locking forgets the text again, although no file changed.
    let relocked = Index::build_with(&notebook, Some(&open), &vault).unwrap();
    let entry = relocked.page(&page("Eins")).unwrap();
    assert!(entry.locked && entry.body.is_empty());
    assert!(relocked.search("Konto", 10).hits.is_empty() && relocked.tasks().is_empty());
    let both = keys_of(&[("Eins", &one), ("Zwei", &two)]);
    let all = Index::build_with(&notebook, None, &both).unwrap();
    assert_eq!(all.pages_with_tag("zwei").len(), 1);
}

#[test]
fn an_export_leaves_out_what_is_locked_and_opens_what_is_open() {
    let (_dir, notebook) = new_notebook("Notizen");
    let outside = tempfile::tempdir().unwrap();
    let one = protect(&notebook, "Eins", "Text von eins {{./a.png}}", ONE);
    let two = protect(&notebook, "Zwei", "Text von zwei", TWO);
    for (name, key) in [("Eins", &one), ("Zwei", &two)] {
        notebook
            .attach_bytes_with(&page(name), "a.png", name.as_bytes(), &**key)
            .unwrap();
    }
    notebook
        .save_page(&page("Offen"), "offen", Expect::Missing)
        .unwrap();
    let texts = Texts {
        language: "de".to_owned(),
        contents: "Inhalt".to_owned(),
        exported: "Exportiert".to_owned(),
        print_hint: "Drucken".to_owned(),
    };
    let export = |keys: &PageKeys, folder: &str| {
        let index = Index::build_with(&notebook, None, keys).unwrap();
        let out = outside.path().join(folder);
        let report = index
            .export_html_with(&notebook, None, &out, &texts, keys)
            .unwrap();
        (report, out)
    };

    let (report, out) = export(&keys_of(&[("Eins", &one)]), "teil");
    assert_eq!((report.pages, report.files), (2, 1), "Offen and Eins");
    let html = fs::read_to_string(out.join("Eins.html")).unwrap();
    assert!(html.contains("Text von eins") && !out.join("Zwei.html").exists());
    assert_eq!(fs::read(out.join("Eins").join("a.png")).unwrap(), b"Eins");
    assert!(!out.join("Zwei").exists(), "the file of a locked page");
    let (report, _) = export(&PageKeys::default(), "nichts");
    assert_eq!((report.pages, report.files), (1, 0));
}

#[test]
fn protecting_changing_and_removing_a_password_keeps_page_and_files_together() {
    let (_dir, notebook) = new_notebook("Notizen");
    let name = page("Akte");
    notebook
        .save_page(&name, "Inhalt {{./a.png}}", Expect::Missing)
        .unwrap();
    notebook.attach_bytes(&name, "a.png", b"Bild A").unwrap();
    notebook.attach_bytes(&name, "b.txt", b"Text B").unwrap();
    let folder = notebook.page_folder(&name);

    let first = notebook.protect_page(&name, ONE, FAST).unwrap().key;
    assert!(!folder.join("a.png").exists() && folder.join("a.png.swenc").is_file());
    assert!(
        notebook.protect_page(&name, TWO, FAST).is_err(),
        "already protected"
    );
    let before = on_disk(&notebook, "Akte");

    // Wrong old password: nothing changes.
    let error = notebook
        .change_page_password(&name, TWO, "drittes Passwort", FAST)
        .unwrap_err();
    assert!(wrong_password(&error));
    assert_eq!(on_disk(&notebook, "Akte"), before);

    let changed = notebook
        .change_page_password(&name, ONE, TWO, FAST)
        .unwrap();
    assert!(changed.failed.is_empty(), "every file was moved into place");
    let second = changed.key;
    assert_ne!(on_disk(&notebook, "Akte"), before);
    assert!(wrong_password(
        &notebook.unlock_page(&name, ONE).unwrap_err()
    ));
    let keys = keys_of(&[("Akte", &second)]);
    assert_eq!(
        read_with(&notebook, &keys, "Akte").body.trim_end(),
        "Inhalt {{./a.png}}"
    );
    for (file, content) in [("a.png", "Bild A"), ("b.txt", "Text B")] {
        let plain = folder.join(file);
        assert_eq!(
            notebook.read_attachment(&plain, &keys).unwrap(),
            content.as_bytes()
        );
    }
    let old = keys_of(&[("Akte", &first)]);
    assert!(
        read_with(&notebook, &old, "Akte").locked,
        "the old key no longer fits"
    );
    assert!(
        notebook
            .read_attachment(&folder.join("a.png"), &old)
            .is_err()
    );
    assert_eq!(files_in(&folder), 2, "no helper file is left");

    // Removing the protection needs the password; then everything is plain again.
    assert!(wrong_password(
        &notebook.unprotect_page(&name, ONE).unwrap_err()
    ));
    assert!(on_disk(&notebook, "Akte").contains("swenc3"));
    notebook.unprotect_page(&name, TWO).unwrap();
    let plain = on_disk(&notebook, "Akte");
    assert!(plain.contains("Inhalt") && !plain.contains("Encrypted"));
    assert_eq!(fs::read(folder.join("a.png")).unwrap(), b"Bild A");
    assert_eq!(fs::read(folder.join("b.txt")).unwrap(), b"Text B");
    assert!(!folder.join("a.png.swenc").exists());
}

#[test]
fn a_damaged_file_stops_a_change_before_anything_is_written() {
    let (_dir, notebook) = new_notebook("Notizen");
    let name = page("Akte");
    let key = protect(&notebook, "Akte", "Text", ONE);
    notebook
        .attach_bytes_with(&name, "gut.bin", b"gut", &*key)
        .unwrap();
    notebook
        .attach_bytes_with(&name, "kaputt.bin", b"kaputt", &*key)
        .unwrap();
    let folder = notebook.page_folder(&name);
    let broken = folder.join("kaputt.bin.swenc");
    let mut bytes = fs::read(&broken).unwrap();
    *bytes.last_mut().unwrap() ^= 1;
    fs::write(&broken, &bytes).unwrap();
    let before = on_disk(&notebook, "Akte");
    let good = fs::read(folder.join("gut.bin.swenc")).unwrap();

    assert!(
        notebook
            .change_page_password(&name, ONE, TWO, FAST)
            .is_err()
    );
    assert_eq!(on_disk(&notebook, "Akte"), before, "the page was changed");
    assert_eq!(fs::read(&broken).unwrap(), bytes);
    assert_eq!(fs::read(folder.join("gut.bin.swenc")).unwrap(), good);
    assert_eq!(files_in(&folder), 2, "a helper file was left behind");
    // Taking the protection off stops at the damaged file; the page keeps its password.
    assert!(notebook.unprotect_page(&name, ONE).is_err());
    assert_eq!(on_disk(&notebook, "Akte"), before, "the page was changed");
    assert_eq!(
        fs::read(&broken).unwrap(),
        bytes,
        "a damaged file was removed"
    );
    assert!(
        notebook.unlock_page(&name, ONE).is_ok(),
        "the old password still works"
    );
}

#[test]
fn only_a_plain_page_of_an_ordinary_notebook_can_get_a_password() {
    let (_dir, notebook, vault) = new_vault_notebook();
    save_encrypted(&notebook, &vault, "Tresor", "geheim");
    assert!(notebook.protect_page(&page("Tresor"), ONE, FAST).is_err());
    assert!(notebook.protect_page(&page("Fehlt"), ONE, FAST).is_err());
    let own = protect(&notebook, "Eigen", "eigen", ONE);
    let result = notebook.save_page_with(
        &page("Tresor"),
        "x",
        Expect::Anything,
        &keys_of(&[("Tresor", &own)]),
        SaveMode::Own,
    );
    assert!(result.is_err());
    assert!(
        read_open(&notebook, &vault, "Tresor")
            .body
            .contains("geheim")
    );

    let (_dir, sealed, vault) = new_sealed_notebook("Alles", "pw");
    sealed
        .save_page_with(&page("A"), "a", Expect::Missing, &vault, SaveMode::Keep)
        .unwrap();
    assert!(sealed.protect_page(&page("A"), ONE, FAST).is_err());
    assert!(read_open(&sealed, &vault, "A").body.contains('a'));
}

#[test]
fn a_page_file_with_a_hostile_own_password_body_is_refused_not_followed() {
    let (dir, notebook) = new_notebook("Notizen");
    let key = protect(&notebook, "Echt", "text", ONE);
    let real = on_disk(&notebook, "Echt").replace("\r\n", "\n");
    let mut parts = real.splitn(2, "\n\n");
    let header = parts.next().unwrap().to_owned();
    let body: String = parts.next().unwrap().lines().skip(1).collect();
    let bodies = [
        String::new(),
        "SWENC3\n".to_owned(),
        "SWENC3\n!!!!\n".to_owned(),
        format!("SWENC3\n{}\n", &body[..body.len() / 2]),
        format!("SWENC3\n{body}AAAA\n"),
        format!("SWENC3\n{}\n", "A".repeat(200_000)),
        format!("SWENC1\n{body}\n"),
        "SWENC3\nAf////8B/////////////////////////////////////////////////////////w==\n".to_owned(),
    ];
    let keys = keys_of(&[("Hostil", &key)]);
    for (position, hostile) in bodies.iter().enumerate() {
        fs::write(
            dir.path().join("Hostil.txt"),
            format!("{header}\n\n{hostile}"),
        )
        .unwrap();
        let started = Instant::now();
        let opened = notebook.read_page_with(&page("Hostil"), &keys);
        let unlocked = notebook.unlock_page(&page("Hostil"), ONE);
        assert!(started.elapsed() < Duration::from_secs(5), "{position}");
        assert!(unlocked.is_err(), "{position}");
        // A key that does not fit is a locked page; a body that is no body is an error.
        if let Ok(Some(loaded)) = opened {
            assert!(loaded.locked && loaded.body.is_empty(), "{position}");
        }
        let saved = notebook.save_page_with(
            &page("Hostil"),
            "x",
            Expect::Anything,
            &keys,
            SaveMode::Keep,
        );
        assert!(saved.is_err(), "{position}: sealed text was overwritten");
        let index = Index::build_with(&notebook, None, &keys).unwrap();
        assert!(
            index
                .page(&page("Hostil"))
                .is_some_and(|entry| entry.body.is_empty())
        );
    }
}

#[test]
fn a_sealed_notebook_does_not_accept_a_page_with_a_password_of_its_own() {
    let (dir, notebook) = new_notebook("Notizen");
    let key = protect(&notebook, "Eigen", "eigen", ONE);
    let file = fs::read_to_string(notebook.page_file(&page("Eigen"))).unwrap();
    let (_other, sealed, vault) = new_sealed_notebook("Alles", "pw");
    sealed
        .save_page_with(&page("A"), "a", Expect::Missing, &vault, SaveMode::Keep)
        .unwrap();
    let target = sealed.page_file(&page("A"));
    fs::write(&target, file).unwrap();
    let pages = keys_of(&[("A", &key)]);
    assert!(
        sealed
            .read_page_with(&page("A"), Keys::new(Some(&vault), &pages))
            .is_err()
    );
    drop(dir);
}

/// A change of the password that was cut off after the page was written: the new copies of the
/// files wait next to the old ones, and opening the page with the new password finishes it.
#[test]
fn an_interrupted_password_change_is_finished_when_the_page_is_opened() {
    let (_dir, notebook) = new_notebook("Notizen");
    let name = page("Akte");
    let one = protect(&notebook, "Akte", "Text {{./a.png}}", ONE);
    notebook
        .attach_bytes_with(&name, "a.png", b"Bild A", &*one)
        .unwrap();
    notebook
        .attach_bytes_with(&name, "b.txt", b"Text B", &*one)
        .unwrap();
    let folder = notebook.page_folder(&name);
    let old_a = fs::read(folder.join("a.png.swenc")).unwrap();
    let old_b = fs::read(folder.join("b.txt.swenc")).unwrap();

    notebook
        .change_page_password(&name, ONE, TWO, FAST)
        .unwrap();
    let new_a = fs::read(folder.join("a.png.swenc")).unwrap();
    let new_b = fs::read(folder.join("b.txt.swenc")).unwrap();
    assert_ne!(old_a, new_a);

    // The state of a crash after the page was written: one file moved, one copy still waiting.
    fs::write(folder.join("b.txt.swenc"), &old_b).unwrap();
    fs::write(folder.join(".b.txt.swenc.rekey"), &new_b).unwrap();
    assert_eq!(files_in(&folder), 3);

    // The old password no longer fits the page; the new one finishes the change.
    assert!(wrong_password(
        &notebook.unlock_page(&name, ONE).unwrap_err()
    ));
    assert!(
        folder.join(".b.txt.swenc.rekey").exists(),
        "a wrong password must not touch the copies"
    );
    let key = notebook.unlock_page(&name, TWO).unwrap();
    assert_eq!(
        files_in(&folder),
        2,
        "the waiting copy was moved into place"
    );
    assert_eq!(fs::read(folder.join("b.txt.swenc")).unwrap(), new_b);
    let keys = keys_of(&[("Akte", &key)]);
    for (file, content) in [("a.png", "Bild A"), ("b.txt", "Text B")] {
        assert_eq!(
            notebook.read_attachment(&folder.join(file), &keys).unwrap(),
            content.as_bytes()
        );
    }
}

/// A new copy that belongs to a change that never reached the page is removed, and nothing else
/// is touched: the old password still opens everything.
#[test]
fn a_stale_copy_of_a_change_that_never_took_effect_is_deleted() {
    let (_dir, notebook) = new_notebook("Notizen");
    let name = page("Akte");
    let one = protect(&notebook, "Akte", "Text", ONE);
    notebook
        .attach_bytes_with(&name, "a.png", b"Bild A", &*one)
        .unwrap();
    let folder = notebook.page_folder(&name);
    let sealed = fs::read(folder.join("a.png.swenc")).unwrap();

    // The copy of a change that stopped before the page was written: sealed with a key that the
    // page never got.
    let other = PageKey::create(TWO, FAST).unwrap();
    fs::write(
        folder.join(".a.png.swenc.rekey"),
        other.seal_file(b"Bild A").unwrap(),
    )
    .unwrap();
    // Something that is not a copy of ours is left alone, also with a similar name.
    fs::write(folder.join(".rekey"), b"x").unwrap();
    fs::write(folder.join("a.rekey"), b"y").unwrap();

    let key = notebook.unlock_page(&name, ONE).unwrap();
    assert!(
        !folder.join(".a.png.swenc.rekey").exists(),
        "the stale copy stayed"
    );
    assert!(folder.join(".rekey").exists() && folder.join("a.rekey").exists());
    assert_eq!(
        fs::read(folder.join("a.png.swenc")).unwrap(),
        sealed,
        "the file was touched"
    );
    let keys = keys_of(&[("Akte", &key)]);
    assert_eq!(
        notebook
            .read_attachment(&folder.join("a.png"), &keys)
            .unwrap(),
        b"Bild A"
    );
}
