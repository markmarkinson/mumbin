// Real screenshots of the release build for the website. Only synthetic, disposable notes.
// Usage: node tests/e2e/siteScreenshots.mjs        German interface, German notes -> docs/assets/shots
//        SITE_SHOT_LANG=en node tests/e2e/siteScreenshots.mjs   English -> docs/assets/shots/en
// The sample picture is made by .scratch/make_aurora.py (any 1280x560 PNG named aurora.png works).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writePage } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";

const LANG = process.env.SITE_SHOT_LANG === "en" ? "en" : "de";
const OUT = path.resolve(process.env.SITE_SHOT_DIR ?? (LANG === "en" ? "docs/assets/shots/en" : "docs/assets/shots"));
const PICTURE = path.resolve(process.env.SITE_SHOT_PICTURE ?? ".scratch/aurora.png");
const PASSPHRASE = "A sample just for screenshots 2026";

const config = (name, home) => `[Notebook]\nversion=1\nname=${name}\nhome=${home}\n`;

/** The sample notebook in both languages; the dates lie in the future of the screenshots. */
const SAMPLE = {
    de: {
        folder: "Notizbücher",
        book: "Mein Notizbuch",
        otherBooks: [["Rezepte", "Rezepte & Küche"], ["Arbeit", "Arbeit"]],
        home: "Meine Notizen",
        trip: "Projekte:Island-Reise",
        balcony: "Projekte:Balkon umbauen",
        tips: "Wissen:Polarlichter fotografieren",
        diary: "Persönliches:Reisetagebuch",
        searchWord: "Polarlichter",
        pages: (n) => ({
            [n.home]: [
                "====== Willkommen zurück ======", "",
                "Ideen sammeln. Zusammenhänge entdecken. Und Wichtiges **sicher aufbewahren**.", "",
                "===== Woran ich gerade arbeite =====", "",
                `* [[${n.trip}]] – eine Woche unter Polarlichtern`,
                `* [[${n.balcony}]] – Holz, Pflanzen, Licht`,
                `* [[${n.tips}]] – was ich gelernt habe`,
                `* [[${n.diary}]] – nur für mich`, "",
                "===== Heute =====", "",
                "[ ] Mietwagen für Island buchen <2026-11-30 !",
                "[ ] Holz für das Balkon-Hochbeet bestellen >2026-12-01",
                "[*] Reisepass prüfen", "",
            ],
            Projekte: ["====== Projekte ======", "", `* [[${n.trip}]]`, `* [[${n.balcony}]]`, ""],
            [n.trip]: [
                "====== Island-Reise im Herbst ======", "",
                "Eine Woche, ein Mietwagen und hoffentlich **Polarlichter**. @reise @projekt", "",
                "{{./aurora.png}}", "",
                "===== Die Route =====", "",
                "| Tag | Ziel | Übernachtung |",
                "|-----|------|--------------|",
                "| 1 | Reykjavík | Gästehaus am Hafen |",
                "| 2 | Golden Circle | Hütte am See |",
                "| 3 | Südküste | Hof in Vík |",
                "| 4 | Jökulsárlón | Hotel Gletscherblick |", "",
                "===== Packliste =====", "",
                "[*] Reisepass prüfen",
                "[ ] Warme Schichten einpacken !!",
                "[ ] Kamera-Akku laden >2026-12-05 <2026-12-10",
                "[ ] Mietwagen buchen <2026-11-30 @reise",
                "\t[ ] Winterreifen anfragen", "",
                `Tipps zum Fotografieren: [[${n.tips}]]. Mein Tagebuch dazu: [[${n.diary}]].`, "",
            ],
            [n.balcony]: [
                "====== Balkon umbauen ======", "",
                "Ein kleines Hochbeet und eine Lichterkette. @projekt", "",
                "[ ] Maße nehmen und skizzieren <2026-11-25",
                "[ ] Holz für das Hochbeet bestellen >2026-12-01 !",
                "[ ] Erde und Kräuter besorgen @garten",
                "[*] Vermieterin informieren", "",
            ],
            [n.tips]: [
                "====== Polarlichter fotografieren ======", "",
                "* Stativ, Weitwinkel und eine **lange Belichtung** (10 bis 20 Sekunden)",
                "* ISO zwischen 1600 und 3200, Blende ganz offen",
                "* Manuell fokussieren: ''unendlich'' und ein Stern als Hilfe", "",
                `Für die Planung der Reise siehe [[${n.trip}]]. @fotografie @reise`, "",
            ],
            "Wissen:Lerntechniken": ["====== Lerntechniken ======", "", "Kurze Wiederholungen schlagen lange Sitzungen. @lernen", ""],
            [n.diary]: ["====== Reisetagebuch ======", "", "Tag 1: Angekommen. Der Himmel war klar. Nur für mich geschrieben.", ""],
            "Persönliches:Ideen": ["====== Ideen ======", "", "Ein Buch über kleine Orte schreiben.", ""],
        }),
    },
    en: {
        folder: "Notebooks",
        book: "My Notebook",
        otherBooks: [["Recipes", "Recipes & Kitchen"], ["Work", "Work"]],
        home: "My Notes",
        trip: "Projects:Iceland-Trip",
        balcony: "Projects:Balcony Garden",
        tips: "Knowledge:Photographing the Aurora",
        diary: "Personal:Travel Diary",
        searchWord: "aurora",
        pages: (n) => ({
            [n.home]: [
                "====== Welcome back ======", "",
                "Collect ideas. Discover connections. And keep what matters **safe**.", "",
                "===== What I am working on =====", "",
                `* [[${n.trip}]] – a week under the northern lights`,
                `* [[${n.balcony}]] – wood, plants, light`,
                `* [[${n.tips}]] – what I have learned`,
                `* [[${n.diary}]] – just for me`, "",
                "===== Today =====", "",
                "[ ] Book the rental car for Iceland <2026-11-30 !",
                "[ ] Order wood for the balcony planter >2026-12-01",
                "[*] Check the passport", "",
            ],
            Projects: ["====== Projects ======", "", `* [[${n.trip}]]`, `* [[${n.balcony}]]`, ""],
            [n.trip]: [
                "====== Iceland Trip in Autumn ======", "",
                "A week, a rental car and hopefully the **northern lights**. @travel @project", "",
                "{{./aurora.png}}", "",
                "===== The route =====", "",
                "| Day | Destination | Stay |",
                "|-----|-------------|------|",
                "| 1 | Reykjavík | Harbour guesthouse |",
                "| 2 | Golden Circle | Lakeside cabin |",
                "| 3 | South coast | Farm in Vík |",
                "| 4 | Jökulsárlón | Glacier view hotel |", "",
                "===== Packing list =====", "",
                "[*] Check the passport",
                "[ ] Pack warm layers !!",
                "[ ] Charge the camera battery >2026-12-05 <2026-12-10",
                "[ ] Book the rental car <2026-11-30 @travel",
                "\t[ ] Ask about winter tyres", "",
                `Photo tips: [[${n.tips}]]. My diary for it: [[${n.diary}]].`, "",
            ],
            [n.balcony]: [
                "====== Balcony Garden ======", "",
                "A small raised bed and string lights. @project", "",
                "[ ] Measure and sketch <2026-11-25",
                "[ ] Order wood for the raised bed >2026-12-01 !",
                "[ ] Get soil and herbs @garden",
                "[*] Tell the landlady", "",
            ],
            [n.tips]: [
                "====== Photographing the Aurora ======", "",
                "* Tripod, wide-angle lens and a **long exposure** (10 to 20 seconds)",
                "* ISO between 1600 and 3200, aperture wide open",
                "* Focus manually: ''infinity'' and a star as a guide", "",
                `For planning the trip see [[${n.trip}]]. @photography @travel`, "",
            ],
            "Knowledge:Study Techniques": ["====== Study Techniques ======", "", "Short reviews beat long sessions. @learning", ""],
            [n.diary]: ["====== Travel Diary ======", "", "Day 1: Arrived. The sky was clear. Written just for me.", ""],
            "Personal:Ideas": ["====== Ideas ======", "", "Write a book about small places.", ""],
        }),
    },
}[LANG];

function writeSampleNotebook(folder) {
    fs.writeFileSync(path.join(folder, "notebook.mumbin"), config(SAMPLE.book, SAMPLE.home));
    for (const [name, lines] of Object.entries(SAMPLE.pages(SAMPLE))) writePage(folder, name, lines);
    const pictures = path.join(folder, ...SAMPLE.trip.split(":"));
    fs.mkdirSync(pictures, { recursive: true });
    fs.copyFileSync(PICTURE, path.join(pictures, "aurora.png"));
}

await scenario("site-screenshots", "real application screenshots with sample notes", async (t) => {
    fs.mkdirSync(OUT, { recursive: true });
    const profile = t.tempDir("mumbin-e2e-site-profile-");
    // Short, readable folder names: the notebook list shows them.
    const books = path.join(os.tmpdir(), SAMPLE.folder);
    fs.rmSync(books, { recursive: true, force: true });
    // Two more notebooks, so that the notebook list has something to show.
    for (const [folderName, name] of SAMPLE.otherBooks) {
        const folder = path.join(books, folderName);
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, "notebook.mumbin"), config(name, "Start"));
        writePage(folder, "Start", [`====== ${name} ======`, ""]);
        const first = await t.launch({ notebook: folder, dataDir: profile });
        await first.ready();
        await first.close();
    }
    const notebook = path.join(books, SAMPLE.book);
    fs.mkdirSync(notebook, { recursive: true });
    writeSampleNotebook(notebook);
    const app = await t.launch({ notebook, dataDir: profile, unfoldDock: true });
    await app.ready();
    await app.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: false });

    const setLanguage = async (language) => {
        await app.press(",", { ctrl: true });
        await app.waitDialog("dlg-settings");
        await app.setValue("#set-language", language, "input");
        await app.sleep(300);
        await closeDialogs();
    };
    const shot = async (name) => {
        await app.sleep(350);
        const { data } = await app.send("Page.captureScreenshot", { format: "webp", quality: 90 });
        fs.writeFileSync(path.join(OUT, `${name}.webp`), Buffer.from(data, "base64"));
        console.log(`  ${name}.webp`);
    };
    const open = async (name) => {
        const parts = name.split(":");
        for (let i = 1; i < parts.length; i += 1) {
            const child = `.tree-row[data-page="${parts.slice(0, i + 1).join(":")}"]`;
            if (!(await app.evaluate(`Boolean(document.querySelector('${child}'))`))) {
                await app.click(`.tree-row[data-page="${parts.slice(0, i).join(":")}"] .tree-toggle`);
                await app.waitFor(`Boolean(document.querySelector('${child}'))`);
            }
        }
        await app.openFromTree(name);
        // The cursor goes to the end, so that the headline is shown without its markup.
        if (await app.visible(".cm-editor")) {
            await app.toEnd({ click: false });
            await app.evaluate("document.querySelector('.cm-scroller').scrollTop = 0");
        }
    };
    /** Shows a tab of the dock: a click on the tab that is open would fold the dock. */
    const dockTab = async (tab) => {
        const folded = await app.evaluate("document.getElementById('dock').classList.contains('folded')");
        const active = await app.evaluate(`document.querySelector('[data-dock="${tab}"]').classList.contains('active')`);
        if (folded || !active) await app.openDock(tab);
    };
    const toastGone = () => app.waitFor("document.querySelector('#toast')?.hidden === true", { timeout: 10000 });
    const closeDialogs = async () => {
        for (let round = 0; round < 3; round += 1) {
            if (!(await app.evaluate("Boolean(document.querySelector('dialog[open]'))"))) return;
            await app.press("Escape");
            await app.sleep(150);
        }
    };

    if (LANG === "en") await setLanguage("en");

    // 1. The page that shows what the program is: text, a picture, a table, tasks, links, tags.
    await open(SAMPLE.trip);
    await dockTab("backlinks");
    await shot("overview");

    // 2. Writing: formatting while you type (the lower part of the page).
    await app.evaluate("document.querySelector('.cm-scroller').scrollTop = 520");
    await shot("write");
    await app.evaluate("document.querySelector('.cm-scroller').scrollTop = 0");

    // 3. Links: the pages that link here, and the tag cloud.
    await open(SAMPLE.tips);
    await dockTab("backlinks");
    await shot("links");
    await dockTab("tags");
    await shot("tags");

    // 4. Search.
    await app.click("#search-input");
    await app.type(SAMPLE.searchWord);
    await app.press("Enter");
    await app.waitFor("document.querySelectorAll('#search-results .search-hit').length > 0");
    await shot("search");
    await app.press("Escape");

    // 5. Tasks: by note, with start and deadline.
    await app.click("#btn-tasks");
    await app.waitFor("document.querySelectorAll('#tasks-list .task').length > 0");
    await shot("tasks");
    // 6. The date picker of a task.
    await app.evaluate("document.querySelector('#tasks-list .task .task-dates').click()");
    await app.waitDialog("dlg-task-dates");
    await app.setValue("#task-start", "2026-12-05");
    await app.setValue("#task-due", "2026-12-10");
    await shot("taskdates");
    await closeDialogs();
    await app.click("#btn-tasks");

    // 7. Protection: the page menu, the own password, the locked page.
    await open(SAMPLE.diary);
    await app.click("#btn-page-menu");
    await app.waitFor("!document.querySelector('#page-menu')?.hidden");
    await shot("protect-menu");
    await app.click('#page-menu [data-action="protectPage"]');
    await app.waitDialog("dlg-vault");
    await app.sleep(200);
    await app.type(PASSPHRASE);
    await app.press("Tab");
    await app.type(PASSPHRASE);
    await shot("password");
    await app.click("#vault-confirm");
    await app.waitDialogClosed("dlg-vault");
    await app.pageMenu("lockPage");
    await app.waitFor("document.getElementById('locked-panel').hidden === false");
    await toastGone();
    await shot("locked");

    // 8. The context menu in the text.
    await open(SAMPLE.balcony);
    await app.click(".cm-content", { button: "right" });
    await app.waitFor("!document.getElementById('edit-menu').hidden");
    await shot("contextmenu");
    await app.press("Escape");

    // 9. Settings of the notebook.
    await app.press(",", { ctrl: true });
    await app.waitDialog("dlg-settings");
    await shot("settings");
    await closeDialogs();

    // 10. The same screen in the other language.
    await setLanguage(LANG === "de" ? "en" : "de");
    await open(SAMPLE.trip);
    await app.evaluate("document.querySelector('.cm-scroller').scrollTop = 0");
    await shot("language");
    await setLanguage(LANG);

    // 11. Notebooks.
    await app.press("o", { ctrl: true });
    await app.waitDialog("dlg-notebooks");
    await shot("notebooks");
    await closeDialogs();
});
