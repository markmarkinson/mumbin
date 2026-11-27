// End-to-end check of the tag view in the real exe: counts, filtering by one
// or several tags, clicking @tag in the text, and live updates after saving.

import assert from "node:assert/strict";
import { scenario } from "./scenario.mjs";

await scenario("tags", "tag counts, one and several tags, click @tag, live update", async (t) => {
    const app = await t.launch({ notebook: t.notebook() });

    const chips = () => app.texts("#tag-cloud .tag-chip");
    const hits = () => app.texts("#tag-pages .search-hit");
    const active = () => app.data("#tag-cloud .tag-chip.active", "tag");
    const chip = (tag) => app.click(`#tag-cloud .tag-chip[data-tag="${tag}"]`);

    // The tab label counts the tags even before the tab is opened.
    await app.waitFor("document.querySelector('#tags-count')?.textContent === '2'");
    await app.openDock("tags");
    await app.waitForCount("#tag-cloud .tag-chip", 2);
    assert.deepEqual(await chips(), ["@garten 2", "@wichtig 1"]);
    assert.deepEqual(await hits(), [], "no tag selected, yet pages are listed");

    // One tag, then two (pages must carry both), then back.
    await chip("garten");
    await app.waitForCount("#tag-pages .search-hit", 2);
    assert.deepEqual((await hits()).sort(), ["Home", "Projekte:Garten"]);
    await chip("wichtig");
    await app.waitForCount("#tag-pages .search-hit", 1);
    assert.deepEqual(await hits(), ["Home"]);
    assert.deepEqual((await active()).sort(), ["garten", "wichtig"]);
    await chip("garten");
    await app.waitForCount("#tag-cloud .tag-chip.active", 1);
    assert.deepEqual(await active(), ["wichtig"]);
    await app.click("#tags-clear");
    await app.waitForCount("#tag-cloud .tag-chip.active", 0);
    assert.deepEqual(await hits(), []);

    // A listed page opens.
    await chip("garten");
    await app.waitForCount("#tag-pages .search-hit", 2);
    await app.click('#tag-pages .search-hit[data-page="Projekte:Garten"]');
    await app.waitForPage("Garten");

    // Clicking @tag in the text shows that tag alone, from any tab.
    await app.home();
    await app.waitForPage("Home");
    await app.openDock("backlinks");
    await app.clickText(".cm-content .wk-tag", "@wichtig");
    await app.waitFor("document.querySelector('[data-dock=\"tags\"]').getAttribute('aria-selected') === 'true'");
    // Wait for exactly this tag: "garten" is still selected from before the click.
    await app.waitForCount('#tag-cloud .tag-chip.active[data-tag="wichtig"]', 1);
    await app.waitForCount("#tag-cloud .tag-chip.active", 1);
    assert.deepEqual(await active(), ["wichtig"]);
    await app.waitForCount("#tag-pages .search-hit", 1);
    assert.deepEqual(await hits(), ["Home"]);

    // New tags show up after saving, and vanish when the text goes away.
    await app.toEnd();
    await app.type("@neu ");
    await app.press("s", { ctrl: true });
    await app.waitFor("[...document.querySelectorAll('#tag-cloud .tag-chip')].some((e) => e.dataset.tag === 'neu')", { timeout: 8000 });
    assert.equal(await app.text("#tags-count"), "3");
    await app.press("z", { ctrl: true });
    await app.press("s", { ctrl: true });
    await app.waitFor("![...document.querySelectorAll('#tag-cloud .tag-chip')].some((e) => e.dataset.tag === 'neu')", { timeout: 8000 });

    app.expectConsoleErrors();
});
