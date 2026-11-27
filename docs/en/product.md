# Mumbin product facts: features, requirements and encryption

> Mumbin is a local, portable note-taking app for Windows. It combines wiki notes, attachments and tasks with optional encryption.

Updated: 2026-11-27

## Version and publisher

Version 0.1.0, developed by markMarkinson. The current official executable and its SHA-256 checksum are provided in the GitHub release.

## System requirements

64-bit Windows 10 or 11, Microsoft Edge WebView2 Runtime and a writable folder. Portable executable without an installer; settings in mumbin_data beside the executable.

## Notes and knowledge

Page tree, internal links, backlinks, tags and full-text search. Live-preview editor, headings, lists, tables, images and attachments; page templates, HTML export and printing.

## Tasks

Tasks inside notes, a central overview grouped by note, optional start dates and deadlines, and navigation to the original text.

## Storage

Notebooks are stored locally in a chosen folder. Unprotected pages are text files in the Mumbin format. No account required; no built-in cloud integration or telemetry.

## Encryption

Argon2id derives keys from passwords; XChaCha20-Poly1305 encrypts and authenticates content. Three modes: a shared vault for selected pages, a separate password per page, or a sealed notebook. Associated attachments are protected too.

## Visible metadata

Ordinary protected pages retain visible page names. Sealed notebooks hide page and attachment names on disk; the notebook name and parts of the structure remain visible.

## Access and recovery

Automatic idle locking and manual locking. An independent Python tool decrypts protected data with the correct password. There is no password reset that decrypts content after a password is forgotten.

## License and price

Mumbin Source-Available License 1.0: free for personal and internal business use. Source code is viewable; modifications and distribution of modified versions generally require written permission, subject to statutory rights. The full license text governs.

## Review status and limits

The executable is not signed with a code-signing certificate. Automated tests are publicly available; there has not yet been an independent external security audit. Encryption does not replace backups or protect an unlocked or compromised computer.

## Original sources

- [Release / SHA-256](https://github.com/markmarkinson/mumbin/releases/tag/current)
- [License](https://github.com/markmarkinson/mumbin/blob/main/LICENSE)
- [Application configuration](https://github.com/markmarkinson/mumbin/blob/main/src-tauri/tauri.conf.json)
- [Encryption implementation](https://github.com/markmarkinson/mumbin/blob/main/crates/core/src/crypto.rs)
- [Sealed notebooks](https://github.com/markmarkinson/mumbin/blob/main/crates/core/src/notebook/sealed.rs)
- [Page passwords](https://github.com/markmarkinson/mumbin/blob/main/crates/core/src/ops/own_password.rs)
- [Independent decryption tool](https://github.com/markmarkinson/mumbin/blob/main/tools/README.md)
- [Tests](https://github.com/markmarkinson/mumbin/tree/main/crates/core/tests)
