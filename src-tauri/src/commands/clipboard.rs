//! The text on the clipboard, for "Paste" in the context menu of the editor.

/// Text on the clipboard, `None` when there is none (or on a system without clipboard support).
#[tauri::command]
pub fn clipboard_text() -> Option<String> {
    #[cfg(windows)]
    {
        clipboard_win::get_clipboard_string().ok()
    }
    #[cfg(not(windows))]
    {
        None
    }
}
