// End-to-end check of the HTML export and the print view in the real exe.
// The folder dialog cannot be driven, so with the test hooks on the exe takes
// the destination from MUMBIN_E2E_EXPORT_DIR.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { writePage } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";
import { waitUntil } from "./wait.mjs";

await scenario("export", "export of notebook and branch, nothing overwritten, print view", async (t) => {
    const notebook = t.notebook();
    const out = t.tempDir();
    const profile = t.tempDir();
    // A page that tries what a hostile notebook would: markup, script addresses, a path out of the notebook.
    writePage(
        notebook,
        "Boese",
        [
            "====== <script>alert(1)</script> ======",
            "<img src=x onerror=alert(2)> [[javascript://x%0Aalert(3)|klick]] [[data://text/html,<script>|daten]]",
            "{{../../geheim.png}} [[\\\\server\\share\\datei.txt|netz]]",
            "",
        ],
        "\n",
    );
    const app = await t.launch({ notebook, dataDir: profile, env: { MUMBIN_E2E_EXPORT_DIR: out } });

    // ── The whole notebook ───────────────────────────────────────────────
    await app.command("Notizbuch als HTML");
    await app.waitToast("exportiert");
    const folders = fs.readdirSync(out);
    assert.equal(folders.length, 1, `expected one export folder, found ${folders}`);
    const root = path.join(out, folders[0]);
    for (const file of ["index.html", "Home.html", "Projekte.html"]) {
        assert.ok(fs.existsSync(path.join(root, file)), `${file} was not written`);
    }
    const home = fs.readFileSync(path.join(root, "Home.html"), "utf8");
    assert.ok(home.includes("<strong>Testnotizbuch</strong>"), "bold text is not formatted");
    assert.ok(home.includes('href="Projekte.html"'), "page link was not turned into a link");
    assert.ok(home.includes('<img src="Home/bild.png"'), "picture reference is missing");
    assert.ok(fs.existsSync(path.join(root, "Home", "bild.png")), "the picture was not copied");
    assert.ok(!/<script/i.test(home), "a script tag in an export");
    const contents = fs.readFileSync(path.join(root, "index.html"), "utf8");
    assert.ok(contents.includes('href="Home.html"') && contents.includes("Projekte/Garten.html"), "contents page does not list the pages");

    const hostile = fs.readFileSync(path.join(root, "Boese.html"), "utf8");
    const body = hostile.slice(hostile.indexOf("<main>"));
    assert.ok(!/<script|<img src=x|href="javascript|href="data:/i.test(body), `hostile markup survived: ${body}`);
    assert.ok(body.includes("&lt;script&gt;"), "the page text was not kept as text");
    assert.ok(!/href="[^"]*server/.test(body), "a network path became a link");
    assert.ok(!/src="[^"]*geheim/.test(body), "a picture outside the notebook was referenced");

    // The notebook stays as it was.
    assert.ok(!fs.existsSync(path.join(notebook, "index.html")), "something was written into the notebook");

    // A second run never replaces the first one.
    await app.command("Notizbuch als HTML");
    await app.waitToast("(2)");
    assert.equal(fs.readdirSync(out).length, 2, "the second export did not get a folder of its own");

    // ── One page with its sub-pages ──────────────────────────────────────
    await app.jump("Projekte", "Projekte", "Projekte");
    await app.command("mit Unterseiten", "Unterseiten");
    await app.waitToast("Projekte");
    const branch = fs.readdirSync(out).find((name) => name.startsWith("Projekte"));
    assert.ok(branch, "no folder for the branch export");
    assert.ok(fs.existsSync(path.join(out, branch, "Projekte.html")));
    assert.ok(!fs.existsSync(path.join(out, branch, "Home.html")), "a page outside the branch was exported");

    // ── Print view ───────────────────────────────────────────────────────
    await app.home();
    await app.waitForPage("Home");
    await app.press("p", { ctrl: true });
    // The print view lies in a private folder of its own (open-temp/<random>/), owned by this program.
    const printFile = await waitUntil(
        () => {
            const root = path.join(profile, "open-temp");
            if (!fs.existsSync(root)) return null;
            return fs.readdirSync(root).map((folder) => path.join(root, folder, "Home.html")).find((file) => fs.existsSync(file));
        },
        { timeout: 5000, what: "the print view file" },
    );
    const printed = fs.readFileSync(printFile, "utf8");
    assert.ok(printed.includes("data:image/png;base64,"), "the picture is not embedded in the print view");
    assert.ok(printed.includes("Strg+P"), "the print hint is missing");
    assert.ok(!/href="Projekte/.test(printed), "the print view links to pages that are not there");

    // ── The same things from the page menu, for people who do not use the palette ──
    const before = fs.readdirSync(out).length;
    await app.pageMenu("exportNotebook");
    await app.waitToast("(3)");
    assert.equal(fs.readdirSync(out).length, before + 1, "the menu entry did not export");
});
