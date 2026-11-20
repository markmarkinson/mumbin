// Opens the fixture notebook in the real app and saves a screenshot.
// Usage: node tests/e2e/look.mjs [page name] [output.png]
// Meant for looking at the current state while developing, not as a test.

import path from "node:path";
import { scenario } from "./scenario.mjs";

const page = process.argv[2] || "";
const output = process.argv[3] || path.resolve(".scratch", "look.png");

await scenario("look", null, async (t) => {
    const app = await t.launch({ notebook: t.notebook() });
    if (page) await app.jump(page, page.split(":").pop());
    await app.sleep(600);
    console.log("title:", await app.evaluate("document.title"));
    console.log("screenshot:", await app.screenshot(output));
    if (app.consoleErrors.length) console.log(`console errors:\n${app.consoleErrors.join("\n")}`);
});
