// Notebook folder paths, as the shell reports them (Windows, possibly with the long-path
// prefix). Pure functions; tested with `node --test`.

/** A folder as people read it: without the `\\?\` prefix of long Windows paths. */
export const plainFolder = (folder) => String(folder ?? "").replace(/^\\\\\?\\/, "");

/** Folders compare without the prefix, without trailing separators and without case. */
export function sameFolder(a, b) {
    const clean = (folder) => plainFolder(folder).replace(/[\\/]+$/, "").toLowerCase();
    return clean(a) === clean(b);
}

/** The name of the folder itself. */
export const folderName = (folder) => folder.split(/[\\/]/).filter(Boolean).pop() || "";

/** A long path as it is easy to read: the drive, then only the last two folders. */
export function shortPath(folder) {
    const parts = folder.split("\\").filter(Boolean);
    return parts.length > 3 ? `${parts[0]}\\…\\${parts.slice(-2).join("\\")}` : folder;
}
