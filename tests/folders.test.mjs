import assert from "node:assert/strict";
import { test } from "node:test";

import { folderName, plainFolder, sameFolder, shortPath } from "../renderer/js/folders.js";

test("plainFolder drops the long-path prefix", () => {
    assert.equal(plainFolder("\\\\?\\C:\\Notes"), "C:\\Notes");
    assert.equal(plainFolder("C:\\Notes"), "C:\\Notes");
    assert.equal(plainFolder(null), "");
});

test("sameFolder ignores prefix, case and trailing separators", () => {
    assert.equal(sameFolder("\\\\?\\C:\\Notes\\", "c:\\notes"), true);
    assert.equal(sameFolder("C:/Notes", "C:/Notes/"), true);
    assert.equal(sameFolder("C:\\Notes", "C:\\Other"), false);
});

test("folderName is the last folder", () => {
    assert.equal(folderName("C:\\Users\\me\\Notes\\"), "Notes");
    assert.equal(folderName("D:/x/y"), "y");
    assert.equal(folderName(""), "");
});

test("shortPath keeps the drive and the last two folders of a long path", () => {
    assert.equal(shortPath("C:\\Users\\me\\Documents\\Notes"), "C:\\…\\Documents\\Notes");
    assert.equal(shortPath("C:\\Users\\me"), "C:\\Users\\me");
});
