// End-to-end check that one notebook is open in one window only: a second
// program started on the same notebook says so and stays on the start screen,
// and the notebook is free again once the first window is gone.

import assert from "node:assert/strict";
import { scenario } from "./scenario.mjs";

await scenario("instance", "second window refused with a message, notebook free after the first closes", async (t) => {
    const notebook = t.notebook();

    const first = await t.launch({ notebook });

    // A second window on the same notebook is refused, with words.
    const second = await t.launch({ notebook, ready: "shell" });
    await second.waitToast("anderen");
    assert.ok(await second.visible("#welcome"), "the second window should stay on the start screen");
    assert.ok(await second.evaluate("document.querySelector('#page').hidden"), "the second window shows the notebook");
    assert.ok(await first.visible("#page"), "the first window lost its notebook");

    // The first window can still write.
    await first.toEnd();
    await first.type("noch da");
    await first.waitSaved();
    await second.close();

    // Once the first window is gone, the notebook can be opened again.
    await first.close();
    await t.launch({ notebook });
});
