// The only module that talks to Tauri. Everything else uses `api`, so the
// renderer can run against a stand-in during tests.

const tauri = window.__TAURI__;
const invoke = tauri.core.invoke;
const appWindow = tauri.window.getCurrentWindow();

export const api = {
    startup: () => invoke("startup"),
    appInfo: () => invoke("app_info"),
    openDataFolder: () => invoke("data_folder_open"),
    /** Leaves a line in the log file next to the program (errors the person saw). */
    log: (text) => invoke("log_write", { text }).catch(() => {}),
    savePreferences: (preferences) => invoke("preferences_save", { preferences }),
    vaultStatus: () => invoke("vault_status"),
    /** `sealed`: the notebook also hides its file names (only for a notebook without pages). */
    vaultCreate: (passphrase, sealed = false) => invoke("vault_create", { passphrase, sealed }),
    notebookSettings: () => invoke("notebook_settings"),
    saveNotebookSettings: (disableTrash, template) => invoke("notebook_settings_save", { disableTrash, template }),
    clipboardText: () => invoke("clipboard_text"),
    vaultUnlock: (passphrase) => invoke("vault_unlock", { passphrase }),
    vaultLock: () => invoke("vault_lock"),
    vaultChangePassphrase: (oldPassphrase, newPassphrase) => invoke("vault_change_passphrase", { oldPassphrase, newPassphrase }),
    setPageEncrypted: (name, encrypted) => invoke("page_set_encrypted", { name, encrypted }),
    vaultConvertAll: (encrypt) => invoke("vault_convert_all", { encrypt }),
    vaultEncryptNew: (on) => invoke("vault_encrypt_new", { on }),
    vaultPages: () => invoke("vault_pages"),
    /** The pages with a password of their own: `{name, unlocked}`. */
    pagePasswords: () => invoke("page_passwords_list"),
    pagePasswordSet: (name, password) => invoke("page_password_set", { name, password }),
    pagePasswordUnlock: (name, password) => invoke("page_password_unlock", { name, password }),
    pagePasswordChange: (name, oldPassword, newPassword) => invoke("page_password_change", { name, oldPassword, newPassword }),
    pagePasswordRemove: (name, password) => invoke("page_password_remove", { name, password }),
    pageLock: (name) => invoke("page_lock", { name }),
    pageLockAll: () => invoke("page_lock_all"),
    /** Writes mumbin_decrypt.py into a folder the person picks; resolves to its path or null. */
    saveDecryptTool: () => invoke("decrypt_tool_save"),
    /** Read-only mode: the program refuses every change to the notebook. */
    setReadOnly: (on) => invoke("read_only_set", { on }),
    recentNotebooks: () => invoke("notebook_recent"),
    forgetNotebook: (folder) => invoke("notebook_forget", { folder }),
    /** Every page name, then link targets without a page: `{name, exists}`. */
    names: () => invoke("index_names"),
    recentChanges: () => invoke("recent_changes"),
    pickFolder: (title) => invoke("pick_folder", { title }),
    openNotebook: (folder) => invoke("notebook_open", { folder }),
    createNotebook: (folder, name) => invoke("notebook_create", { folder, name }),
    children: (parent) => invoke("page_children", { parent }),
    resolveLink: (source, target) => invoke("page_resolve_link", { source, target }),
    backlinks: (name) => invoke("page_backlinks", { name }),
    search: (query) => invoke("notebook_search", { query }),
    pageNameFromInput: (input) => invoke("page_name_from_input", { input }),
    readPage: (name) => invoke("page_read", { name }),
    /** Starting text and cursor position of a page that does not exist yet, from its page template. */
    pageTemplate: (name, language) => invoke("page_template", { name, language }),
    savePage: (name, body, stamp, force = false) => invoke("page_save", { name, body, stamp, force }),
    movePage: (from, to, updateLinks) => invoke("page_move", { from, to, updateLinks }),
    deletionSize: (name) => invoke("page_deletion_size", { name }),
    deletePage: (name) => invoke("page_delete", { name, permanently: false }),
    tasks: () => invoke("tasks_list"),
    attachments: (name) => invoke("attachments_list", { name }),
    addAttachments: (name, title) => invoke("attachment_add", { name, title }),
    storeAttachment: (name, fileName, data) => invoke("attachment_store", { name, fileName, data }),
    deleteAttachment: (name, file) => invoke("attachment_delete", { name, file }),
    /** Resolves to `{name, linksUpdated}`; the name may differ from the wish when characters had to be replaced. */
    renameAttachment: (name, file, newName) => invoke("attachment_rename", { name, file, newName }),
    openFile: (page, target) => invoke("file_open", { page, target }),
    openFolder: (name) => invoke("folder_open", { name }),
    /** Writes HTML into a new folder the person chose; resolves to a report, or null when cancelled. */
    exportHtml: (scope, texts) => invoke("export_html", { scope, texts }),
    showExport: () => invoke("export_show"),
    printPage: (name, body, texts) => invoke("page_print", { name, body, texts }),
    tags: () => invoke("tags_list"),
    tagPages: (tag) => invoke("tag_pages", { tag }),
    dropPaths: (name, paths, linkOnly) => invoke("attachment_drop", { name, paths, linkOnly }),
    /** Files dragged from the file manager onto the window; `handler` gets Tauri's event payload. */
    onDragDrop: (handler) => tauri.webview.getCurrentWebview().onDragDropEvent((event) => handler(event.payload)),
    readPicture: (page, src) => invoke("picture_read", { page, src }),
    // Through our own command, which only lets web and mail addresses pass. The opener
    // plugin's own command is (rightly) not allowed for the page.
    openUrl: (url) => invoke("url_open", { url }),
    window: {
        minimize: () => appWindow.minimize(),
        toggleMaximize: () => appWindow.toggleMaximize(),
        close: () => appWindow.close(),
        destroy: () => appWindow.destroy(),
        setTitle: (title) => appWindow.setTitle(title),
        isFullscreen: () => appWindow.isFullscreen(),
        setFullscreen: (value) => appWindow.setFullscreen(value),
        /** Runs `handler` before the window closes; the window waits for it. */
        onCloseRequested: (handler) => appWindow.onCloseRequested(handler),
    },
};
