// Security checks against the real exe. A notebook can come from anywhere, so
// everything here is something a hostile notebook or page could try. None of
// the checks starts a program or opens a window on this machine, and the
// addresses used for "other computers" are in the TEST-NET range (RFC 5737),
// which is never routed.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pageText, writePage } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";
import { sleep } from "./wait.mjs";

const UNC = "\\\\192.0.2.1\\share\\x.png";

/** Response headers of the page, read over a second DevTools connection (reloads the page). */
async function documentHeaders(port) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
    const headers = new Promise((resolve) =>
        socket.addEventListener("message", (event) => {
            const message = JSON.parse(event.data);
            if (message.method === "Network.responseReceived" && message.params.type === "Document") resolve(message.params.response.headers);
        }),
    );
    let id = 0;
    const send = (method) => socket.send(JSON.stringify({ id: ++id, method, params: {} }));
    send("Network.enable");
    send("Page.reload");
    const result = await Promise.race([headers, sleep(15000).then(() => ({}))]);
    socket.close();
    return result;
}

await scenario("security", "no network paths, URL allow-list, safe names, text stays text, CSP, hostile and huge pages", async (t) => {
    const notebook = t.notebook();
    // A notebook file that points the document root at another computer.
    const config = path.join(notebook, "notebook.mumbin");
    fs.writeFileSync(config, fs.readFileSync(config, "utf8").replace("document_root=\r\n", "document_root=\\\\192.0.2.1\\share\r\n"));

    writePage(notebook, "Bilder", ["====== Bilder ======", `{{${UNC}}}`, "{{//192.0.2.1/share/y.png}}", "{{/z.png}}", "{{./bild.png}}", ""]);
    writePage(notebook, "Feind", ["====== Feind ======", "[[a ]".repeat(60000), "{{a ".repeat(75000), "//a:".repeat(75000), "http://a ".repeat(30000), "[ ] Aufgabe im Feind", ""]);
    writePage(notebook, "Skript", [
        "====== Skript ======",
        '<img src=x onerror="window.__pwned=1"> <script>window.__pwned=2</script>',
        "[ ] Aufgabe <img src=x onerror=\"window.__pwned=3\"> @<b>tag</b>",
        "[[https://example.org/\"onmouseover=\"window.__pwned=4|Link <i>kursiv</i>]]",
        "",
    ]);
    const huge = path.join(notebook, "Riesig.txt");
    fs.writeFileSync(huge, pageText(""));
    const chunk = Buffer.alloc(1024 * 1024, "x");
    for (let index = 0; index < 40; index += 1) fs.appendFileSync(huge, chunk);

    const app = await t.launch({ notebook });
    const openPage = (name) => app.openFromTree(name, { timeout: 20000 });

    // ── Nothing from a notebook may reach another computer ────────────────
    // Windows connects to the server, and hands over the user's credentials, as soon as
    // a path on it is merely looked at. Before the fix the first call below took 31 s.
    assert.equal((await app.invoke("picture_read", { page: "Home", src: "./bild.png" })).ok, true, "control: a local picture must still load");
    for (const src of [UNC, "//192.0.2.1/share/y.png", "\\\\?\\UNC\\192.0.2.1\\share\\z.png", "/z.png"]) {
        const result = await app.invoke("picture_read", { page: "Home", src });
        assert.equal(result.ok, false, `${src} was read`);
        assert.ok(result.ms < 1500, `${src}: ${Math.round(result.ms)} ms, the program waited for another computer`);
    }
    for (const target of [UNC, "//192.0.2.1/share/y.pdf", "\\\\?\\UNC\\192.0.2.1\\share\\z.pdf"]) {
        const result = await app.invoke("file_open", { page: "Home", target });
        assert.deepEqual(result.ok && result.value.outcome, "remote", `${target}: ${JSON.stringify(result)}`);
        assert.ok(result.ms < 1500, `${target}: ${Math.round(result.ms)} ms`);
    }
    // A page that is full of such pictures opens at once, and its pictures are just broken frames.
    const started = Date.now();
    await openPage("Bilder");
    await app.waitFor("document.querySelectorAll('.cm-content .wk-img').length >= 1", { timeout: 10000 });
    assert.ok(Date.now() - started < 5000, `opening the page took ${Date.now() - started} ms`);

    // ── Only web and mail addresses are handed to the system ──────────────
    for (const url of [
        "file:///C:/Windows/System32/calc.exe", "javascript:alert(1)", "ms-msdt:/id", "search-ms:query=x", "ftp://x/y",
        "smb://host/share", "\\\\host\\share\\x.exe", "data:text/html,x", "http://a b", "",
    ]) {
        const result = await app.invoke("url_open", { url });
        assert.equal(result.ok, false, `${url} was handed to the system`);
        assert.equal(result.code, "blocked-url", `${url}: ${JSON.stringify(result.error)}`);
    }
    // The opener plugin itself is not reachable from the page.
    const plugin = await app.invoke("plugin:opener|open_url", { url: "x-mumbin-acl-test://nothing" });
    assert.equal(plugin.ok, false);
    assert.match(String(plugin.error), /not allowed/i);

    // ── Names that name devices, hidden streams or other folders ──────────
    for (const [wanted, expected] of [["con.txt", "_con.txt"], ["NUL", "_NUL"], ["a.png.", "a.png"], ["x?y*.png", "x_y_.png"]]) {
        const stored = await app.invoke("attachment_store", { name: "Home", fileName: wanted, data: [1, 2, 3] });
        assert.equal(stored.ok && stored.value, expected, `${wanted}: ${JSON.stringify(stored)}`);
        assert.ok(fs.existsSync(path.join(notebook, "Home", expected)), `${expected} was not written as a file`);
    }
    const escaped = await app.invoke("attachment_store", { name: "Home", fileName: "..\\..\\..\\escaped.txt", data: [1] });
    assert.ok(escaped.ok && !escaped.value.includes("\\"), JSON.stringify(escaped));
    assert.ok(!fs.existsSync(path.join(notebook, "escaped.txt")) && !fs.existsSync(path.join(notebook, "..", "escaped.txt")), "a file left the page folder");

    // ── Text from a page is text, never markup or script ──────────────────
    await openPage("Skript");
    await app.waitFor("document.querySelector('.cm-content')?.textContent.includes('<script>')");
    await sleep(500);
    const dom = await app.evaluate(`({
        pwned: window.__pwned ?? null,
        injected: document.querySelectorAll('.cm-content img[onerror], .cm-content script, .cm-content [onmouseover], .cm-content b, .cm-content i').length,
        text: document.querySelector('.cm-content').textContent.includes('<img src=x onerror='),
    })`);
    assert.deepEqual(dom, { pwned: null, injected: 0, text: true }, "page text was interpreted as markup");
    await app.click("#btn-tasks");
    await app.waitFor("document.querySelectorAll('#tasks-list .task').length > 0");
    const tasks = await app.evaluate(`({
        pwned: window.__pwned ?? null,
        injected: document.querySelectorAll('#tasks-list img, #tasks-list script, #tasks-list b, #tasks-list [onerror]').length,
        text: [...document.querySelectorAll('#tasks-list .task-text')].some((e) => e.textContent.includes('<img src=x')),
    })`);
    assert.deepEqual(tasks, { pwned: null, injected: 0, text: true }, "a task was interpreted as markup");
    await app.click("#btn-tasks"); // back to the page

    // ── The page cannot run or load anything it was not shipped with ──────
    // (`eval` is not tested here: code run from DevTools is exempt from that rule. The policy
    // itself is read from the response headers at the end.)
    const csp = await app.evaluate(`(async () => {
        let fetchBlocked = false;
        try { await fetch("http://192.0.2.1/x"); } catch { fetchBlocked = true; }
        const script = document.createElement("script");
        script.textContent = "window.__inline = 1";
        document.body.append(script);
        const image = new Image();
        const imageLoaded = await new Promise((resolve) => { image.onload = () => resolve(true); image.onerror = () => resolve(false); image.src = "http://192.0.2.1/x.png"; });
        return { fetchBlocked, inlineRan: window.__inline === 1, imageLoaded };
    })()`);
    assert.deepEqual(csp, { fetchBlocked: true, inlineRan: false, imageLoaded: false }, "the content security policy has a gap");

    // ── Hostile pages stay usable ─────────────────────────────────────────
    // Before the limit on very long lines one scan of such a page took seconds, and the
    // editor scans on every key.
    const opened = Date.now();
    await openPage("Feind");
    const openMs = Date.now() - opened;
    assert.ok(openMs < 6000, `opening the hostile page took ${openMs} ms`);
    await app.toEnd({ click: false });
    const typed = Date.now();
    await app.type("abc");
    await app.waitFor("document.querySelector('#save-state')?.dataset.kind === 'dirty'", { timeout: 10000 });
    const typeMs = Date.now() - typed;
    assert.ok(typeMs < 2500, `typing on the hostile page took ${typeMs} ms`);

    // ── A page file of 40 MB is refused, and nothing else suffers ─────────
    const before = fs.statSync(huge).size;
    await app.click('.tree-row[data-page="Riesig"] .tree-label');
    assert.match(await app.waitToast(undefined, { timeout: 10000 }), /zu groß|too large/i);
    assert.equal(fs.statSync(huge).size, before, "the huge file was changed");
    await openPage("Skript"); // the program still works afterwards

    // ── The policy itself, as the page was served ─────────────────────────
    const headers = await documentHeaders(app.port);
    const header = Object.entries(headers).find(([name]) => name.toLowerCase() === "content-security-policy")?.[1];
    assert.ok(header, `no Content-Security-Policy header: ${JSON.stringify(Object.keys(headers))}`);
    const directives = Object.fromEntries(header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values];
    }));
    const bare = (values = []) => values.filter((value) => !/^'(nonce|sha\d+)-/.test(value));
    for (const name of ["default-src", "script-src", "style-src", "font-src"]) {
        assert.deepEqual(bare(directives[name]), ["'self'"], `${name} is ${JSON.stringify(directives[name])}`);
    }
    for (const forbidden of ["'unsafe-eval'", "'unsafe-inline'", "*", "data:", "blob:", "http:", "https:", "ws:", "wss:"]) {
        assert.ok(!(directives["script-src"] ?? []).includes(forbidden), `script-src allows ${forbidden}`);
    }
    assert.deepEqual(directives["object-src"], ["'none'"]);
    assert.deepEqual(directives["base-uri"], ["'none'"]);
    assert.deepEqual(directives["form-action"], ["'none'"]);
    assert.deepEqual(directives["frame-ancestors"], ["'none'"]);
    assert.deepEqual(directives["connect-src"], ["ipc:", "http://ipc.localhost"], "the page may talk to nothing but the program");
    assert.deepEqual([...directives["img-src"]].sort(), ["'self'", "blob:", "data:"]);
});
