//! Encrypted pages end to end in the core: what lies on disk, what a locked
//! notebook shows and refuses, and what the index knows (decision E-016).

use std::fs;

use mumbin_core::crypto::{CryptoError, VAULT_FILE};
use mumbin_core::notebook::SaveMode;
use mumbin_core::{Expect, Index, NotebookError, PageName, SaveOutcome};

mod common;
use common::{FAST, new_notebook, new_vault_notebook, on_disk, page, read_open, save_encrypted};

const SECRET: &str = "Mein Geheimnis: Konto 4711 @privat\n[ ] Geheime Aufgabe\n";

#[test]
fn encrypted_page_and_attachment_renames_keep_links_encrypted() {
    let (_dir, notebook, vault) = new_vault_notebook();
    let name = page("Secret");
    notebook
        .save_page(&page("Target"), "target", Expect::Missing)
        .unwrap();
    save_encrypted(&notebook, &vault, "Secret", "[[Target]] {{./old.png}}");
    notebook
        .attach_bytes_sealed(&name, "old.png", b"picture", &vault)
        .unwrap();
    // A locked rename cannot quietly break links.
    assert!(matches!(
        notebook.rename_attachment(&name, "old.png", "new.png"),
        Err(NotebookError::Locked)
    ));
    let report = notebook
        .rename_attachment_with(&name, "old.png", "new.png", Some(&vault))
        .unwrap();
    assert_eq!(report.links_updated, 1);
    let report = notebook
        .move_page_with(&page("Target"), &page("Renamed"), true, Some(&vault))
        .unwrap();
    assert_eq!(report.updated, ["Secret"]);
    let loaded = read_open(&notebook, &vault, "Secret");
    assert!(loaded.body.contains("Renamed") && loaded.body.contains("./new.png"));
    let stored = on_disk(&notebook, "Secret");
    assert!(!stored.contains("Renamed") && !stored.contains("new.png"));
    assert!(stored.contains("Encrypted: swenc1"));
}

#[test]
fn bulk_encryption_retries_attachments_on_an_already_encrypted_page() {
    let (_dir, notebook, vault) = new_vault_notebook();
    let name = page("Secret");
    save_encrypted(&notebook, &vault, "Secret", "secret");
    notebook
        .attach_bytes(&name, "unfinished.bin", b"leftover")
        .unwrap();
    let report = notebook.convert_all_pages(&vault, true).unwrap();
    assert!(report.failed.is_empty());
    assert!(!notebook.page_folder(&name).join("unfinished.bin").exists());
    assert_eq!(
        notebook
            .read_attachment(
                &notebook.page_folder(&name).join("unfinished.bin"),
                Some(&vault)
            )
            .unwrap(),
        b"leftover"
    );
}

#[test]
fn malformed_unicode_file_escapes_never_panic() {
    let (_dir, notebook) = new_notebook("Tresor");
    for target in ["file:///C:/%€", "file:///C:/%aä", "file:///C:/%🦀", "./%€"] {
        let _ = notebook.resolve_file(&page("Home"), target);
    }
}

#[test]
fn attachment_conversion_never_replaces_an_existing_twin() {
    let (_dir, notebook, vault) = new_vault_notebook();
    let name = page("Private");
    notebook
        .attach_bytes(&name, "note.bin", b"plain original")
        .unwrap();
    let sealed = notebook.page_folder(&name).join("note.bin.swenc");
    fs::write(&sealed, vault.seal_file(b"sealed original").unwrap()).unwrap();
    let original = fs::read(&sealed).unwrap();
    let (done, failed) = notebook.convert_attachments(&name, &vault, true).unwrap();
    assert_eq!(done, 0);
    assert_eq!(failed, ["note.bin"]);
    assert_eq!(fs::read(&sealed).unwrap(), original);
    assert_eq!(
        fs::read(notebook.page_folder(&name).join("note.bin")).unwrap(),
        b"plain original"
    );
    let (done, failed) = notebook.convert_attachments(&name, &vault, false).unwrap();
    assert_eq!(done, 0);
    assert_eq!(failed, ["note.bin.swenc"]);
}

#[test]
fn an_oversize_save_preserves_the_readable_original() {
    let (_dir, notebook) = new_notebook("Tresor");
    let name = page("Large");
    notebook
        .save_page(&name, "original", Expect::Missing)
        .unwrap();
    let before = fs::read(notebook.page_file(&name)).unwrap();
    let huge = "x".repeat(mumbin_core::notebook::MAX_PAGE_BYTES as usize);
    assert!(matches!(
        notebook.save_page(&name, &huge, Expect::Anything),
        Err(NotebookError::TooLarge(_))
    ));
    assert_eq!(fs::read(notebook.page_file(&name)).unwrap(), before);
}

#[test]
fn an_encrypted_page_leaves_no_plain_text_on_disk_and_stays_a_page() {
    let (dir, notebook, vault) = new_vault_notebook();
    save_encrypted(&notebook, &vault, "Privat", SECRET);

    let file = on_disk(&notebook, "Privat");
    assert!(
        file.starts_with("Content-Type: text/x-mumbin-page"),
        "the file must still be a page: {file}"
    );
    assert!(file.contains("Encrypted: swenc1") && file.contains("Creation-Date:"));
    for leaked in ["Geheimnis", "4711", "privat", "Aufgabe"] {
        assert!(!file.contains(leaked), "{leaked} is readable on disk");
    }
    // The vault file holds no passphrase and no plain key, and is not a page or an attachment.
    let vault_text = fs::read_to_string(dir.path().join(VAULT_FILE)).unwrap();
    assert!(!vault_text.contains("pw\"") && vault_text.contains("wrappedKey"));
    let names: Vec<_> = notebook
        .attachments(&PageName::root())
        .unwrap()
        .into_iter()
        .map(|a| a.name)
        .collect();
    assert!(
        !names.iter().any(|name| name.contains("vault")),
        "{names:?}"
    );
}

#[test]
fn a_locked_notebook_shows_nothing_and_refuses_every_write() {
    let (_dir, notebook, vault) = new_vault_notebook();
    save_encrypted(&notebook, &vault, "Privat", SECRET);
    let before = on_disk(&notebook, "Privat");

    let locked = notebook.read_page(&page("Privat")).unwrap().unwrap();
    assert!(locked.encrypted && locked.locked && locked.body.is_empty());
    for mode in [SaveMode::Keep, SaveMode::Encrypt, SaveMode::Decrypt] {
        let result = notebook.save_page_with(
            &page("Privat"),
            "ueberschrieben",
            Expect::Anything,
            None,
            mode,
        );
        assert!(
            matches!(result, Err(NotebookError::Locked)),
            "{mode:?}: {result:?}"
        );
    }
    assert!(
        matches!(
            notebook.save_page(&page("Privat"), "", Expect::Anything),
            Err(NotebookError::Locked)
        ),
        "even an empty text must not delete sealed text"
    );
    assert_eq!(
        on_disk(&notebook, "Privat"),
        before,
        "the sealed page was changed while locked"
    );

    let opened = read_open(&notebook, &vault, "Privat");
    assert_eq!(
        (opened.body.as_str(), opened.locked, opened.encrypted),
        (SECRET, false, true)
    );
    // Another vault cannot open it.
    let (_other_dir, other_notebook) = new_notebook("Tresor");
    let other = other_notebook.create_vault("pw", FAST).unwrap();
    assert!(matches!(
        notebook.read_page_with(&page("Privat"), Some(&other)),
        Err(NotebookError::Crypto(CryptoError::Corrupt(_)))
    ));
}

#[test]
fn saving_keeps_the_state_and_does_not_rewrite_unchanged_text() {
    let (_dir, notebook, vault) = new_vault_notebook();
    save_encrypted(&notebook, &vault, "A", "eins");
    let first = on_disk(&notebook, "A");

    let loaded = read_open(&notebook, &vault, "A");
    // Same text: not written again (a fresh nonce would change the file for nothing).
    let same = notebook
        .save_page_with(
            &page("A"),
            "eins",
            Expect::Stamp(&loaded.stamp),
            Some(&vault),
            SaveMode::Keep,
        )
        .unwrap();
    assert!(matches!(same, SaveOutcome::Unchanged(_)));
    assert_eq!(on_disk(&notebook, "A"), first);
    // Changed text stays encrypted.
    notebook
        .save_page_with(
            &page("A"),
            "zwei",
            Expect::Stamp(&loaded.stamp),
            Some(&vault),
            SaveMode::Keep,
        )
        .unwrap();
    assert!(
        on_disk(&notebook, "A").contains("Encrypted: swenc1")
            && !on_disk(&notebook, "A").contains("zwei")
    );
    // Decrypt makes it a plain page again, Encrypt the other way round.
    let loaded = read_open(&notebook, &vault, "A");
    notebook
        .save_page_with(
            &page("A"),
            &loaded.body,
            Expect::Stamp(&loaded.stamp),
            Some(&vault),
            SaveMode::Decrypt,
        )
        .unwrap();
    let plain = on_disk(&notebook, "A");
    assert!(
        plain.contains("zwei") && !plain.contains("Encrypted"),
        "{plain}"
    );
    let loaded = notebook.read_page(&page("A")).unwrap().unwrap();
    assert!(
        !loaded.encrypted
            && loaded.body
                == "zwei
"
    );
    notebook
        .save_page_with(
            &page("A"),
            "zwei",
            Expect::Anything,
            Some(&vault),
            SaveMode::Encrypt,
        )
        .unwrap();
    assert!(!on_disk(&notebook, "A").contains("zwei"));
    // An emptied encrypted page is removed like any other.
    let loaded = read_open(&notebook, &vault, "A");
    let removed = notebook
        .save_page_with(
            &page("A"),
            "  \n",
            Expect::Stamp(&loaded.stamp),
            Some(&vault),
            SaveMode::Keep,
        )
        .unwrap();
    assert_eq!(removed, SaveOutcome::Removed);
    assert!(!notebook.page_file(&page("A")).exists());
}

#[test]
fn a_notebook_that_encrypts_new_pages_never_writes_one_in_the_clear() {
    let (_dir, notebook, vault) = new_vault_notebook();
    let notebook = notebook
        .with_properties("Notebook", &[("encrypt_new_pages", "True")])
        .unwrap();
    // Locked: refused, and nothing is written.
    assert!(matches!(
        notebook.save_page(&page("Neu"), "Klartext", Expect::Missing),
        Err(NotebookError::Locked)
    ));
    assert!(!notebook.page_file(&page("Neu")).exists());
    // Open: the page is sealed without anyone asking.
    notebook
        .save_page_with(
            &page("Neu"),
            "Klartext",
            Expect::Missing,
            Some(&vault),
            SaveMode::Keep,
        )
        .unwrap();
    assert!(
        !on_disk(&notebook, "Neu").contains("Klartext")
            && on_disk(&notebook, "Neu").contains("Encrypted")
    );
}

#[test]
fn the_index_knows_encrypted_pages_only_while_the_vault_is_open() {
    let (_dir, notebook, vault) = new_vault_notebook();
    notebook
        .save_page(&page("Offen"), "oeffentlich [[Privat]]", Expect::Missing)
        .unwrap();
    save_encrypted(&notebook, &vault, "Privat", SECRET);

    let locked = Index::build(&notebook, None).unwrap();
    let entry = locked.page(&page("Privat")).unwrap();
    assert!(entry.info.has_content && entry.encrypted && entry.locked && entry.body.is_empty());
    assert!(
        locked.search("Geheimnis", 10).hits.is_empty()
            && locked.tasks().is_empty()
            && locked.search("@privat", 10).hits.is_empty()
    );
    assert_eq!(
        locked.backlinks(&page("Privat")).len(),
        1,
        "a link to a locked page still counts"
    );

    let open = Index::build_with(&notebook, Some(&locked), Some(&vault)).unwrap();
    assert!(
        !open.page(&page("Privat")).unwrap().locked,
        "the page was taken over from the locked index"
    );
    assert_eq!(open.search("Geheimnis", 10).hits.len(), 1);
    assert_eq!(open.tasks().len(), 1);
    assert_eq!(open.search("@privat", 10).hits.len(), 1);

    // Locking again: an index built from the open one must not carry the text over.
    let closed = Index::build_with(&notebook, Some(&open), None).unwrap();
    let entry = closed.page(&page("Privat")).unwrap();
    assert!(
        entry.locked && entry.body.is_empty() && closed.search("Geheimnis", 10).hits.is_empty()
    );
}

#[test]
fn the_passphrase_can_change_and_all_pages_can_be_converted() {
    let (_dir, notebook) = new_notebook("Tresor");
    let vault = notebook.create_vault("alt", FAST).unwrap();
    assert!(matches!(
        notebook.create_vault("noch eins", FAST),
        Err(NotebookError::AlreadyExists(_))
    ));
    notebook
        .save_page(&page("Eins"), "text eins", Expect::Missing)
        .unwrap();
    notebook
        .save_page(&page("Zwei:Unter"), "text zwei", Expect::Missing)
        .unwrap();

    let report = notebook.convert_all_pages(&vault, true).unwrap();
    assert_eq!((report.changed, report.failed.len()), (2, 0));
    assert!(
        !on_disk(&notebook, "Eins").contains("text eins")
            && !on_disk(&notebook, "Zwei:Unter").contains("text zwei")
    );
    assert_eq!(
        notebook.convert_all_pages(&vault, true).unwrap().changed,
        0,
        "done pages are left alone"
    );

    assert!(matches!(
        notebook.change_passphrase("falsch", "neu", FAST),
        Err(NotebookError::Crypto(CryptoError::WrongPassphrase))
    ));
    notebook.change_passphrase("alt", "neu", FAST).unwrap();
    assert!(matches!(
        notebook.unlock_vault("alt"),
        Err(NotebookError::Crypto(CryptoError::WrongPassphrase))
    ));
    let again = notebook.unlock_vault("neu").unwrap();
    assert_eq!(
        read_open(&notebook, &again, "Eins").body,
        "text eins
"
    );

    let report = notebook.convert_all_pages(&again, false).unwrap();
    assert_eq!(report.changed, 2);
    assert!(on_disk(&notebook, "Eins").contains("text eins"));
}

#[test]
fn a_notebook_without_a_vault_says_so_and_a_damaged_page_is_refused() {
    let (_dir, notebook) = new_notebook("Tresor");
    assert!(!notebook.has_vault().unwrap());
    assert!(matches!(
        notebook.unlock_vault("pw"),
        Err(NotebookError::Crypto(CryptoError::NoVault))
    ));
    let vault = notebook.create_vault("pw", FAST).unwrap();
    assert!(notebook.has_vault().unwrap());

    save_encrypted(&notebook, &vault, "Kaputt", "inhalt");
    let path = notebook.page_file(&page("Kaputt"));
    let text = fs::read_to_string(&path).unwrap();
    // Flip one character in the sealed body.
    let marker = text.find("SWENC1").unwrap() + 8;
    let mut bytes = text.into_bytes();
    bytes[marker] = if bytes[marker] == b'A' { b'B' } else { b'A' };
    fs::write(&path, bytes).unwrap();
    assert!(matches!(
        notebook.read_page_with(&page("Kaputt"), Some(&vault)),
        Err(NotebookError::Crypto(CryptoError::Corrupt(_)))
    ));
    // Saving over it with the vault open is refused too: damage is not silently replaced.
    let result = notebook.save_page_with(
        &page("Kaputt"),
        "neu",
        Expect::Anything,
        Some(&vault),
        SaveMode::Keep,
    );
    assert!(
        matches!(result, Err(NotebookError::Crypto(_))),
        "{result:?}"
    );
    // The index lists it and keeps going.
    let index = Index::build_with(&notebook, None, Some(&vault)).unwrap();
    assert!(index.page(&page("Kaputt")).is_some());
}

#[test]
fn an_encrypted_page_can_be_moved_and_still_opens() {
    let (_dir, notebook, vault) = new_vault_notebook();
    save_encrypted(&notebook, &vault, "Alt", SECRET);
    notebook
        .move_page(&page("Alt"), &page("Ordner:Neu"), true)
        .unwrap();
    assert!(
        notebook
            .read_page_with(&page("Alt"), Some(&vault))
            .unwrap()
            .is_none()
    );
    assert_eq!(read_open(&notebook, &vault, "Ordner:Neu").body, SECRET);
}

#[test]
fn files_next_to_an_encrypted_page_are_sealed_with_it_and_come_back() {
    let (_dir, notebook, vault) = new_vault_notebook();
    let name = page("Akte");
    notebook
        .save_page(&name, "Seite mit Dateien", Expect::Missing)
        .unwrap();
    let secret_bytes: Vec<u8> = (0..=255).cycle().take(3000).collect();
    notebook
        .attach_bytes(&name, "bild.png", &secret_bytes)
        .unwrap();
    notebook
        .attach_bytes(&name, "notiz.pdf", b"%PDF geheim")
        .unwrap();
    let folder = notebook.page_folder(&name);

    // Encrypting the page seals its files; nothing readable stays behind.
    notebook.set_page_encrypted(&name, &vault, true).unwrap();
    assert!(!folder.join("bild.png").exists() && folder.join("bild.png.swenc").is_file());
    for sealed in ["bild.png.swenc", "notiz.pdf.swenc"] {
        let bytes = fs::read(folder.join(sealed)).unwrap();
        assert!(bytes.starts_with(b"SWENC1F\0"));
        assert!(
            !bytes.windows(10).any(|w| w == &b"%PDF geheim"[..10]),
            "{sealed} holds the plain content"
        );
    }
    // The list shows plain names with a mark; sizes are those of the content.
    let listed = notebook.attachments(&name).unwrap();
    let names: Vec<_> = listed
        .iter()
        .map(|a| (a.name.as_str(), a.encrypted, a.is_image))
        .collect();
    assert_eq!(
        names,
        [("bild.png", true, true), ("notiz.pdf", true, false)]
    );
    assert_eq!(listed[0].size, 3000);

    // Reading by the plain path: with the vault the bytes, without it `Locked`.
    let plain = folder.join("bild.png");
    assert!(notebook.is_sealed_only(&plain));
    assert_eq!(
        notebook.read_attachment(&plain, Some(&vault)).unwrap(),
        secret_bytes
    );
    assert!(matches!(
        notebook.read_attachment(&plain, None),
        Err(NotebookError::Locked)
    ));
    assert!(
        notebook
            .read_attachment(&folder.join("fehlt.png"), Some(&vault))
            .is_err()
    );

    // A new file pasted into the open page is sealed straight away; its name cannot clash with a sealed one.
    let stored = notebook
        .attach_bytes_sealed(&name, "bild.png", b"zweites", &vault)
        .unwrap();
    assert_eq!(stored, "bild-2.png");
    assert!(!folder.join("bild-2.png").exists() && folder.join("bild-2.png.swenc").is_file());

    // Rename and delete work on the sealed file under its plain name.
    let renamed = notebook
        .rename_attachment_with(&name, "notiz.pdf", "akte.pdf", Some(&vault))
        .unwrap();
    assert_eq!(renamed.name, "akte.pdf");
    assert!(folder.join("akte.pdf.swenc").is_file() && !folder.join("notiz.pdf.swenc").exists());
    assert_eq!(
        notebook
            .read_attachment(&folder.join("akte.pdf"), Some(&vault))
            .unwrap(),
        b"%PDF geheim"
    );
    notebook.delete_attachment(&name, "akte.pdf", true).unwrap();
    assert!(!folder.join("akte.pdf.swenc").exists());

    // Decrypting the page opens the files again, byte for byte.
    notebook.set_page_encrypted(&name, &vault, false).unwrap();
    assert_eq!(fs::read(folder.join("bild.png")).unwrap(), secret_bytes);
    assert!(!folder.join("bild.png.swenc").exists());
    assert!(
        notebook
            .attachments(&name)
            .unwrap()
            .iter()
            .all(|a| !a.encrypted)
    );
}

#[test]
fn converting_the_whole_notebook_takes_the_files_along() {
    let (_dir, notebook, vault) = new_vault_notebook();
    notebook
        .save_page(&page("Eins"), "eins", Expect::Missing)
        .unwrap();
    notebook
        .attach_bytes(&page("Eins"), "a.bin", b"AAAA")
        .unwrap();
    let report = notebook.convert_all_pages(&vault, true).unwrap();
    assert_eq!((report.changed, report.failed.len()), (1, 0));
    assert!(
        notebook
            .page_folder(&page("Eins"))
            .join("a.bin.swenc")
            .is_file()
    );
    notebook.convert_all_pages(&vault, false).unwrap();
    assert_eq!(
        fs::read(notebook.page_folder(&page("Eins")).join("a.bin")).unwrap(),
        b"AAAA"
    );
}

#[test]
fn a_damaged_sealed_file_is_reported_and_never_replaced() {
    let (_dir, notebook, vault) = new_vault_notebook();
    let name = page("Akte");
    notebook.save_page(&name, "text", Expect::Missing).unwrap();
    notebook.attach_bytes(&name, "x.bin", b"inhalt").unwrap();
    notebook.set_page_encrypted(&name, &vault, true).unwrap();
    let sealed = notebook.page_folder(&name).join("x.bin.swenc");
    let mut bytes = fs::read(&sealed).unwrap();
    *bytes.last_mut().unwrap() ^= 1;
    fs::write(&sealed, &bytes).unwrap();
    assert!(
        notebook
            .read_attachment(&notebook.page_folder(&name).join("x.bin"), Some(&vault))
            .is_err()
    );
    // Decrypting the page leaves the damaged file where it is and says so.
    assert!(notebook.set_page_encrypted(&name, &vault, false).is_err());
    assert_eq!(
        fs::read(&sealed).unwrap(),
        bytes,
        "a damaged file was removed"
    );
}
