//! Mumbin desktop shell: window, portable data folder and the command
//! surface the webview uses to reach `mumbin-core`.

mod commands;
mod e2e;
mod error;
mod notebook_lock;
mod private_files;
mod settings;
mod state;
mod window;

use std::env;
use std::path::PathBuf;

use tauri::Manager;

/// Portable settings, index and webview profile live next to the executable.
/// `MUMBIN_DATA_DIR` redirects them, which keeps automated tests away
/// from real settings.
pub(crate) fn data_dir() -> PathBuf {
    if let Some(redirected) = env::var_os("MUMBIN_DATA_DIR").filter(|value| !value.is_empty()) {
        return PathBuf::from(redirected);
    }
    env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|folder| folder.join("mumbin_data")))
        .unwrap_or_default()
}

/// Builds and runs the Tauri application.
///
/// # Panics
/// When the configuration has no main window, which `tauri.conf.json` always has.
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::clipboard::clipboard_text,
            commands::notebooks::startup,
            commands::notebooks::preferences_save,
            commands::notebooks::read_only_set,
            commands::notebooks::pick_folder,
            commands::notebooks::notebook_settings,
            commands::notebooks::notebook_settings_save,
            commands::notebooks::notebook_open,
            commands::notebooks::notebook_create,
            commands::notebooks::notebook_recent,
            commands::notebooks::notebook_forget,
            commands::pages::page_children,
            commands::pages::page_name_from_input,
            commands::pages::page_read,
            commands::pages::page_template,
            commands::pages::page_save,
            commands::pages::page_move,
            commands::pages::page_deletion_size,
            commands::pages::page_delete,
            commands::index::page_resolve_link,
            commands::index::page_backlinks,
            commands::index::index_names,
            commands::index::tags_list,
            commands::index::tag_pages,
            commands::index::tasks_list,
            commands::index::notebook_search,
            commands::index::recent_changes,
            commands::attachments::attachments_list,
            commands::attachments::attachment_add,
            commands::attachments::attachment_store,
            commands::attachments::attachment_delete,
            commands::attachments::attachment_rename,
            commands::attachments::file_open,
            commands::attachments::folder_open,
            commands::attachments::url_open,
            commands::attachments::picture_read,
            commands::attachments::attachment_drop,
            commands::export::export_html,
            commands::export::export_show,
            commands::export::page_print,
            commands::page_password::page_password_set,
            commands::page_password::page_password_unlock,
            commands::page_password::page_password_change,
            commands::page_password::page_password_remove,
            commands::page_password::page_lock,
            commands::page_password::page_lock_all,
            commands::page_password::page_passwords_list,
            commands::vault::vault_status,
            commands::vault::vault_create,
            commands::vault::vault_unlock,
            commands::vault::vault_lock,
            commands::vault::vault_change_passphrase,
            commands::vault::page_set_encrypted,
            commands::vault::vault_convert_all,
            commands::vault::vault_encrypt_new,
            commands::vault::vault_pages,
            commands::vault::decrypt_tool_save,
            commands::about::log_write,
            commands::about::app_info,
            commands::about::data_folder_open,
        ])
        .setup(|app| {
            let config = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .expect("main window is configured");
            // Built in code instead of from the configuration alone so the
            // WebView2 profile lands in the portable data folder.
            let window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?
                .data_directory(data_dir().join("webview"))
                .build()?;
            window::restore(&window);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                    window::remember(window, false);
                }
                tauri::WindowEvent::CloseRequested { .. } => window::remember(window, true),
                tauri::WindowEvent::Destroyed => {
                    window.state::<state::AppState>().private_files.clear();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("{error}");
    }
}
