// End-to-end check that the window comes back where it was: a remembered place
// is restored, one that is no longer on any screen is not, and maximizing is
// remembered over a close.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { scenario } from "./scenario.mjs";

await scenario("window", "window place restored, unreachable place ignored, maximized remembered", async (t) => {
    const notebook = t.notebook();

    /** A fresh program data folder, with a remembered window place if given. */
    function profile(window) {
        const folder = t.tempDir();
        if (window) fs.writeFileSync(path.join(folder, "settings.json"), JSON.stringify({ window }));
        return folder;
    }
    const start = (dataDir) => t.launch({ notebook, dataDir, ready: "shell" });
    const geometry = (app) =>
        app.evaluate("({ x: Math.round(window.screenX * devicePixelRatio), y: Math.round(window.screenY * devicePixelRatio), w: Math.round(window.outerWidth * devicePixelRatio), h: Math.round(window.outerHeight * devicePixelRatio) })");
    const near = (actual, wanted, what) => assert.ok(Math.abs(actual - wanted) <= 40, `${what}: ${actual}, wanted about ${wanted}`);

    // A remembered place on the screen is used again.
    let app = await start(profile({ x: 80, y: 60, width: 1000, height: 700, maximized: false }));
    let box = await geometry(app);
    near(box.w, 1000, "width");
    near(box.h, 700, "height");
    near(box.x, 80, "left");
    near(box.y, 60, "top");
    await app.close();

    // A place on a screen that is gone is not: the window opens at its normal size.
    app = await start(profile({ x: 90000, y: 90000, width: 1000, height: 700, maximized: false }));
    box = await geometry(app);
    near(box.w, 1280, "default width");
    near(box.h, 800, "default height");
    assert.ok(box.x < 5000, "the window opened out of reach");
    await app.close();

    // Maximizing is remembered over a close.
    const folder = profile(null);
    app = await start(folder);
    await app.click("#win-max");
    await app.waitFor("window.__TAURI__.window.getCurrentWindow().isMaximized()");
    await app.quit();
    const saved = JSON.parse(fs.readFileSync(path.join(folder, "settings.json"), "utf8"));
    assert.equal(saved.window?.maximized, true, `settings.json: ${JSON.stringify(saved.window)}`);
    app = await start(folder);
    await app.waitFor("window.__TAURI__.window.getCurrentWindow().isMaximized()", { timeout: 8000 });
});
