//! The Python tool `tools/mumbin_decrypt.py` must open what this program
//! writes: it is the owner's way back to the notes if the program is ever gone.
//! The test runs the real script. Without Python and PyNaCl it is skipped, unless
//! `MUMBIN_REQUIRE_PYTHON=1` says that a skip is a failure.

#![allow(clippy::too_many_lines)] // one scenario, read top to bottom

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use mumbin_core::Notebook;
use mumbin_core::crypto::KdfParams;

mod common;
use common::{page, page_names, save_encrypted, save_keeping};

fn script() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tools/mumbin_decrypt.py")
}

/// A Python with PyNaCl, `None` (the test is skipped) when there is none.
fn python() -> Option<String> {
    let found = ["python", "python3", "py"].into_iter().find(|candidate| {
        Command::new(candidate)
            .args(["-c", "import nacl.bindings, nacl.pwhash"])
            .output()
            .is_ok_and(|output| output.status.success())
    });
    if found.is_none() {
        assert!(
            std::env::var_os("MUMBIN_REQUIRE_PYTHON").is_none(),
            "Python with PyNaCl is required here"
        );
        eprintln!("skipped: no Python with PyNaCl (pip install pynacl)");
    }
    found.map(str::to_owned)
}

/// Runs the tool; the exit code is the caller's to check.
fn run(python: &str, notebook: &Path, out: &Path, passphrase: &str) -> std::process::Output {
    Command::new(python)
        .arg(script())
        .arg(notebook)
        .arg("--out")
        .arg(out)
        .env("MUMBIN_PASSPHRASE", passphrase)
        .output()
        .expect("python starts")
}

#[test]
fn the_python_tool_opens_what_the_program_writes() {
    let Some(python) = python() else { return };
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::create(&dir.path().join("nb"), "Tresor").unwrap();
    let params = KdfParams::MINIMUM;
    let vault = notebook.create_vault("Pässwörd 🙂 é", params).unwrap();
    let secret = "====== Geheim ======\nKonto 4711 ä ö ü 🙂\n\n[ ] Aufgabe @privat\n";
    save_encrypted(&notebook, &vault, "Geheim", secret);
    save_encrypted(
        &notebook,
        &vault,
        "Ordner:Tief",
        "tief drin\nzweite Zeile\n",
    );
    notebook
        .save_page(
            &page("Offen"),
            "oeffentlich\n",
            mumbin_core::Expect::Missing,
        )
        .unwrap();
    // An attachment sealed as a file, and an ordinary one.
    let folder = notebook.page_folder(&page("Geheim"));
    fs::create_dir_all(&folder).unwrap();
    let binary: Vec<u8> = (0..=255).cycle().take(5000).collect();
    fs::write(
        folder.join("bild.png.swenc"),
        vault.seal_file(&binary).unwrap(),
    )
    .unwrap();
    fs::write(folder.join("klar.txt.bak"), "bleibt").unwrap();

    // The right passphrase gives the plain notebook back.
    let out = dir.path().join("out");
    let result = run(&python, notebook.folder(), &out, "Pässwörd 🙂 é");
    assert!(
        result.status.success(),
        "{}{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
    let read = |name: &str| fs::read_to_string(out.join(name)).unwrap();
    let decrypted = read("Geheim.txt");
    assert!(
        decrypted.starts_with("Content-Type: text/x-mumbin-page"),
        "{decrypted}"
    );
    assert!(
        !decrypted.contains("Encrypted")
            && decrypted.contains("Konto 4711 ä ö ü 🙂")
            && decrypted.contains("[ ] Aufgabe @privat"),
        "{decrypted}"
    );
    assert!(
        read("Ordner/Tief.txt").contains("tief drin\r\nzweite Zeile"),
        "the notebook's line endings are kept"
    );
    assert!(read("Offen.txt").contains("oeffentlich"));
    assert_eq!(
        fs::read(out.join("Geheim").join("bild.png")).unwrap(),
        binary,
        "an attachment must come back byte for byte"
    );
    assert_eq!(read("Geheim/klar.txt.bak"), "bleibt");
    assert!(
        !out.join(".securewiki-vault").exists(),
        "the vault file is not copied"
    );
    // And what comes out is a notebook this program reads as plain pages.
    let plain = Notebook::open(&out).unwrap();
    let loaded = plain.read_page(&page("Geheim")).unwrap().unwrap();
    assert!(!loaded.encrypted && loaded.body.contains("Konto 4711"));

    // The source is untouched, a wrong passphrase gives nothing, and the output is never overwritten.
    assert!(
        fs::read_to_string(notebook.page_file(&page("Geheim")))
            .unwrap()
            .contains("Encrypted: swenc1")
    );
    let wrong = run(
        &python,
        notebook.folder(),
        &dir.path().join("out2"),
        "falsch",
    );
    assert_eq!(wrong.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&wrong.stderr).contains("wrong passphrase"));
    assert!(
        !dir.path().join("out2").join("Geheim.txt").exists(),
        "a wrong passphrase wrote output"
    );
    let again = run(&python, notebook.folder(), &out, "Pässwörd 🙂 é");
    assert_eq!(
        again.status.code(),
        Some(1),
        "an output folder that is not empty must be refused"
    );
    let inside = run(
        &python,
        notebook.folder(),
        &notebook.folder().join("innen"),
        "Pässwörd 🙂 é",
    );
    assert_eq!(
        inside.status.code(),
        Some(1),
        "an output folder inside the notebook must be refused"
    );

    // A damaged page is reported, the others are still written.
    let path = notebook.page_file(&page("Ordner:Tief"));
    let text = fs::read_to_string(&path).unwrap();
    let at = text.find("SWENC1").unwrap() + 12;
    let mut bytes = text.into_bytes();
    bytes[at] = if bytes[at] == b'A' { b'B' } else { b'A' };
    fs::write(&path, bytes).unwrap();
    let damaged_out = dir.path().join("out3");
    let damaged = run(&python, notebook.folder(), &damaged_out, "Pässwörd 🙂 é");
    assert_eq!(
        damaged.status.code(),
        Some(2),
        "{}",
        String::from_utf8_lossy(&damaged.stderr)
    );
    assert!(String::from_utf8_lossy(&damaged.stderr).contains("Tief.txt"));
    assert!(damaged_out.join("Geheim.txt").exists());

    // A leftover plain twin must not silently replace a recovered secret.
    fs::write(folder.join("bild.png"), b"different plain twin").unwrap();
    let twins_out = dir.path().join("twins");
    let twins = run(&python, notebook.folder(), &twins_out, "Pässwörd 🙂 é");
    assert_eq!(twins.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&twins.stderr).contains("bild.png"));
    let recovered = fs::read(twins_out.join("Geheim/bild.png")).unwrap();
    assert!(recovered == binary || recovered == b"different plain twin");
}

#[test]
fn the_python_tool_gets_a_notebook_with_hidden_file_names_back_with_every_name() {
    let Some(python) = python() else { return };
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::create(&dir.path().join("nb"), "Versiegelt").unwrap();
    let vault = notebook
        .create_sealed_vault("Pässwörd 🙂 é", KdfParams::MINIMUM)
        .unwrap();
    for (name, text) in [
        ("Steuer 2026", "====== Steuer ======\nKonto 4711 ä ö ü 🙂\n"),
        ("Projekte:Garten:Beet", "Tomaten\n"),
        ("Projekte", "Übersicht\n"),
    ] {
        save_keeping(&notebook, &vault, name, text);
    }
    notebook
        .attach_bytes_sealed(
            &page("Projekte:Garten:Beet"),
            "Skizze ä.png",
            &[1, 2, 3, 254],
            &vault,
        )
        .unwrap();
    // A page that only has attachments and sub-pages keeps its folder name.
    notebook
        .attach_bytes_sealed(&page("Nur:Anhang"), "a.txt", b"nur eine Datei", &vault)
        .unwrap();

    let out = dir.path().join("offen");
    let result = run(&python, &dir.path().join("nb"), &out, "Pässwörd 🙂 é");
    assert!(
        result.status.success(),
        "{}{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
    let text = |path: &str| fs::read_to_string(out.join(path)).unwrap();
    assert!(text("Steuer_2026.txt").contains("Konto 4711 ä ö ü 🙂"));
    assert!(!text("Steuer_2026.txt").contains("Encrypted"));
    assert!(text("Projekte.txt").contains("Übersicht"));
    assert!(text("Projekte/Garten/Beet.txt").contains("Tomaten"));
    assert_eq!(
        fs::read(out.join("Projekte/Garten/Beet/Skizze ä.png")).unwrap(),
        [1, 2, 3, 254]
    );
    assert_eq!(
        fs::read(out.join("Nur/Anhang/a.txt")).unwrap(),
        b"nur eine Datei"
    );
    assert!(out.join("notebook.mumbin").exists());

    // The decrypted copy is an ordinary notebook that this program reads.
    let plain = Notebook::open(&out).unwrap();
    let names = page_names(&plain);
    for expected in ["Steuer 2026", "Projekte", "Projekte:Garten:Beet"] {
        assert!(
            names.contains(&expected.to_owned()),
            "{expected} missing in {names:?}"
        );
    }

    // A wrong passphrase gets nothing.
    let refused = run(
        &python,
        &dir.path().join("nb"),
        &dir.path().join("nein"),
        "falsch",
    );
    assert!(!refused.status.success());
    assert!(!dir.path().join("nein").join("Steuer_2026.txt").exists());
}

/// Runs the tool for pages with a password of their own: no keyboard, one password in the environment.
fn run_pages(
    python: &str,
    notebook: &Path,
    out: &Path,
    page_password: &str,
    extra: &[&str],
) -> std::process::Output {
    let mut command = Command::new(python);
    command
        .arg(script())
        .arg(notebook)
        .arg("--out")
        .arg(out)
        .arg("--no-prompt")
        .args(extra)
        .env_remove("MUMBIN_PASSPHRASE")
        .env("MUMBIN_PAGE_PASSWORD", page_password)
        .stdin(std::process::Stdio::piped());
    command.output().expect("python starts")
}

#[test]
fn the_python_tool_opens_pages_with_a_password_of_their_own() {
    let Some(python) = python() else { return };
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::create(&dir.path().join("nb"), "Seiten").unwrap();
    let params = KdfParams::MINIMUM;
    let binary: Vec<u8> = (0..=255).rev().cycle().take(3000).collect();
    let mut keys = Vec::new();
    for (name, password, text) in [
        ("Akte", "Pässwörd Eins 🙂 é", "Konto 4711 ä ö ü 🙂\n"),
        ("Ordner:Zwei", "zweites Passwort", "zweiter Text\n"),
    ] {
        notebook
            .save_page(&page(name), text, mumbin_core::Expect::Missing)
            .unwrap();
        notebook
            .attach_bytes(&page(name), "bild.bin", &binary)
            .unwrap();
        keys.push(
            notebook
                .protect_page(&page(name), password, params)
                .unwrap()
                .key,
        );
    }
    notebook
        .save_page(
            &page("Offen"),
            "oeffentlich\n",
            mumbin_core::Expect::Missing,
        )
        .unwrap();
    let sealed = fs::read(notebook.page_folder(&page("Akte")).join("bild.bin.swenc")).unwrap();
    assert!(
        sealed.starts_with(b"SWENC3F\0"),
        "setup: the file is sealed"
    );

    // One password opens its page and the files of that page; the other page is reported, not written.
    let out = dir.path().join("eins");
    let result = run_pages(&python, notebook.folder(), &out, "Pässwörd Eins 🙂 é", &[]);
    let (stdout, stderr) = (
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr),
    );
    assert_eq!(result.status.code(), Some(2), "{stdout}{stderr}");
    let akte = fs::read_to_string(out.join("Akte.txt")).unwrap();
    assert!(
        akte.contains("Konto 4711 ä ö ü 🙂") && !akte.contains("Encrypted"),
        "{akte}"
    );
    assert_eq!(fs::read(out.join("Akte").join("bild.bin")).unwrap(), binary);
    assert!(
        fs::read_to_string(out.join("Offen.txt"))
            .unwrap()
            .contains("oeffentlich")
    );
    assert!(!out.join("Ordner").join("Zwei.txt").exists());
    assert!(
        !out.join("Ordner").join("Zwei").join("bild.bin").exists(),
        "a file of a page that was not opened was written"
    );
    assert!(stderr.contains("Zwei.txt"), "{stderr}");
    // The source is not touched.
    assert!(
        fs::read_to_string(notebook.page_file(&page("Akte")))
            .unwrap()
            .contains("Encrypted: swenc3")
    );

    // The other password opens the other page; the result is a notebook this program reads.
    let second = dir.path().join("zwei");
    let result = run_pages(&python, notebook.folder(), &second, "zweites Passwort", &[]);
    assert_eq!(
        result.status.code(),
        Some(2),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(
        fs::read_to_string(second.join("Ordner").join("Zwei.txt"))
            .unwrap()
            .contains("zweiter Text")
    );
    assert_eq!(
        fs::read(second.join("Ordner").join("Zwei").join("bild.bin")).unwrap(),
        binary
    );
    assert!(!second.join("Akte.txt").exists());
    let plain = Notebook::open(&second).unwrap();
    let loaded = plain.read_page(&page("Ordner:Zwei")).unwrap().unwrap();
    assert!(!loaded.encrypted && loaded.body.contains("zweiter Text"));

    // A wrong password opens nothing; a damaged page is reported and never taken for a wrong password.
    let nothing = dir.path().join("nichts");
    let result = run_pages(
        &python,
        notebook.folder(),
        &nothing,
        "falsch",
        &["--pages-only"],
    );
    assert_eq!(result.status.code(), Some(2));
    assert!(!nothing.join("Akte.txt").exists() && nothing.join("Offen.txt").exists());
    let path = notebook.page_file(&page("Akte"));
    let mut text = fs::read_to_string(&path).unwrap();
    let at = text.find("SWENC3").unwrap() + 40;
    let flipped = if text.as_bytes()[at] == b'A' {
        "B"
    } else {
        "A"
    };
    text.replace_range(at..=at, flipped);
    fs::write(&path, text).unwrap();
    let damaged = dir.path().join("kaputt");
    let result = run_pages(
        &python,
        notebook.folder(),
        &damaged,
        "Pässwörd Eins 🙂 é",
        &[],
    );
    assert_eq!(result.status.code(), Some(2));
    assert!(!damaged.join("Akte.txt").exists());
}

#[test]
fn the_python_tool_opens_a_vault_and_pages_with_their_own_password_together() {
    let Some(python) = python() else { return };
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::create(&dir.path().join("nb"), "Gemischt").unwrap();
    let vault = notebook
        .create_vault("Tresor Passphrase", KdfParams::MINIMUM)
        .unwrap();
    save_encrypted(&notebook, &vault, "Tresor", "im Tresor\n");
    notebook
        .save_page(
            &page("Eigen"),
            "mit eigenem Passwort\n",
            mumbin_core::Expect::Missing,
        )
        .unwrap();
    notebook
        .protect_page(&page("Eigen"), "Seitenpasswort", KdfParams::MINIMUM)
        .unwrap();

    // Both secrets: everything comes back.
    let out = dir.path().join("alles");
    let mut command = Command::new(&python);
    command
        .arg(script())
        .arg(notebook.folder())
        .arg("--out")
        .arg(&out)
        .arg("--no-prompt")
        .env("MUMBIN_PASSPHRASE", "Tresor Passphrase")
        .env("MUMBIN_PAGE_PASSWORD", "Seitenpasswort")
        .stdin(std::process::Stdio::piped());
    let result = command.output().unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(
        fs::read_to_string(out.join("Tresor.txt"))
            .unwrap()
            .contains("im Tresor")
    );
    assert!(
        fs::read_to_string(out.join("Eigen.txt"))
            .unwrap()
            .contains("mit eigenem Passwort")
    );

    // Only the page password and --pages-only: the vault page is reported, the own page is there.
    let only = dir.path().join("nur");
    let result = run_pages(
        &python,
        notebook.folder(),
        &only,
        "Seitenpasswort",
        &["--pages-only"],
    );
    assert_eq!(
        result.status.code(),
        Some(2),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(String::from_utf8_lossy(&result.stderr).contains("Tresor.txt"));
    assert!(
        fs::read_to_string(only.join("Eigen.txt"))
            .unwrap()
            .contains("mit eigenem Passwort")
    );
    assert!(!only.join("Tresor.txt").exists());
}
