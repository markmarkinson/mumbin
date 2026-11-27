// The help dialog (shortcuts and tips) and the "about" dialog.

import { api } from "./bridge.js";
import { COMMANDS, GROUPS } from "./actions.js";
import { shortcutLabel } from "./commands.js";
import { showDialog } from "./dialogs.js";
import { currentLanguage, t } from "./i18n.js";
import { $, el, fail } from "./ui.js";

const HELP_ROWS = [1, 2, 3, 4, 5, 6, 7, 8];

/** One titled block of the help: what it does on the left, how on the right. */
function helpSection(title, rows) {
    const table = el("table");
    for (const [what, how] of rows) {
        const row = table.insertRow();
        row.insertCell().textContent = what;
        row.insertCell().append(el("kbd", { textContent: how }));
    }
    return el("section", {}, el("h3", { textContent: title }), table);
}

export function openHelp() {
    const language = currentLanguage();
    const body = $("help-body");
    body.replaceChildren();
    for (const group of GROUPS) {
        const rows = COMMANDS.filter((command) => command.group === group && command.keys);
        if (rows.length) body.append(helpSection(t(`group.${group}`), rows.map((command) => [t(`cmd.${command.id}`), shortcutLabel(command.keys, language)])));
    }
    body.append(helpSection(t("group.search"), HELP_ROWS.map((index) => [t(`find.${index}.what`), t(`find.${index}.how`)])));
    body.append(helpSection(t("group.typing"), HELP_ROWS.map((index) => [t(`typing.${index}.what`), t(`typing.${index}.how`)])));
    return showDialog($("dlg-help"), {
        onOpen() {
            body.scrollTop = 0;
            $("dlg-help-form").querySelector("button[type=submit]").focus();
        },
    });
}

/** Version and where the program keeps its own files. */
export async function openAbout() {
    const info = await api.appInfo();
    $("about-version").textContent = info.version;
    $("about-program").textContent = info.program;
    $("about-data").textContent = info.dataFolder;
    $("about-log").textContent = info.logFile;
    await showDialog($("dlg-about"), {
        onOpen() {
            $("about-open-data").onclick = () => api.openDataFolder().catch(fail);
        },
    });
}
