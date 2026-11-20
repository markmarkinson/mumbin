// Waiting for things that happen in another process.

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `check` (sync or async) until it returns something truthy; throws after `timeout` ms. */
export async function waitUntil(check, { timeout = 15000, step = 100, what = "condition" } = {}) {
    const deadline = Date.now() + timeout;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            const value = await check();
            if (value) return value;
        } catch (error) {
            lastError = error;
        }
        await sleep(step);
    }
    throw new Error(`Timed out waiting for ${what}${lastError ? `: ${lastError.message}` : ""}`);
}
