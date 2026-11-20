import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { publicPath } = require("../scripts/syncLive.js");
const docs = path.resolve("docs");

/** Every page of the built website, relative to docs/. */
function pages() {
    const found = ["index.html", "en/index.html", "privacy.html", "en/privacy.html"];
    for (const folder of ["blog", "en/blog"]) {
        for (const file of fs.readdirSync(path.join(docs, folder))) found.push(`${folder}/${file}`);
    }
    return found;
}

test("public snapshot excludes private history, records, profiles and secrets", () => {
    for (const file of [".project/DECISIONS.md", ".private/account.json", "STATE.md", "CLAUDE.md", "AGENTS.md", ".git/config", ".scratch/data.json", "renderer/.env", "src-tauri/key.pem", "docs/mumbin_data/settings.json"]) {
        assert.equal(publicPath(file), false, file);
    }
    for (const file of ["docs/index.html", "docs-src/copy/de.js", "src-tauri/src/lib.rs", "renderer/js/app.js", "crates/core/src/lib.rs", "Cargo.lock", "tests/site.test.mjs", "tools/mumbin_decrypt.py", "LICENSE"]) {
        assert.equal(publicPath(file), true, file);
    }
});

test("every page has working local assets, links and anchors, and only the image viewer script", () => {
    const all = pages();
    assert.ok(all.length >= 10, "the guides are missing");
    for (const page of all) {
        const file = path.join(docs, page);
        const html = fs.readFileSync(file, "utf8");
        assert.match(html, /<html lang="(?:de|en)">/, page);
        // The only script is the image viewer, loaded from the site itself.
        // Structured data (JSON-LD) is a data block, not a script: it has to be valid JSON.
        for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)) JSON.parse(json);
        const withoutData = html.replace(/<script type="application\/ld\+json">[^]*?<\/script>/g, "");
        const scripts = [...withoutData.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
        assert.ok(scripts.every((tag) => /^<script src="[./]*assets\/site\.js" defer>$/.test(tag)), `${page}: ${scripts.join()}`);
        assert.ok(!/<script[^>]*>[^<]+<\/script>/i.test(withoutData), `${page}: inline scripts are not allowed`);
        for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
            if (/^https?:/.test(url)) continue;
            const [target, anchor] = url.replace(/\?[^#]*/, "").split("#");
            let resolved = target === "" ? file : path.resolve(path.dirname(file), target);
            assert.ok(resolved.startsWith(docs), `${page}: ${url}`);
            if (target.endsWith("/")) resolved = path.join(resolved, "index.html");
            assert.ok(fs.existsSync(resolved), `${page}: ${url}`);
            if (anchor) assert.ok(fs.readFileSync(resolved, "utf8").includes(`id="${anchor}"`), `${page}: ${url}`);
        }
        for (const [, alt] of html.matchAll(/<img [^>]*alt="([^"]*)"/g)) assert.ok(alt.length > 0 || /brand/.test(html), `${page}: image without text`);
    }
    assert.deepEqual(fs.readFileSync("docs/downloads/mumbin_decrypt.py"), fs.readFileSync("tools/mumbin_decrypt.py"));
});

test("both languages offer the same sections and guides", () => {
    const de = fs.readFileSync(path.join(docs, "index.html"), "utf8");
    const en = fs.readFileSync(path.join(docs, "en/index.html"), "utf8");
    const ids = (html) => [...html.matchAll(/<section[^>]* id="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(ids(de), ids(en));
    assert.equal(fs.readdirSync(path.join(docs, "blog")).length, fs.readdirSync(path.join(docs, "en/blog")).length);
    assert.equal(fs.readdirSync(path.join(docs, "blog")).length, fs.readdirSync(path.join(docs, "en/blog")).length);
    assert.equal([...de.matchAll(/<details>/g)].length, [...en.matchAll(/<details>/g)].length);
});

test("every screenshot of the gallery exists in both languages and no unused image is left behind", () => {
    const used = new Set();
    for (const page of pages()) {
        for (const [, name] of fs.readFileSync(path.join(docs, page), "utf8").matchAll(/assets\/shots\/((?:en\/)?[\w-]+\.webp)/g)) used.add(name);
    }
    const stored = [...fs.readdirSync(path.join(docs, "assets/shots")).filter((name) => name.endsWith(".webp")), ...fs.readdirSync(path.join(docs, "assets/shots/en")).map((name) => `en/${name}`)];
    for (const name of used) assert.ok(stored.includes(name), name);
    for (const name of stored) assert.ok(used.has(name), `${name} is not used by any page`);
    const german = stored.filter((name) => !name.startsWith("en/"));
    assert.deepEqual(stored.filter((name) => name.startsWith("en/")).map((name) => name.slice(3)).sort(), german.sort(), "the two languages need the same screenshots");
});

test("search engine basics: one h1, own title and description, canonical, language alternates, structured data", () => {
    const titles = new Set();
    const descriptions = new Set();
    const sitemap = fs.readFileSync(path.join(docs, "sitemap.xml"), "utf8");
    const site = "https://markmarkinson.github.io/mumbin/";
    for (const page of pages()) {
        const html = fs.readFileSync(path.join(docs, page), "utf8");
        const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
        const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
        assert.ok(title && title.length >= 20 && title.length <= 75, `${page}: title (${title?.length})`);
        assert.ok(description && description.length >= 70 && description.length <= 175, `${page}: description (${description?.length})`);
        assert.ok(!titles.has(title), `${page}: title is not unique`);
        assert.ok(!descriptions.has(description), `${page}: description is not unique`);
        titles.add(title);
        descriptions.add(description);
        assert.equal([...html.matchAll(/<h1[ >]/g)].length, 1, `${page}: needs exactly one h1`);
        const url = page.endsWith("index.html") && page !== "index.html" && page !== "en/index.html" ? page.slice(0, -"index.html".length) : page === "index.html" ? "" : page === "en/index.html" ? "en/" : page;
        assert.ok(html.includes(`<link rel="canonical" href="${site}${url}">`), `${page}: canonical`);
        assert.ok(sitemap.includes(`<loc>${site}${url}</loc>`), `${page}: missing in the sitemap`);
        assert.match(html, /<meta property="og:image" content="https:\/\/[^"]+\.png">/, page);
        assert.ok(/hreflang="de"/.test(html) && /hreflang="en"/.test(html), `${page}: hreflang`);
        assert.ok(html.includes('type="application/ld+json"'), `${page}: structured data`);
    }
    assert.ok(!/<meta name="robots" content="noindex/.test(fs.readFileSync(path.join(docs, "index.html"), "utf8")));
    assert.ok(fs.readFileSync(path.join(docs, "404.html"), "utf8").includes('content="noindex'));
    assert.ok(fs.readFileSync(path.join(docs, "robots.txt"), "utf8").includes(`Sitemap: ${site}sitemap.xml`));
});

test("the old addresses of guides and articles lead to the new ones", () => {
    const site = "https://markmarkinson.github.io/mumbin/";
    for (const [old, now] of [["anleitungen/notizen-verschluesseln.html", "blog/notizen-verschluesseln.html"], ["en/guides/encrypt-notes.html", "en/blog/encrypt-notes.html"], ["ratgeber/anwendungsfaelle.html", "blog/anwendungsfaelle.html"], ["ratgeber/index.html", "blog/"]]) {
        const html = fs.readFileSync(path.join(docs, old), "utf8");
        assert.ok(html.includes(`<meta http-equiv="refresh" content="0;url=${site}${now}">`), old);
        assert.ok(html.includes(`<link rel="canonical" href="${site}${now}">`), old);
    }
});
