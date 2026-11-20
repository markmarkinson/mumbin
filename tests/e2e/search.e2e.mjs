// End-to-end check of the search query language through the search box:
// operators, phrases, tags, keywords and name patterns, plus a query made to
// stall a naive matcher.

import assert from "node:assert/strict";
import { scenario } from "./scenario.mjs";

await scenario("search", "operators, phrases, tags, keywords, name patterns, wildcard stall", async (t) => {
    const app = await t.launch({ notebook: t.notebook() });

    /** Runs a query in the search box and returns the names of the hits, sorted. */
    async function search(query) {
        await app.click("#search-input");
        // Closing the old results first means that visible results are the new ones.
        if (!(await app.evaluate("document.querySelector('#search-results').hidden"))) await app.press("Escape");
        await app.click("#search-input");
        await app.type(query);
        await app.press("Enter");
        await app.waitFor("!document.querySelector('#search-results').hidden");
        return (await app.texts("#search-results .search-hit strong")).sort();
    }

    const both = await search("garten haus");
    assert.ok(both.includes("Projekte:Haus") && !both.includes("Zweite Seite"), `garten haus: ${both}`);

    const without = await search("garten -hecke");
    assert.ok(without.includes("Home") && without.includes("Projekte:Haus") && !without.includes("Projekte:Garten"), `garten -hecke: ${without}`);

    assert.deepEqual(await search("Leerzeichen OR Gestern"), ["Archiv:2026:11:12", "Zweite Seite"]);
    assert.deepEqual(await search('"Gestern notiert"'), ["Archiv:2026:11:12"]);
    assert.deepEqual(await search("name: ::archiv:+"), ["Archiv:2026:11:12"]);
    assert.deepEqual(await search("name: ::projekte::"), ["Projekte"]);
    assert.deepEqual(await search("linksto: Projekte:Haus"), ["Projekte", "Projekte:Garten"]);
    const tagged = await search("@garten");
    assert.ok(tagged.includes("Home") && tagged.includes("Projekte:Garten"), `@garten: ${tagged}`);

    // A query with many wildcards on a long word must come back at once.
    const started = Date.now();
    await search("*a*a*a*a*a*a*a*a*a*a*a*a*b");
    assert.ok(Date.now() - started < 5000, "a wildcard query stalled the search");
});
