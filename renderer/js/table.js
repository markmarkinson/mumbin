// Table source lines (`| a | b |`): recognising and parsing them. Pure functions.

const TABLE_ROW = /^\|.*\|[ \t]*$/;
const TABLE_ALIGN = /^\|[ |:-]+\|[ \t]*$/;

export const isTableRow = (line) => TABLE_ROW.test(line);

/** Splits one table row into trimmed cells, honouring `\|`, `\n` and `\t`. */
export function tableCells(line) {
    const cells = [];
    let current = "";
    const body = line.trim().slice(1, -1);
    for (let index = 0; index < body.length; index += 1) {
        const char = body[index];
        if (char === "\\" && index + 1 < body.length) {
            const next = body[index + 1];
            current += next === "n" ? "\n" : next === "t" ? "\t" : next;
            index += 1;
        } else if (char === "|") {
            cells.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    cells.push(current.trim());
    return cells;
}

function alignment(cell) {
    const text = cell.trim();
    const left = text.startsWith(":");
    const right = text.endsWith(":");
    return left && right ? "center" : right ? "right" : left ? "left" : "";
}

/**
 * Parses table source lines. A header cell ending in `<` lets its column wrap.
 * @returns {{headers: string[], aligns: string[], wraps: boolean[], rows: string[][]}}
 */
export function parseTable(lines) {
    const headers = tableCells(lines[0]);
    const wraps = headers.map((header) => header.endsWith("<"));
    const cleanHeaders = headers.map((header, index) => (wraps[index] ? header.slice(0, -1).trim() : header));
    const hasAlign = lines.length > 1 && TABLE_ALIGN.test(lines[1]);
    const aligns = hasAlign ? lines[1].trim().slice(1, -1).split("|").map(alignment) : [];
    const rows = lines.slice(hasAlign ? 2 : 1).map(tableCells);
    const width = Math.max(cleanHeaders.length, ...rows.map((row) => row.length));
    const pad = (cells, fill) => [...cells, ...Array(Math.max(0, width - cells.length)).fill(fill)];
    return {
        headers: pad(cleanHeaders, ""),
        aligns: pad(aligns, ""),
        wraps: pad(wraps, false),
        rows: rows.map((row) => pad(row, "")),
    };
}
