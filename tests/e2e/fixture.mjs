// Builds a throw-away notebook in the on-disk format for tests and
// screenshots. Written by hand after the format specification; no file from
// a real notebook is used.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

/** A 2x2 red PNG, enough to prove that images are shown. */
export const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP8z8DAwMDAxAAGAAkGAQOtq5cUAAAAAElFTkSuQmCC",
    "base64",
);

const pageFile = (folder, name) => path.join(folder, ...name.replaceAll(" ", "_").split(":")) + ".txt";

/** The full text of a page file: header, then `body` (a string or its lines), with the given line ending. */
export function pageText(body, eol = "\r\n") {
    const header = ["Content-Type: text/x-mumbin-page", "Page-Format: mumbin 1", "Creation-Date: 2026-11-01T09:30:00+01:00", "", ""].join(eol);
    return header + (Array.isArray(body) ? body.join(eol) : body);
}

/** Writes a page file into a notebook folder and returns what it wrote. */
export function writePage(folder, name, body, eol) {
    const file = pageFile(folder, name);
    const text = pageText(body, eol);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return text;
}

const PAGES = {
    Home: [
        "====== Home ======",
        "Willkommen im **Testnotizbuch**. Hier stehen //kursive//, __markierte__ und ~~gestrichene~~ Wörter,",
        "dazu ''wörtlicher Text'', H_{2}O und E = mc^{2}.",
        "",
        "===== Links =====",
        "* [[Projekte]] und [[Projekte:Garten|der Garten]]",
        "* [[+Unterseite]] gibt es noch nicht",
        "* https://example.org/pfad und [[https://example.org|eine Adresse]]",
        "* Stichworte: @wichtig @garten",
        "",
        "===== Aufgaben =====",
        "[ ] Offene Aufgabe !",
        "[*] Erledigte Aufgabe",
        "[x] Verworfene Aufgabe",
        "\t[ ] Unteraufgabe @garten",
        "[>] Verschobene Aufgabe",
        "",
        "TODO: Rasen mähen <2026-11-20",
        "",
        "===== Liste =====",
        "1. Erstens",
        "2. Zweitens",
        "\ta. Unterpunkt",
        "\tb. Noch einer",
        "",
        "--------------------",
        "",
        "{{./bild.png?width=120}}",
        "",
        "| Spalte A | Spalte B |",
        "|:---------|---------:|",
        "| eins     |        1 |",
        "| zwei     |        2 |",
        "",
        "'''",
        "Wörtlicher Block",
        "  mit **Sternchen**",
        "'''",
        "",
    ],
    Projekte: ["====== Projekte ======", "Übersicht über [[Projekte:Garten]] und [[Projekte:Haus]].", "Zurück nach [[Home]].", ""],
    "Projekte:Garten": [
        "====== Garten ======",
        "Der Garten braucht Pflege. @garten",
        "",
        "[ ] Tomaten gießen !!",
        "[ ] Hecke schneiden >2026-12-01",
        "",
        "Siehe auch [[Haus]] und [[:Home]].",
        "",
    ],
    "Projekte:Haus": ["====== Haus ======", "Das Haus. Verweist auf [[Garten]].", ""],
    "Archiv:2026:11:12": ["====== Donnerstag 12 Nov 2026 ======", "Gestern notiert.", ""],
    "Zweite Seite": ["====== Zweite Seite ======", "Eine Testseite mit Leerzeichen im Namen.", ""],
};

/** Creates the notebook in a temporary folder and returns that folder. */
export function createFixtureNotebook({ disableTrash = false } = {}) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "mumbin-e2e-notebook-"));
    const config = ["[Notebook]", "version=1", "name=Testnotizbuch", "home=Home", "icon=", "document_root=", "endofline=dos", `disable_trash=${disableTrash ? "True" : "False"}`, ""];
    fs.writeFileSync(path.join(folder, "notebook.mumbin"), config.join("\r\n"));
    for (const [name, lines] of Object.entries(PAGES)) writePage(folder, name, lines);
    fs.mkdirSync(path.join(folder, "Home"), { recursive: true });
    fs.writeFileSync(path.join(folder, "Home", "bild.png"), PNG);
    fs.writeFileSync(path.join(folder, "Home", "notiz.pdf"), "not really a pdf");
    return folder;
}

/** A plain grey PNG of the given size, made on the spot (a few hundred bytes however large it is). */
export function makePng(width, height) {
    const chunk = (type, data) => {
        const body = Buffer.concat([Buffer.from(type), data]);
        const head = Buffer.alloc(4);
        head.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(zlib.crc32(body));
        return Buffer.concat([head, body, crc]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.set([8, 2, 0, 0, 0], 8); // 8 bit RGB
    const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)]);
    const raw = Buffer.concat(Array.from({ length: height }, () => row));
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

/** Reads a page file as stored, including header and line endings. */
export function readPageFile(folder, name) {
    return fs.readFileSync(pageFile(folder, name), "utf8");
}

/** Whether a name inside a sealed notebook's folder is one of the few that may exist there: no real name, only tokens. */
export function isOpaqueName(name) {
    return [".securewiki-vault", ".securewiki-vault.bak", "notebook.mumbin", ".mnm"].includes(name) || /^[a-z2-7]{26}(\.txt|\.swenc)?$/.test(name);
}
