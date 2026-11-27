// End-to-end check of how tables look and behave in the editor: grid, header,
// alignment from the second row, wrapping columns, wide tables that scroll on
// their own, formatting inside cells, and the switch to the table's text.

import assert from "node:assert/strict";
import { readPageFile, writePage } from "./fixture.mjs";
import { scenario } from "./scenario.mjs";

const columns = Array.from({ length: 10 }, (_, index) => `Spalte ${index + 1}`);
const PAGE = [
    "====== Tabellen ======",
    "",
    "| Produkt | Preis | Menge | Notiz < |",
    "|:--------|------:|:-----:|:--------|",
    "| Äpfel   | 1,20 € | 12 | Frisch vom Markt, sehr lange Notiz, die in der Spalte umbrechen soll und nicht die Tabelle breit macht |",
    "| Birnen  | 2,05 € | 3 | **fett** und //kursiv// und [[Home]] |",
    "",
    `| ${columns.join(" | ")} |`,
    `|${columns.map(() => "---").join("|")}|`,
    `| ${columns.map((_, index) => `Wert Nummer ${index + 1}`).join(" | ")} |`,
    "",
];

await scenario("tables", "table grid, alignment, wrapping, scrolling, cell formatting, source view", async (t) => {
    const notebook = t.notebook();
    const fileText = writePage(notebook, "Tabellen", PAGE);
    const app = await t.launch({ notebook });

    /** Facts about the n-th table, measured in the page. */
    const measure = (index) =>
        app.evaluate(`(() => {
            const wrap = document.querySelectorAll('.wk-table')[${index}];
            const cells = (selector) => [...wrap.querySelectorAll(selector)];
            const style = (element, property) => getComputedStyle(element)[property];
            const column = document.querySelector('.cm-content').getBoundingClientRect();
            const headers = cells('th');
            const firstRow = cells('tbody tr:first-child td');
            return {
                headers: headers.map((e) => e.textContent),
                headerAlign: headers.map((e) => style(e, 'textAlign')),
                cellAlign: firstRow.map((e) => style(e, 'textAlign')),
                cellWrap: firstRow.map((e) => style(e, 'whiteSpace')),
                border: style(wrap, 'borderTopWidth'),
                headerBackground: style(headers[0], 'backgroundColor'),
                cellBackground: style(firstRow[0], 'backgroundColor'),
                width: wrap.getBoundingClientRect().width,
                columnWidth: column.width,
                scrolls: wrap.scrollWidth > wrap.clientWidth + 1,
                rows: cells('tbody tr').length,
                formatted: {
                    strong: wrap.querySelectorAll('tbody tr:nth-child(2) .wk-bold').length,
                    emphasis: wrap.querySelectorAll('tbody tr:nth-child(2) .wk-italic').length,
                    link: wrap.querySelectorAll('tbody tr:nth-child(2) .wk-link').length,
                },
            };
        })()`);

    await app.openFromTree("Tabellen");
    await app.waitForCount(".wk-table table", 2);

    // ── The first table ───────────────────────────────────────────────────
    const small = await measure(0);
    assert.deepEqual(small.headers, ["Produkt", "Preis", "Menge", "Notiz"], "header text, the wrap marker < must not show");
    assert.deepEqual(small.headerAlign, ["left", "right", "center", "left"]);
    assert.deepEqual(small.cellAlign, ["left", "right", "center", "left"]);
    assert.deepEqual(small.cellWrap, ["nowrap", "nowrap", "nowrap", "normal"], "only the column marked with < wraps");
    assert.equal(small.border, "1px", "table has no frame");
    assert.notEqual(small.headerBackground, small.cellBackground, "header looks like the body");
    assert.ok(small.width <= small.columnWidth + 1, `table is ${small.width}px in a ${small.columnWidth}px column`);
    assert.equal(small.scrolls, false, "a table that fits scrolls anyway");
    assert.equal(small.rows, 2);
    assert.deepEqual(small.formatted, { strong: 1, emphasis: 1, link: 1 }, "formatting inside a cell is lost");

    // ── The wide table scrolls by itself and never widens the page ────────
    const wide = await measure(1);
    assert.equal(wide.headers.length, 10);
    assert.ok(wide.width <= wide.columnWidth + 1, `wide table is ${wide.width}px in a ${wide.columnWidth}px column`);
    assert.ok(wide.scrolls, "a table with ten columns does not scroll");
    assert.equal(
        await app.evaluate("document.querySelector('.cm-scroller').scrollWidth <= document.querySelector('.cm-scroller').clientWidth + 1"),
        true,
        "the wide table made the whole page scroll sideways",
    );

    // ── A click shows the table's text; moving away draws the grid again ──
    const box = await app.rect(".wk-table");
    await app.clickAt(box.x + box.w / 2, box.y + box.h / 2);
    await app.waitForCount(".wk-table", 1);
    const sourceLines = await app.count(".wk-table-source");
    assert.ok(sourceLines >= 4, `only ${sourceLines} lines of table text shown`);
    assert.match(await app.evaluate("getComputedStyle(document.querySelector('.wk-table-source')).fontFamily"), /mono/i, "table text is not monospace");
    assert.ok((await app.text(".wk-table-source")).startsWith("| Produkt"), "the raw text is not the table's text");
    await app.toEnd({ click: false });
    await app.waitForCount(".wk-table", 2);

    // Looking at tables never rewrites the page.
    await app.settle();
    assert.equal(readPageFile(notebook, "Tabellen"), fileText, "viewing the tables changed the file");
    app.expectConsoleErrors();
});
