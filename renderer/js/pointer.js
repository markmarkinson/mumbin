// Mouse and clipboard handling of the editor: clicks on checkboxes, links,
// tags, pictures and tables, and files pasted from the clipboard.

import { EditorView } from "../vendor/codemirror.js";
import { showTag } from "./dock.js";
import { paste } from "./files.js";
import { openLink } from "./links.js";
import { open as showPicture } from "./pictures.js";
import { fail } from "./ui.js";
import { checkboxAt, linkAt } from "./wiki.js";

/** Follows a link of the page text. */
const follow = (link) => openLink(link).catch(fail);

/** Cycles the checkbox in the line behind a clicked box widget. */
function clickBox(view, box) {
    const line = view.state.doc.lineAt(view.posAtDOM(box));
    const found = checkboxAt(line.text);
    if (!found) return;
    view.dispatch({
        changes: { from: line.from + found.from + 1, to: line.from + found.from + 2, insert: found.next },
        userEvent: "input.checkbox",
    });
}

/** A click on a rendered table opens its link, or puts the cursor at the table so it turns into source. */
function clickTable(view, event, table) {
    const cellLink = event.target.closest("[data-link-target]");
    if (cellLink && !event.altKey) {
        follow({ target: cellLink.dataset.linkTarget, kind: cellLink.dataset.linkKind });
    } else {
        view.dispatch({ selection: { anchor: view.posAtDOM(table) }, scrollIntoView: true });
        view.focus();
    }
}

/** The link under the mouse in the document text, or null. */
function linkUnderMouse(view, event) {
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    if (position === null) return null;
    const line = view.state.doc.lineAt(position);
    return linkAt(line.text, position - line.from);
}

/**
 * @param {{readOnly: boolean, generation: number}} session `generation`
 *   changes with every loaded page, so a paste that finishes late is dropped
 */
export function pointerHandlers(session) {
    return EditorView.domEventHandlers({
        paste(event, view) {
            // Pictures and files on the clipboard become attachments of the page.
            const files = [...(event.clipboardData?.files ?? [])];
            if (!files.length || session.readOnly) return false;
            event.preventDefault();
            const generation = session.generation;
            paste(files).then((text) => {
                if (text && !session.readOnly && generation === session.generation) {
                    view.dispatch(view.state.replaceSelection(text), { userEvent: "input.paste", scrollIntoView: true });
                }
            });
            return true;
        },
        mousedown(event, view) {
            if (event.button !== 0) return false;
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return false;

            // A click on a picture shows it large; Alt+click puts the cursor next to it instead.
            const picture = target.closest(".wk-img img");
            if (picture && !event.altKey) {
                event.preventDefault();
                showPicture({ src: picture.currentSrc || picture.src, alt: picture.alt });
                return true;
            }

            // A click on @tag shows the pages with that tag; Alt+click edits it.
            const tag = target.closest(".wk-tag");
            if (tag && !event.altKey) {
                event.preventDefault();
                showTag(tag.textContent.replace(/^@/, ""));
                return true;
            }

            const box = target.closest(".wk-box");
            if (box && !session.readOnly) {
                event.preventDefault();
                clickBox(view, box);
                return true;
            }

            const table = target.closest(".wk-table");
            if (table) {
                event.preventDefault();
                clickTable(view, event, table);
                return true;
            }

            // Alt+click places the cursor inside a link instead of following it.
            if (event.altKey || !target.closest(".wk-link")) return false;
            const link = linkUnderMouse(view, event);
            if (!link) return false;
            event.preventDefault();
            follow({ target: link.target, kind: link.kind });
            return true;
        },
    });
}
