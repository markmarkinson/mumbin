//! About box, the data folder and the log file.

use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;

use super::open_path;
use crate::e2e;
use crate::error::CommandResult;

/// Largest size of the log file; it is renamed to `.old` and started again beyond it.
const MAX_LOG_BYTES: u64 = 512 * 1024;

/// Longest log line, in characters.
const MAX_LOG_LINE: usize = 500;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: &'static str,
    data_folder: String,
    log_file: String,
    program: String,
}

fn log_file() -> PathBuf {
    crate::data_dir().join("mumbin.log")
}

/// Writes a line to the log file. Control characters are removed and the line is
/// cut, so what a page or a file name contains cannot forge or flood the log.
fn append_log(file: &Path, text: &str) {
    let line: String = text
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .take(MAX_LOG_LINE)
        .collect();
    if let Some(folder) = file.parent() {
        let _ = std::fs::create_dir_all(folder);
    }
    if std::fs::metadata(file).is_ok_and(|metadata| metadata.len() > MAX_LOG_BYTES) {
        let _ = std::fs::rename(file, file.with_extension("log.old"));
    }
    let when = mumbin_core::template::local_now().format("%Y-%m-%d %H:%M:%S");
    if let Ok(mut handle) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(file)
    {
        let _ = writeln!(handle, "{when} {line}");
    }
}

/// Lets the window leave a trace of an error in the log file.
#[tauri::command]
pub fn log_write(text: String) {
    append_log(&log_file(), &text);
}

#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo {
        version: mumbin_core::VERSION,
        data_folder: crate::data_dir().to_string_lossy().into_owned(),
        log_file: log_file().to_string_lossy().into_owned(),
        program: std::env::current_exe()
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default(),
    }
}

/// Shows the folder with the program's own files (settings, log, templates).
#[tauri::command(async)]
pub fn data_folder_open(app: AppHandle) -> CommandResult<()> {
    let folder = crate::data_dir();
    std::fs::create_dir_all(&folder)?;
    if e2e::enabled() {
        return Ok(());
    }
    open_path(&app, &folder)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_log_line_cannot_be_forged_or_flooded() {
        let folder = std::env::temp_dir().join(format!("mumbin-log-test-{}", std::process::id()));
        let file = folder.join("mumbin.log");
        append_log(&file, "erste\nzweite Zeile\r\n2026-01-01 gefälscht");
        append_log(&file, &"x".repeat(5000));
        let text = std::fs::read_to_string(&file).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(
            lines.len(),
            2,
            "a line break in the text made a new log line: {text:?}"
        );
        assert!(
            lines[0].ends_with("erste zweite Zeile  2026-01-01 gefälscht"),
            "{}",
            lines[0]
        );
        assert!(lines[1].len() < 600, "a long text was not cut");
        let _ = std::fs::remove_dir_all(&folder);
    }
}
