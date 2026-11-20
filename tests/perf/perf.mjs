// Performance measurements with a large generated notebook, against the real exe.
// Usage: node tests/perf/perf.mjs [pages=2000] [bigPages=5]
// Prints a table; nothing is asserted (the numbers go into .project/reviews).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pageText } from "../e2e/fixture.mjs";
import { executablePath, launch } from "../e2e/harness.mjs";

const PAGES = Number(process.argv[2] || 2000);
const BIG = Number(process.argv[3] || 5);

// Deterministic pseudo random numbers, so two runs measure the same notebook.
let seed = 12345;
const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
};
const pick = (list) => list[Math.floor(random() * list.length)];
const WORDS = "Haus Garten Projekt Auto Steuer Rezept Urlaub Reise Buch Film Idee Plan Liste Termin Arzt Bank Vertrag Rechnung Kosten Budget Handy Computer Server Backup Foto Musik Sport Lauf Kochen Backen Kuchen Brot Käse Obst Gemüse Wetter Sommer Winter Familie Freunde Arbeit Meeting Notiz Entwurf Skizze Ziel Aufgabe Problem Lösung Frage Antwort".split(" ");
const TAGS = Array.from({ length: 40 }, (_, index) => `thema${index}`);

const sentence = () => Array.from({ length: 6 + Math.floor(random() * 10) }, () => pick(WORDS)).join(" ") + ".";
const paragraph = () => Array.from({ length: 2 + Math.floor(random() * 4) }, sentence).join(" ");

function pageName(index) {
    const group = Math.floor(index / 50);
    return index % 50 === 0 ? `Gruppe ${String(group).padStart(3, "0")}` : `Gruppe ${String(group).padStart(3, "0")}:Seite ${String(index).padStart(5, "0")}`;
}

function body(index, big) {
    const lines = [`====== Seite ${index} ======`, ""];
    const paragraphs = big ? 6000 : 3 + Math.floor(random() * 6);
    for (let count = 0; count < paragraphs; count += 1) {
        lines.push(paragraph(), "");
        if (count % 3 === 0) {
            const target = pageName(Math.floor(random() * PAGES));
            lines.push(`Siehe [[:${target}]] und [[${pick(WORDS)}]] sowie @${pick(TAGS)} @${pick(TAGS)}.`, "");
        }
        if (count % 4 === 1) lines.push(`[ ] ${sentence()} !`, `[*] ${sentence()}`, `TODO: ${sentence()} <2026-12-31`, "");
        if (count % 9 === 2) lines.push("| Name | Wert |", "|:-----|-----:|", `| ${pick(WORDS)} | ${Math.floor(random() * 1000)} |`, `| ${pick(WORDS)} | ${Math.floor(random() * 1000)} |`, "");
    }
    return lines.join("\r\n");
}

function makeNotebook() {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "mumbin-e2e-notebook-"));
    fs.writeFileSync(path.join(folder, "notebook.mumbin"), "[Notebook]\r\nversion=1\r\nname=Gross\r\nhome=Gruppe 000\r\nendofline=dos\r\ndisable_trash=True\r\n");
    let bytes = 0;
    const bigPages = new Set(Array.from({ length: BIG }, (_, index) => 7 + index * Math.floor(PAGES / (BIG + 1))));
    for (let index = 0; index < PAGES; index += 1) {
        const file = path.join(folder, ...pageName(index).replaceAll(" ", "_").split(":")) + ".txt";
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const text = pageText(body(index, bigPages.has(index)));
        fs.writeFileSync(file, text);
        bytes += text.length;
    }
    return { folder, bytes, bigPages: [...bigPages] };
}

const powershell = (script) => execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).trim();
function memory(startedAfter) {
    const out = powershell(`$s=[datetime]'${startedAfter}'; $p=Get-Process | Where-Object { ($_.ProcessName -eq 'mumbin' -or $_.ProcessName -eq 'msedgewebview2') -and $_.StartTime -ge $s }; ($p | Measure-Object WorkingSet64 -Sum).Sum; ($p | Where-Object ProcessName -eq 'mumbin' | Measure-Object WorkingSet64 -Sum).Sum`);
    const [total, own] = out.split(/\r?\n/).map(Number);
    return { totalMb: total / 1048576, ownMb: own / 1048576 };
}

const { folder, bytes, bigPages } = makeNotebook();
const exe = executablePath();
const rows = [];
const row = (what, value, note = "") => rows.push([what, value, note]);
row("exe", `${(fs.statSync(exe).size / 1048576).toFixed(2)} MB`, path.basename(path.dirname(exe)));
row("notebook", `${PAGES} pages, ${(bytes / 1048576).toFixed(1)} MB`, `${BIG} big pages (about ${(body(0, true).length / 1048576).toFixed(1)} MB each)`);

const startedAt = new Date(Date.now() - 1000).toISOString().replace("T", " ").slice(0, 19);
const t0 = Date.now();
const app = await launch({ notebook: folder });
try {
    await app.waitFor("document.body.classList.contains('ready')", { timeout: 120000 });
    row("window ready", `${Date.now() - t0} ms`, "launch to first screen");
    await app.waitFor("document.querySelectorAll('#tree .tree-row').length > 0", { timeout: 120000 });
    row("tree + home page shown", `${Date.now() - t0} ms`, "launch to notebook shown");
    await app.sleep(1500);

    const call = (command, args = {}) =>
        app.evaluate(`(async () => {
            const start = performance.now();
            const value = await window.__TAURI__.core.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)});
            const size = Array.isArray(value) ? value.length : (value && typeof value === "object" ? (value.hits ? value.hits.length : Object.keys(value).length) : 0);
            return { ms: performance.now() - start, size };
        })()`);
    const median = async (command, args, runs = 5) => {
        const times = [];
        for (let index = 0; index < runs; index += 1) times.push((await call(command, args)).ms);
        times.sort((a, b) => a - b);
        return times[Math.floor(times.length / 2)];
    };
    const fmt = (ms) => `${ms.toFixed(1)} ms`;

    row("page_children (root)", fmt(await median("page_children", { parent: "" })), "tree level");
    row("page_read (normal page)", fmt(await median("page_read", { name: "Gruppe 000:Seite 00001" })), "");
    const bigName = pageName(bigPages[0]);
    const bigRead = await call("page_read", { name: bigName });
    row("page_read (big page)", fmt(bigRead.ms), bigName);
    row("search 'Garten' (cached index)", fmt(await median("notebook_search", { query: "Garten" })), "");
    row("search 'Garten AND Haus'", fmt(await median("notebook_search", { query: "Garten Haus" })), "");
    row("tasks_list", fmt(await median("tasks_list")), "rebuilds the index each call");
    row("tags_list", fmt(await median("tags_list")), "");
    row("page_backlinks", fmt(await median("page_backlinks", { name: "Gruppe 001" })), "");

    // The cost of the first call after a change: the index is rebuilt.
    const afterSave = [];
    for (let index = 0; index < 3; index += 1) {
        await app.evaluate(`window.__TAURI__.core.invoke("page_save", { name: "Gruppe 000:Seite 00002", body: "Aenderung ${index}", stamp: null, force: true })`);
        afterSave.push((await call("page_backlinks", { name: "Gruppe 001" })).ms);
    }
    afterSave.sort((a, b) => a - b);
    row("first query after a save", fmt(afterSave[1]), "index rebuild (median of 3)");

    // What a person feels: opening a page by clicking, and typing.
    const open = async (name) => {
        const start = Date.now();
        await app.click(`.tree-row[data-page="${name}"] .tree-label`).catch(() => {});
        await app.waitFor(`document.querySelector('#crumbs')?.textContent.includes(${JSON.stringify(name.split(":").pop())})`, { timeout: 60000 });
        return Date.now() - start;
    };
    await app.evaluate("document.querySelector('#tree').scrollTop = 0");
    const first = (await app.evaluate("[...document.querySelectorAll('#tree .tree-row')].map((r) => r.dataset.page).slice(0, 4)"));
    row("click a page in the tree", `${await open(first[1] || first[0])} ms`, "includes backlinks + render");

    // Typing: the editor works on the whole page at every key. A normal page and a big one.
    const typing = async (name, label) => {
        const group = name.split(":")[0];
        if (!(await app.evaluate(`!!document.querySelector('.tree-row[data-page="${name}"]')`))) {
            await app.click(`.tree-row[data-page="${group}"] .tree-toggle`);
            await app.waitFor(`!!document.querySelector('.tree-row[data-page="${name}"]')`, { timeout: 30000 });
        }
        const opened = await open(name);
        await app.evaluate("document.querySelector('.cm-content').focus()");
        await app.press("Home", { ctrl: true });
        const times = [];
        for (let key = 0; key < 5; key += 1) {
            await app.evaluate("document.querySelector('#save-state').dataset.kind = ''");
            const start = performance.now();
            await app.type("x");
            await app.waitFor("document.querySelector('#save-state')?.dataset.kind === 'dirty'", { timeout: 30000, step: 5 });
            await app.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
            times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        row(`type a key (${label})`, `${times[2].toFixed(0)} ms`, `page opened in ${opened} ms, worst of 5: ${times[4].toFixed(0)} ms`);
    };
    await typing("Gruppe 000:Seite 00001", "normal page");
    await typing(bigName, "2 MB page");

    // Memory.
    row("memory after start", `${memory(startedAt).totalMb.toFixed(0)} MB`, `${memory(startedAt).ownMb.toFixed(0)} MB in mumbin.exe, rest WebView2`);
    console.log(`\n${"what".padEnd(36)}${"value".padEnd(22)}note`);
    for (const [what, value, note] of rows) console.log(`${what.padEnd(36)}${String(value).padEnd(22)}${note}`);
} finally {
    await app.close();
    // PERF_KEEP=1 keeps the generated notebook, e.g. to compare two builds on the same files.
    if (process.env.PERF_KEEP) console.log(`notebook kept in ${folder}`);
    else fs.rmSync(folder, { recursive: true, force: true });
}
