// Writes the still pictures of the mummy: renderer/icon.svg (large) and renderer/icon-small.svg (16 to 32 px).
// They come from the same drawing the program uses (renderer/js/mascotMarkup.js). Run: `node scripts/buildMark.mjs`,
// then `node scripts/buildIcons.mjs` (needs the built exe) for src-tauri/icons.

import fs from "node:fs";
import path from "node:path";
import { mascotMarkup } from "../renderer/js/mascotMarkup.js";

const root = path.resolve(import.meta.dirname, "..");
fs.writeFileSync(path.join(root, "renderer", "icon.svg"), `${mascotMarkup("icon").replace(' aria-hidden="true"', "")}\n`);
fs.writeFileSync(path.join(root, "renderer", "icon-small.svg"), `${mascotMarkup("icon-small").replace(' aria-hidden="true"', "")}\n`);
console.log("Wrote renderer/icon.svg and renderer/icon-small.svg");
