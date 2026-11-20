// Runs the end-to-end tests (tests/e2e/*.e2e.mjs) one after the other against the built exe.
// Usage: npm run test:e2e [-- name ...]   (names select tests, e.g. `tags sealed`)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const folder = path.resolve(import.meta.dirname, "..", "tests", "e2e");
const wanted = process.argv.slice(2);
const tests = fs.readdirSync(folder).filter((file) => file.endsWith(".e2e.mjs")).sort();
const selected = wanted.length ? tests.filter((file) => wanted.includes(file.replace(".e2e.mjs", ""))) : tests;
if (!selected.length) {
    console.error(`No test matches ${wanted.join(", ")}. Available: ${tests.map((file) => file.replace(".e2e.mjs", "")).join(", ")}`);
    process.exit(2);
}

const failed = selected.filter((file) => spawnSync(process.execPath, [path.join(folder, file)], { stdio: "inherit" }).status !== 0);
console.log(`\n${selected.length - failed.length} of ${selected.length} end-to-end tests passed${failed.length ? `; failed: ${failed.join(", ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
