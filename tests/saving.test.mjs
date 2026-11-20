import test from "node:test";
import assert from "node:assert/strict";
import { createSaver, createTransitionQueue } from "../renderer/js/saving.js";

function fixture(write) {
    const state = { page: "Home", stamp: "old", dirty: true, conflict: false };
    const draft = { text: "first" };
    return { state, draft, save: createSaver({state, getText: () => draft.text, write}) };
}

test("failed write rejects navigation and retains the draft", async () => {
    const { state, save } = fixture(async () => { throw {code: "io"}; });
    let navigated = false;
    await assert.rejects(async () => { await save(); navigated = true; });
    assert.equal(navigated, false);
    assert.equal(state.dirty, true);
    assert.equal(state.stamp, "old");
    assert.equal(state.saving, null);
});

test("conflict blocks subsequent save until explicit overwrite", async () => {
    let calls = 0;
    const {state, save} = fixture(async (_name, _body, _stamp, force) => {
        calls++;
        if (!force) throw {code: "conflict"};
        return {stamp: "new"};
    });
    await assert.rejects(save());
    await assert.rejects(save());
    assert.equal(calls, 1);
    assert.equal(state.conflict, true);
    await save({force: true});
    assert.equal(state.dirty, false);
    assert.equal(state.conflict, false);
});

test("edits during a write are flushed before every waiting caller continues", async () => {
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    const writes = [];
    const {state, draft, save} = fixture(async (_name, body, stamp) => {
        writes.push([body, stamp]);
        if (writes.length === 1) await blocked;
        return {stamp: `stamp${writes.length}`};
    });
    const first = save();
    await Promise.resolve();
    draft.text = "second"; state.dirty = true;
    const second = save(); const third = save();
    release();
    await Promise.all([first, second, third]);
    assert.deepEqual(writes, [["first", "old"], ["second", "stamp1"]]);
    assert.equal(state.dirty, false);
    assert.equal(state.stamp, "stamp2");
});

test("navigation is serialised and unlocks after failure", async () => {
    const events = [];
    const transition = createTransitionQueue(locked => events.push(locked));
    const first = transition(async () => { events.push("first"); throw Error("read failed"); });
    const second = transition(async () => events.push("second"));
    await assert.rejects(first);
    await second;
    assert.deepEqual(events, [true, "first", false, true, "second", false]);
});
