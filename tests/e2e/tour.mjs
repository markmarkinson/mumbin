// Walks through the main screens of the real app and saves a screenshot of
// each. Used for reviews (persona tests, design checks) and as the visual guard
// of refactors (compare the folder with an earlier run), not as a test.
// Usage: node tests/e2e/tour.mjs <output folder>

import fs from "node:fs";
import path from "node:path";
import { scenario } from "./scenario.mjs";

const output = path.resolve(process.argv[2] || path.join(".scratch", "tour"));
fs.mkdirSync(output, { recursive: true });

let counter = 0;
async function shot(app, name) {
    counter += 1;
    await app.sleep(350);
    const file = path.join(output, `${String(counter).padStart(2, "0")}-${name}.png`);
    await app.screenshot(file);
    console.log(path.basename(file));
}
const closeDialogs = async (app) => {
    for (let round = 0; round < 3; round += 1) {
        if (!(await app.evaluate("Boolean(document.querySelector('dialog[open]'))"))) return;
        await app.press("Escape");
        await app.sleep(150);
    }
};

await scenario("tour", null, async (t) => {
    // 1. First start: no notebook yet.
    const empty = await t.launch({ ready: "shell" });
    await shot(empty, "erster-start");
    await empty.close();

    const app = await t.launch({ notebook: t.notebook() });
    // Move the cursor off the title so the page shows the way it reads.
    await app.toEnd();
    await app.evaluate("document.querySelector('.cm-scroller').scrollTop = 0");
    await shot(app, "startseite");

    await app.evaluate("document.querySelector('.cm-scroller').scrollTop = 99999");
    await shot(app, "startseite-unten-bild-tabelle");
    await app.evaluate("document.querySelector('.cm-scroller').scrollTop = 0");

    for (const [tab, name] of [["backlinks", "dock-verweise"], ["attachments", "dock-anhaenge"], ["tags", "dock-tags"], ["outline", "dock-inhalt"]]) {
        await app.openDock(tab);
        await shot(app, name);
    }
    await app.openDock("backlinks");

    await app.press("j", { ctrl: true });
    await app.waitDialog("dlg-palette");
    await app.type("gart");
    await shot(app, "springe-zu");
    await closeDialogs(app);

    await app.openPalette();
    await shot(app, "alle-befehle");
    await closeDialogs(app);

    await app.toEnd();
    await app.press("l", { ctrl: true });
    await app.waitDialog("dlg-link");
    await app.type("Proj");
    await shot(app, "link-dialog");
    await closeDialogs(app);

    await app.press("d", { ctrl: true });
    await app.waitDialog("dlg-palette");
    await shot(app, "datum-einfuegen");
    await closeDialogs(app);

    await app.press(",", { ctrl: true });
    await app.waitDialog("dlg-settings");
    await shot(app, "einstellungen");
    await closeDialogs(app);

    await app.press("F1");
    await app.waitDialog("dlg-help");
    await shot(app, "hilfe");
    await closeDialogs(app);

    await app.press("o", { ctrl: true });
    await app.waitDialog("dlg-notebooks");
    await shot(app, "notizbuch-wechseln");
    await closeDialogs(app);

    await app.click("#search-input");
    await app.type("garten");
    await app.press("Enter");
    await app.waitFor("!document.querySelector('#search-results')?.hidden");
    await shot(app, "suche");

    await app.click("#btn-tasks");
    await app.waitFor("!document.querySelector('#tasks')?.hidden");
    await shot(app, "aufgabenliste");
    await app.click("#btn-tasks");

    await app.click('.tree-row[data-page="Projekte"] .tree-toggle');
    await app.openFromTree("Projekte");
    await app.click("#btn-page-menu");
    await shot(app, "seitenmenue");
    await app.press("Escape");

    await app.press("F2");
    await app.waitDialog("dlg-move");
    await shot(app, "umbenennen");
    await closeDialogs(app);

    await app.click("#btn-page-menu");
    await app.click('#page-menu [data-action="delete"]');
    await app.waitDialog("dlg-delete");
    await shot(app, "loeschen");
    await closeDialogs(app);

    await app.jump("Einkaufsliste");
    await shot(app, "neue-seite");

    // The language is chosen in the settings.
    await app.press(",", { ctrl: true });
    await app.waitDialog("dlg-settings");
    await app.setValue("#set-language", "en", "input");
    await closeDialogs(app);
    await app.home();
    await app.waitForPage("Home");
    await shot(app, "englisch");
    if (app.consoleErrors.length) console.log(`console errors:\n${app.consoleErrors.join("\n")}`);
});
