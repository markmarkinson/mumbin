// Build the embedded app and copy exactly one executable to dist/portable.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
    return result;
}

run(process.execPath, [path.join(__dirname, "buildVendor.js")]);
run(process.execPath, [require.resolve("@tauri-apps/cli/tauri.js"), "build", "--no-bundle"]);
const metadata = run("cargo", ["metadata", "--offline", "--no-deps", "--format-version", "1"], {
    stdio: ["ignore", "pipe", "inherit"], encoding: "utf8",
});
const target = JSON.parse(metadata.stdout).target_directory;
const source = path.join(target, "release", "mumbin.exe");
const destination = path.join(root, "dist", "portable", "mumbin.exe");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log(`Portable executable: ${destination} (${fs.statSync(destination).size} bytes)`);
