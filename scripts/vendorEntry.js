// Everything the renderer uses from CodeMirror, bundled into one file by
// scripts/buildVendor.js. Keep this list short: every export costs exe size.
export { EditorState, Compartment, StateField, Prec } from "@codemirror/state";
export {
    EditorView,
    keymap,
    Decoration,
    WidgetType,
    drawSelection,
    placeholder,
} from "@codemirror/view";
export { defaultKeymap, history, historyKeymap, undo } from "@codemirror/commands";
export { search, searchKeymap, openSearchPanel } from "@codemirror/search";
export { indentUnit } from "@codemirror/language";
