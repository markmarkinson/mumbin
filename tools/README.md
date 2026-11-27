# Werkzeuge außerhalb des Programms

## `mumbin_decrypt.py` — der Notausstieg aus der Verschlüsselung

Falls Mumbin einmal nicht mehr zu bekommen ist (Entwickler weg, Webseite offline, Programm
läuft nicht mehr), kommt man mit **dieser einen Datei und der Passphrase** wieder an alle
verschlüsselten Seiten und Anhänge. Sie liest den Notizbuch-Ordner nur und schreibt eine
entschlüsselte Kopie in einen **neuen** Ordner; ohne Passphrase geht nichts, auch nicht für uns.

```
pip install pynacl
python mumbin_decrypt.py "C:\Notizen\MeinBuch" --out "C:\Notizen\MeinBuch-offen"
```

Das Ergebnis ist ein gewöhnliches Notizbuch (Textdateien), das Mumbin öffnet. Das gilt auch für
„versiegelte“ Notizbücher, bei denen alle Dateinamen verborgen sind: Das Skript stellt die echten
Seiten-, Ordner- und Anhangsnamen wieder her. Fehlt die Tresor-Datei (`.securewiki-vault`), nimmt es
ihre Kopie `.securewiki-vault.bak`.

- Seiten mit **eigenem Passwort** (Menü „Seite mit eigenem Passwort schützen“) braucht das Skript nicht die
  Passphrase des Notizbuchs, sondern das Passwort der jeweiligen Seite; das Notizbuch muss dafür keinen
  Tresor haben. Das Passwort steht in der Umgebungsvariable `MUMBIN_PAGE_PASSWORD` und wird bei jeder
  solchen Seite probiert; für jede Seite, die es nicht öffnet, fragt das Skript auf der Tastatur
  (Enter überspringt die Seite). `--pages-only` fragt nicht nach der Tresor-Passphrase, `--no-prompt`
  fragt nie nach einem Seitenpasswort. Seiten, deren Passwort fehlt, werden gemeldet (Exitcode 2) und
  nicht geschrieben. Die Dateien einer solchen Seite hängen an deren Passwort.
- Das Programm bietet die Datei zum Speichern an (Menü „Verschlüsselung“ → „Entschlüsselungs-Skript
  speichern“; die EXE trägt sie per `include_str!` in sich). Auf der Webseite soll sie auch zum
  Herunterladen stehen (siehe `.project/TODO.md`).
- Das Format steht im Kopf der Datei und in `.project/DECISIONS.md` (E-016, E-025), damit man es
  prüfen oder in einer anderen Sprache nachbauen kann. Jede Formatänderung braucht eine neue Version
  *und* eine Aktualisierung dieses Skripts.
- Getestet wird sie mit dem echten Programm: `crates/core/tests/python_tool.rs` verschlüsselt ein
  Notizbuch (auch ein versiegeltes) und lässt dieses Skript es öffnen; der E2E-Test `vault.e2e.mjs`
  tut es ebenfalls. Mit `MUMBIN_REQUIRE_PYTHON=1` ist ein fehlendes Python ein Fehler.
- Benötigt wird Python 3 mit dem Paket `pynacl` (libsodium: XChaCha20-Poly1305 und Argon2id). Nur bei
  einem Tresor mit mehreren Argon2-Bahnen (nicht die Voreinstellung) zusätzlich `argon2-cffi`.
- Ausgabe: Zähler der entschlüsselten und kopierten Dateien; Exitcode 1 bei Fehlern vor dem Start
  (falsche Passphrase, Ausgabeordner existiert), 2 wenn einzelne Dateien nicht entschlüsselt werden
  konnten (sie stehen dann auf der Fehlerausgabe, die übrigen sind geschrieben).
