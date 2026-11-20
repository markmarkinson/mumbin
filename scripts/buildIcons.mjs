// Draws the application icon (src-tauri/icons) from renderer/icon.svg and icon-small.svg.
// The pictures are rendered by the web view of the program itself, so they are exactly what the
// window shows. Run with the built exe: `node scripts/buildIcons.mjs`.

import fs from "node:fs";
import path from "node:path";
import { launch } from "../tests/e2e/harness.mjs";

const root = path.resolve(import.meta.dirname, "..");
const large = fs.readFileSync(path.join(root, "renderer", "icon.svg"), "utf8");
const small = fs.readFileSync(path.join(root, "renderer", "icon-small.svg"), "utf8");
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const SMALL_UP_TO = 32;

const app = await launch({});
try {
    await app.waitFor("document.body.classList.contains('ready')");
    await app.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    const png = {};
    for (const size of SIZES) {
        const svg = size <= SMALL_UP_TO ? small : large;
        await app.evaluate(`(() => {
            document.documentElement.style.background = "transparent";
            document.body.style.cssText = "margin:0;background:transparent;overflow:hidden";
            document.body.innerHTML = ${JSON.stringify(`<div id="icon" style="position:fixed;left:0;top:0;width:${size}px;height:${size}px">${svg}</div>`)};
            const element = document.querySelector("#icon svg");
            element.setAttribute("width", "${size}");
            element.setAttribute("height", "${size}");
        })()`);
        await app.sleep(150);
        const { data } = await app.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size, height: size, scale: 1 }, captureBeyondViewport: false });
        png[size] = Buffer.from(data, "base64");
    }
    const out = path.join(root, "src-tauri", "icons");
    fs.writeFileSync(path.join(out, "icon.png"), png[512]);
    // An .ico holds PNG pictures behind a small table.
    const sizes = SIZES.filter((size) => size <= 256);
    const header = Buffer.alloc(6 + 16 * sizes.length);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    sizes.forEach((size, index) => {
        const entry = 6 + 16 * index;
        header.writeUInt8(size === 256 ? 0 : size, entry);
        header.writeUInt8(size === 256 ? 0 : size, entry + 1);
        header.writeUInt16LE(1, entry + 4);
        header.writeUInt16LE(32, entry + 6);
        header.writeUInt32LE(png[size].length, entry + 8);
        header.writeUInt32LE(offset, entry + 12);
        offset += png[size].length;
    });
    fs.writeFileSync(path.join(out, "icon.ico"), Buffer.concat([header, ...sizes.map((size) => png[size])]));
    console.log(`icon.ico (${sizes.join(", ")}) and icon.png written`);
} finally {
    await app.close();
}
