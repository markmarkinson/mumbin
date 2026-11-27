// Replacements the editor draws in place of wiki markup: bullets, checkboxes,
// pictures and tables.

import { WidgetType } from "../vendor/codemirror.js";
import { load as loadPicture } from "./pictures.js";
import { parseTable } from "./table.js";
import { scanDocument } from "./wiki.js";

const BOX_LABEL = { " ": "☐", "*": "☑", x: "☒", ">": "▷", "<": "◁" };

export class BulletWidget extends WidgetType {
    eq() {
        return true;
    }

    toDOM() {
        const dot = document.createElement("span");
        dot.className = "wk-dot";
        dot.textContent = "•";
        return dot;
    }
}

export class BoxWidget extends WidgetType {
    constructor(state) {
        super();
        this.state = state;
    }

    eq(other) {
        return other.state === this.state;
    }

    toDOM() {
        const box = document.createElement("span");
        box.className = "wk-box";
        box.dataset.state = this.state;
        box.setAttribute("role", "checkbox");
        box.setAttribute("aria-checked", this.state === "*" ? "true" : this.state === " " ? "false" : "mixed");
        box.textContent = BOX_LABEL[this.state] || "☐";
        return box;
    }

    ignoreEvent() {
        return false;
    }
}

export class ImageWidget extends WidgetType {
    /** @param {{src: string, alt: string, width: number|null, height: number|null}} image */
    constructor(image) {
        super();
        this.image = image;
    }

    eq(other) {
        return other.image.src === this.image.src && other.image.width === this.image.width && other.image.height === this.image.height;
    }

    toDOM() {
        const frame = document.createElement("span");
        frame.className = "wk-img";
        const picture = document.createElement("img");
        picture.alt = this.image.alt || this.image.src;
        picture.title = this.image.src;
        picture.draggable = false;
        if (this.image.width) picture.width = this.image.width;
        if (this.image.height) picture.height = this.image.height;
        picture.addEventListener("error", () => {
            frame.classList.add("wk-img-missing");
            frame.textContent = `🖼 ${this.image.src}`;
        });
        loadPicture(this.image.src).then((url) => { picture.src = url; }, () => picture.dispatchEvent(new Event("error")));
        frame.append(picture);
        return frame;
    }

    ignoreEvent() {
        return false;
    }
}

/** Fills `element` with one line of wiki text, formatted but not editable. */
function renderInline(element, text) {
    const { tokens } = scanDocument([text])[0];
    const classes = Array.from({ length: text.length }, () => new Set());
    const hidden = new Array(text.length).fill(false);
    const links = new Array(text.length).fill(null);
    for (const token of tokens) {
        for (let index = token.from; index < token.to; index += 1) {
            if (token.cls === "wk-syntax") hidden[index] = true;
            else token.cls.split(" ").forEach((name) => classes[index].add(name));
            if (token.link) links[index] = token.link;
        }
    }
    const keys = classes.map((names) => [...names].join(" "));
    let index = 0;
    while (index < text.length) {
        if (hidden[index]) {
            index += 1;
            continue;
        }
        const key = keys[index];
        const link = links[index];
        let end = index;
        while (end < text.length && !hidden[end] && keys[end] === key && links[end] === link) end += 1;
        const piece = text.slice(index, end);
        if (key) {
            const span = document.createElement("span");
            span.className = key;
            span.textContent = piece;
            if (link) {
                span.dataset.linkTarget = link.target;
                span.dataset.linkKind = link.kind;
            }
            element.append(span);
        } else {
            element.append(piece);
        }
        index = end;
    }
}

export class TableWidget extends WidgetType {
    constructor(source) {
        super();
        this.source = source;
    }

    eq(other) {
        return other.source === this.source;
    }

    toDOM() {
        const wrap = document.createElement("div");
        wrap.className = "wk-table";
        const table = document.createElement("table");
        const parsed = parseTable(this.source.split("\n"));
        const row = (cells, tag) => {
            const tr = document.createElement("tr");
            cells.forEach((cell, column) => {
                const element = document.createElement(tag);
                if (parsed.aligns[column]) element.dataset.align = parsed.aligns[column];
                if (parsed.wraps[column]) element.dataset.wrap = "true";
                cell.split("\n").forEach((part, index) => {
                    if (index > 0) element.append(document.createElement("br"));
                    if (tag === "th") element.append(part);
                    else renderInline(element, part);
                });
                tr.append(element);
            });
            return tr;
        };
        const head = document.createElement("thead");
        head.append(row(parsed.headers, "th"));
        const body = document.createElement("tbody");
        for (const cells of parsed.rows) body.append(row(cells, "td"));
        table.append(head, body);
        wrap.append(table);
        return wrap;
    }

    ignoreEvent() {
        return false;
    }
}
