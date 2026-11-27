# Mumbin im Überblick: Funktionen, System und Verschlüsselung

> Mumbin ist eine lokale, portable Notiz-App für Windows. Sie verbindet Wiki-Notizen, Anhänge und Aufgaben mit optionaler Verschlüsselung.

Stand: 2026-11-27

## Version und Anbieter

Version 0.1.0, entwickelt von markMarkinson. Die aktuelle offizielle Datei und ihre SHA-256-Prüfsumme stehen im GitHub-Release.

## Systemanforderungen

Windows 10 oder 11, 64 Bit, Microsoft Edge WebView2 Runtime und ein beschreibbarer Ordner. Portable EXE ohne Installer; Einstellungen im Ordner mumbin_data neben der EXE.

## Notizen und Wissen

Seitenbaum, interne Links, Rückverweise, Tags und Volltextsuche. Editor mit Live-Vorschau, Überschriften, Listen, Tabellen, Bildern und Anhängen; Seitenvorlagen, HTML-Export und Druck.

## Aufgaben

Aufgaben direkt in Notizen, zentrale Übersicht nach Notiz, optionaler Beginn und Frist sowie Sprung zur ursprünglichen Textstelle.

## Datenhaltung

Notizbücher liegen lokal in einem gewählten Ordner. Ungeschützte Seiten sind Textdateien im Mumbin-Format. Nutzung ohne Konto; keine integrierte Cloud-Anbindung oder Telemetrie.

## Verschlüsselung

Argon2id leitet Schlüssel aus Passwörtern ab; XChaCha20-Poly1305 verschlüsselt und authentifiziert Inhalte. Drei Schutzarten: gemeinsamer Tresor für ausgewählte Seiten, eigenes Passwort pro Seite oder versiegeltes Notizbuch. Zugehörige Anhänge werden mitgeschützt.

## Sichtbare Metadaten

Bei gewöhnlich geschützten Seiten bleiben Seitennamen sichtbar. Versiegelte Notizbücher verbergen Seiten- und Anhangsnamen auf der Festplatte; Notizbuchname und Teile der Struktur bleiben erkennbar.

## Zugriff und Wiederherstellung

Automatische Leerlaufsperre und manuelles Sperren. Das unabhängige Python-Werkzeug kann geschützte Daten mit dem richtigen Passwort entschlüsseln. Ein vergessenes Passwort lässt sich nicht zurücksetzen, um Inhalte zu entschlüsseln.

## Lizenz und Kosten

Mumbin Source-Available License 1.0: kostenlos für privaten und internen geschäftlichen Gebrauch. Quellcode einsehbar; Änderungen und die Weitergabe veränderter Versionen benötigen grundsätzlich eine schriftliche Erlaubnis, vorbehaltlich gesetzlicher Rechte. Maßgeblich ist der vollständige Lizenztext.

## Prüfstatus und Grenzen

Die EXE ist nicht mit einem Codesignatur-Zertifikat signiert. Automatisierte Tests sind öffentlich einsehbar; ein unabhängiges externes Sicherheitsaudit liegt bisher nicht vor. Verschlüsselung ersetzt weder Sicherungskopien noch den Schutz eines entsperrten oder kompromittierten Rechners.

## Originalquellen

- [Release / SHA-256](https://github.com/markmarkinson/mumbin/releases/tag/current)
- [License](https://github.com/markmarkinson/mumbin/blob/main/LICENSE)
- [Application configuration](https://github.com/markmarkinson/mumbin/blob/main/src-tauri/tauri.conf.json)
- [Encryption implementation](https://github.com/markmarkinson/mumbin/blob/main/crates/core/src/crypto.rs)
- [Sealed notebooks](https://github.com/markmarkinson/mumbin/blob/main/crates/core/src/notebook/sealed.rs)
- [Page passwords](https://github.com/markmarkinson/mumbin/blob/main/crates/core/src/ops/own_password.rs)
- [Independent decryption tool](https://github.com/markmarkinson/mumbin/blob/main/tools/README.md)
- [Tests](https://github.com/markmarkinson/mumbin/tree/main/crates/core/tests)
