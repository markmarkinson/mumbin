// The frame of an end-to-end test: owns everything the test creates (apps,
// notebooks, temporary folders), cleans it up whatever happens, saves a
// screenshot when the test fails and sets the exit code.
//
//     await scenario("tags", "tag counts, filtering", async (t) => {
//         const notebook = t.notebook();
//         const app = await t.launch({ notebook });
//         ...
//     });

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFixtureNotebook } from "./fixture.mjs";
import { launch } from "./harness.mjs";

/**
 * Runs `body(t)` and exits the process: 0 and "e2e ok: <summary>" when it finishes, 1 and the error when it throws.
 * `t.launch(options)` is `launch` plus waiting for the first screen: `ready` is "page" (default; the
 * first page is shown), "shell" (the window is up) or false.
 */
export async function scenario(name, summary, body) {
    const apps = [];
    const folders = [];
    const t = {
        /** A throw-away copy of the fixture notebook. */
        notebook(options) {
            const folder = createFixtureNotebook(options);
            folders.push(folder);
            return folder;
        },
        /** An empty temporary folder (also usable as a program data folder). */
        tempDir(prefix = "mumbin-e2e-") {
            const folder = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
            folders.push(folder);
            return folder;
        },
        async launch({ ready = "page", ...options } = {}) {
            const app = await launch(options);
            apps.push(app);
            if (ready) await app.ready({ page: ready === "page" });
            return app;
        },
    };
    let failed = false;
    try {
        await body(t);
        if (summary) console.log(`e2e ok: ${summary}`);
    } catch (error) {
        failed = true;
        console.error(error);
        const last = apps.findLast((app) => !app.exited);
        await last?.screenshot(path.resolve(".scratch", `e2e-${name}-failure.png`)).catch(() => {});
    } finally {
        for (const app of apps) await app.close().catch(() => {});
        for (const folder of folders) fs.rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    }
    process.exit(failed ? 1 : 0);
}
