// End-to-end harness: starts the real executable against a throw-away
// notebook and data folder and drives its WebView2 over the Chrome DevTools
// Protocol. Nothing here touches real settings or real notebooks.

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pageActions } from "./actions.mjs";
import { sleep, waitUntil } from "./wait.mjs";

const TARGET_DIR = process.env.CARGO_TARGET_DIR || "E:/rust-cache/target";
const DATA_DIR_PREFIX = "mumbin-e2e-data-";

/**
 * The exe under test: `MUMBIN_EXE` if set, else whichever of the release and
 * debug builds is newer. Picking a fixed one silently tests a stale build (the
 * frontend is embedded at compile time).
 */
export function executablePath() {
    if (process.env.MUMBIN_EXE) return process.env.MUMBIN_EXE;
    const candidates = ["release", "debug"]
        .map((profile) => path.join(TARGET_DIR, profile, "mumbin.exe"))
        .filter((file) => fs.existsSync(file))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (!candidates.length) throw new Error("No mumbin.exe found; run `npm run tauri:build` first.");
    return candidates[0];
}

const query = (selector) => `document.querySelector(${JSON.stringify(selector)})`;

// [virtual key code, `code`, text the key types]
const NAMED_KEYS = {
    Enter: [13, "Enter", "\r"], Tab: [9, "Tab", ""], Escape: [27, "Escape", ""], Backspace: [8, "Backspace", ""],
    Delete: [46, "Delete", ""], ArrowLeft: [37, "ArrowLeft", ""], ArrowUp: [38, "ArrowUp", ""],
    ArrowRight: [39, "ArrowRight", ""], ArrowDown: [40, "ArrowDown", ""], Home: [36, "Home", ""], End: [35, "End", ""],
    PageUp: [33, "PageUp", ""], PageDown: [34, "PageDown", ""], " ": [32, "Space", " "],
};

/**
 * Starts the app and returns a driver; always call `close()`.
 * - `notebook`: folder passed on the command line (optional).
 * - `dataDir`: program data folder to keep and reuse; by default a new one that `close()` removes.
 * - `env`: extra environment variables for the program (the E2E hooks `MUMBIN_E2E_*`).
 * - `unfoldDock`: false gives the real first start with a folded dock.
 */
export async function launch({ notebook = null, port = 9300 + Math.floor(Math.random() * 500), dataDir = null, unfoldDock = true, env = {} } = {}) {
    const exe = executablePath();
    if (!fs.existsSync(exe)) throw new Error(`Executable not found: ${exe}`);
    const dataFolder = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), DATA_DIR_PREFIX));
    const child = spawn(exe, notebook ? [notebook] : [], {
        env: {
            ...process.env,
            MUMBIN_DATA_DIR: dataFolder,
            MUMBIN_E2E: "1",
            // The dock starts folded on a first start. Most tests work with its panels, so they start
            // with it open (as a person who opened it once).
            MUMBIN_E2E_DOCK_OPEN: unfoldDock ? "1" : "0",
            WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-allow-origins=*`,
            ...env,
        },
        stdio: "ignore",
    });
    let exited = false;
    child.on("exit", () => {
        exited = true;
    });

    const target = await waitUntil(
        async () => {
            if (exited) throw new Error("application exited during start");
            const response = await fetch(`http://127.0.0.1:${port}/json/list`);
            const targets = await response.json();
            return targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
        },
        { timeout: 30000, what: "the webview debug target" },
    );

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", () => reject(new Error("could not connect to the webview")), { once: true });
    });

    let nextId = 0;
    const pending = new Map();
    const consoleErrors = [];
    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) reject(new Error(message.error.message));
            else resolve(message.result);
        } else if (message.method === "Runtime.exceptionThrown") {
            consoleErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
        } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
            consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
        } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
            consoleErrors.push(message.params.entry.text);
        }
    });
    const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
            const id = ++nextId;
            pending.set(id, { resolve, reject });
            socket.send(JSON.stringify({ id, method, params }));
        });

    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");

    /** Evaluates an expression in the page and returns its JSON value. */
    async function evaluate(expression) {
        const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        }
        return result.result.value;
    }

    let closed = false;
    const driver = {
        dataDir: dataFolder,
        port,
        consoleErrors,
        evaluate,
        sleep,
        /** A raw DevTools command (screenshots in other formats, device emulation ...). */
        send,
        waitFor: (expression, options = {}) => waitUntil(() => evaluate(expression), { what: expression, ...options }),
        /** Text content of the first element matching `selector`, or null. */
        text: (selector) => evaluate(`${query(selector)}?.textContent ?? null`),
        /** Whether an element exists and is visible. */
        visible: (selector) =>
            evaluate(`(() => { const e = ${query(selector)}; if (!e) return false; const r = e.getBoundingClientRect(); return !e.hidden && r.width > 0 && r.height > 0; })()`),
        /** Scrolls the element that the JS expression yields into view and returns its box. */
        async rectOf(elementExpression) {
            const rect = await evaluate(`(() => { const e = ${elementExpression}; if (!e) return null; e.scrollIntoView({block: "nearest"}); const r = e.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; })()`);
            if (!rect) throw new Error(`No element for ${elementExpression}`);
            return rect;
        },
        rect: (selector) => driver.rectOf(query(selector)),
        async clickAt(x, y, { button = "left", clickCount = 1, modifiers = 0 } = {}) {
            const base = { x, y, button, clickCount, modifiers };
            await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, modifiers });
            await send("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
            await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
        },
        /** Real mouse click in the middle of the element that the JS expression yields. */
        async clickElement(elementExpression, options) {
            const rect = await driver.rectOf(elementExpression);
            await driver.clickAt(rect.x + rect.w / 2, rect.y + rect.h / 2, options);
        },
        /** Real mouse click in the middle of the first element matching `selector`. */
        click: (selector, options) => driver.clickElement(query(selector), options),
        /** Back / start page by the keyboard (the buttons are gone): Alt+Left, Alt+Home. */
        back: () => driver.press("ArrowLeft", { alt: true }),
        home: () => driver.press("Home", { alt: true }),
        /** Types text as the keyboard would insert it. */
        type: (text) => send("Input.insertText", { text }),
        /** Presses one key: `key` like "Enter", "a", "F2", with modifiers {ctrl, shift, alt}. */
        async press(key, { ctrl = false, shift = false, alt = false } = {}) {
            const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (shift ? 8 : 0);
            let code;
            let keyCode;
            let text = "";
            if (NAMED_KEYS[key]) {
                [keyCode, code, text] = NAMED_KEYS[key];
            } else if (/^F\d{1,2}$/.test(key)) {
                keyCode = 111 + Number(key.slice(1));
                code = key;
            } else if (key.length === 1) {
                const upper = key.toUpperCase();
                keyCode = upper.charCodeAt(0);
                code = /[A-Z]/.test(upper) ? `Key${upper}` : /\d/.test(upper) ? `Digit${upper}` : "";
                text = ctrl || alt ? "" : key;
            } else {
                throw new Error(`Unknown key ${key}`);
            }
            const event = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers };
            await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...event, ...(text ? { text } : {}) });
            await send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
        },
        /** Saves a PNG of the window content. */
        async screenshot(file) {
            const { data } = await send("Page.captureScreenshot", { format: "png" });
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, Buffer.from(data, "base64"));
            return file;
        },
        get exited() {
            return exited;
        },
        /** Ends the app and removes its data folder unless the caller brought its own. */
        async close() {
            if (closed) return;
            closed = true;
            try {
                socket.close();
            } catch {
                /* already closed */
            }
            if (!exited) {
                try {
                    execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
                } catch {
                    /* process already gone */
                }
            }
            await sleep(300);
            if (!dataDir && path.basename(dataFolder).startsWith(DATA_DIR_PREFIX)) {
                fs.rmSync(dataFolder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
            }
        },
        /** Closes the window like a person does, so the shell writes what it remembers; then ends the app. */
        async quit() {
            await evaluate("setTimeout(() => window.__TAURI__.window.getCurrentWindow().close(), 0); 0");
            await sleep(3000);
            await driver.close();
        },
    };
    return Object.assign(driver, pageActions(driver));
}
