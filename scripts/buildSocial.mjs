// Draws the preview pictures for links (docs/assets/social.png and social-en.png, 1200x630): the mummy with its
// sign and the headline. They are rendered by the web view of the program, so the fonts are the real ones.
// Run with the built exe: `node scripts/buildSocial.mjs`.

import fs from "node:fs";
import path from "node:path";
import { launch } from "../tests/e2e/harness.mjs";
import { mascotMarkup } from "../renderer/js/mascotMarkup.js";

const root = path.resolve(import.meta.dirname, "..");
const CARDS = {
    "social.png": { title: "Alles, was dir wichtig ist.", accent: "Sicher bei dir.", line: "Dein privater Wissensspeicher – verschlüsselt, lokal, portabel." },
    "social-en.png": { title: "Everything that matters to you.", accent: "Safe with you.", line: "Your private knowledge store – encrypted, local, portable." },
};

const card = ({ title, accent, line }) => `<div id="card" style="position:fixed;left:0;top:0;width:1200px;height:630px;box-sizing:border-box;overflow:hidden;background:radial-gradient(700px 420px at 85% 10%,rgba(229,9,20,.38),transparent 70%),#0a0a0a;display:flex;align-items:center;padding:0 80px;gap:40px;font-family:'Plus Jakarta Sans','Segoe UI',sans-serif;color:#f5f5f5">
<div style="flex:1"><div style="display:inline-flex;align-items:flex-start;height:111px;margin-bottom:40px"><span style="width:111px;height:111px;display:block">${mascotMarkup("holder")}</span><span style="position:relative;margin-left:-12px;padding-left:9px;transform-origin:3px 63px;transform:rotate(-5deg)"><span style="position:absolute;left:0;top:3px;width:9px;height:108px;border-radius:4px;background:#b5a98f"></span><span style="display:block;margin-top:9px;padding:0 30px;border-radius:15px;background:#f3eee3;box-shadow:0 6px 0 #b5a98f;color:#1a0d0f;font-size:45px;font-weight:800;line-height:66px">Mumbin</span></span></div>
<div style="font-size:45px;font-weight:800;line-height:1.12;white-space:nowrap;letter-spacing:-.02em">${title}<br><span style="color:#ff4d57">${accent}</span></div>
<div style="margin-top:26px;font-size:25px;color:#b4b2ae;line-height:1.4">${line}</div></div>
<div style="width:290px;height:290px;flex:none;filter:drop-shadow(0 20px 50px rgba(229,9,20,.4))">${mascotMarkup("awake")}</div></div>`;

const app = await launch({});
try {
    await app.waitFor("document.body.classList.contains('ready')");
    await app.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
    for (const [file, text] of Object.entries(CARDS)) {
        await app.evaluate(`(() => {
            document.documentElement.style.background = "#0a0a0a";
            document.body.style.cssText = "margin:0;overflow:hidden";
            document.body.innerHTML = ${JSON.stringify(`<style>.mm *{animation:none!important}.mm .mm-lid{transform:scaleY(0)}</style>${card(text)}`)};
        })()`);
        await app.sleep(400);
        const { data } = await app.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 }, captureBeyondViewport: false });
        fs.writeFileSync(path.join(root, "docs", "assets", file), Buffer.from(data, "base64"));
    }
    console.log("Wrote docs/assets/social.png and social-en.png");
} finally {
    await app.close();
}
