// One factual source for the public product overview and its Markdown counterpart.
module.exports = {
 de: {
  title: 'Mumbin im Überblick: Funktionen, System und Verschlüsselung',
  description: 'Überprüfbare Produktdaten zu Mumbin: Funktionen, Windows-Systemanforderungen, Lizenz, Verschlüsselung und Originalquellen auf einen Blick.',
  lead: 'Mumbin ist eine lokale, portable Notiz-App für Windows. Sie verbindet Wiki-Notizen, Anhänge und Aufgaben mit optionaler Verschlüsselung.',
  label: 'Produktdaten', updated: 'Stand', sources: 'Originalquellen',
  facts: [
   ['Version und Anbieter', 'Version 0.1.0, entwickelt von markMarkinson. Die aktuelle offizielle Datei und ihre SHA-256-Prüfsumme stehen im GitHub-Release.'],
   ['Systemanforderungen', 'Windows 10 oder 11, 64 Bit, Microsoft Edge WebView2 Runtime und ein beschreibbarer Ordner. Portable EXE ohne Installer; Einstellungen im Ordner mumbin_data neben der EXE.'],
   ['Notizen und Wissen', 'Seitenbaum, interne Links, Rückverweise, Tags und Volltextsuche. Editor mit Live-Vorschau, Überschriften, Listen, Tabellen, Bildern und Anhängen; Seitenvorlagen, HTML-Export und Druck.'],
   ['Aufgaben', 'Aufgaben direkt in Notizen, zentrale Übersicht nach Notiz, optionaler Beginn und Frist sowie Sprung zur ursprünglichen Textstelle.'],
   ['Datenhaltung', 'Notizbücher liegen lokal in einem gewählten Ordner. Ungeschützte Seiten sind Textdateien im Mumbin-Format. Nutzung ohne Konto; keine integrierte Cloud-Anbindung oder Telemetrie.'],
   ['Verschlüsselung', 'Argon2id leitet Schlüssel aus Passwörtern ab; XChaCha20-Poly1305 verschlüsselt und authentifiziert Inhalte. Drei Schutzarten: gemeinsamer Tresor für ausgewählte Seiten, eigenes Passwort pro Seite oder versiegeltes Notizbuch. Zugehörige Anhänge werden mitgeschützt.'],
   ['Sichtbare Metadaten', 'Bei gewöhnlich geschützten Seiten bleiben Seitennamen sichtbar. Versiegelte Notizbücher verbergen Seiten- und Anhangsnamen auf der Festplatte; Notizbuchname und Teile der Struktur bleiben erkennbar.'],
   ['Zugriff und Wiederherstellung', 'Automatische Leerlaufsperre und manuelles Sperren. Das unabhängige Python-Werkzeug kann geschützte Daten mit dem richtigen Passwort entschlüsseln. Ein vergessenes Passwort lässt sich nicht zurücksetzen, um Inhalte zu entschlüsseln.'],
   ['Lizenz und Kosten', 'Mumbin Source-Available License 1.0: kostenlos für privaten und internen geschäftlichen Gebrauch. Quellcode einsehbar; Änderungen und die Weitergabe veränderter Versionen benötigen grundsätzlich eine schriftliche Erlaubnis, vorbehaltlich gesetzlicher Rechte. Maßgeblich ist der vollständige Lizenztext.'],
   ['Prüfstatus und Grenzen', 'Die EXE ist nicht mit einem Codesignatur-Zertifikat signiert. Automatisierte Tests sind öffentlich einsehbar; ein unabhängiges externes Sicherheitsaudit liegt bisher nicht vor. Verschlüsselung ersetzt weder Sicherungskopien noch den Schutz eines entsperrten oder kompromittierten Rechners.']
  ]
 },
 en: {
  title: 'Mumbin product facts: features, requirements and encryption',
  description: 'Verifiable Mumbin product facts: note-taking features, Windows requirements, source-available license, encryption and links to original sources.',
  lead: 'Mumbin is a local, portable note-taking app for Windows. It combines wiki notes, attachments and tasks with optional encryption.',
  label: 'Product facts', updated: 'Updated', sources: 'Original sources',
  facts: [
   ['Version and publisher', 'Version 0.1.0, developed by markMarkinson. The current official executable and its SHA-256 checksum are provided in the GitHub release.'],
   ['System requirements', '64-bit Windows 10 or 11, Microsoft Edge WebView2 Runtime and a writable folder. Portable executable without an installer; settings in mumbin_data beside the executable.'],
   ['Notes and knowledge', 'Page tree, internal links, backlinks, tags and full-text search. Live-preview editor, headings, lists, tables, images and attachments; page templates, HTML export and printing.'],
   ['Tasks', 'Tasks inside notes, a central overview grouped by note, optional start dates and deadlines, and navigation to the original text.'],
   ['Storage', 'Notebooks are stored locally in a chosen folder. Unprotected pages are text files in the Mumbin format. No account required; no built-in cloud integration or telemetry.'],
   ['Encryption', 'Argon2id derives keys from passwords; XChaCha20-Poly1305 encrypts and authenticates content. Three modes: a shared vault for selected pages, a separate password per page, or a sealed notebook. Associated attachments are protected too.'],
   ['Visible metadata', 'Ordinary protected pages retain visible page names. Sealed notebooks hide page and attachment names on disk; the notebook name and parts of the structure remain visible.'],
   ['Access and recovery', 'Automatic idle locking and manual locking. An independent Python tool decrypts protected data with the correct password. There is no password reset that decrypts content after a password is forgotten.'],
   ['License and price', 'Mumbin Source-Available License 1.0: free for personal and internal business use. Source code is viewable; modifications and distribution of modified versions generally require written permission, subject to statutory rights. The full license text governs.'],
   ['Review status and limits', 'The executable is not signed with a code-signing certificate. Automated tests are publicly available; there has not yet been an independent external security audit. Encryption does not replace backups or protect an unlocked or compromised computer.']
  ]
 }
};
