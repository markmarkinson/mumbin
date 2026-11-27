//! Portable settings stored as JSON next to the executable.
//!
//! Settings are a convenience. Reading tolerates a missing or broken file and
//! writing failures (read-only media) are ignored, so the app always starts.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::data_dir;

const LAST_NOTEBOOK: &str = "lastNotebook";
const RECENT_NOTEBOOKS: &str = "recentNotebooks";
const PREFERENCES: &str = "preferences";
const WINDOW: &str = "window";
const MAX_RECENT: usize = 12;

fn settings_file() -> PathBuf {
    data_dir().join("settings.json")
}

fn load() -> Map<String, Value> {
    fs::read(settings_file())
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default()
}

// Separate file handles coordinate read-modify-write transactions across threads
// and across windows sharing the same portable profile. The OS releases the lock
// on close or crash; the lock file itself is never removed.
fn write_lock() -> io::Result<fs::File> {
    fs::create_dir_all(data_dir())?;
    let lock = fs::File::options()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(data_dir().join("settings.lock"))?;
    lock.lock()?;
    Ok(lock)
}

/// Reads, changes and writes the settings as one transaction; failures are ignored.
fn modify(change: impl FnOnce(&mut Map<String, Value>)) {
    let Ok(_guard) = write_lock() else {
        return;
    };
    let mut settings = load();
    change(&mut settings);
    let _ = store(&settings);
}

fn store(settings: &Map<String, Value>) -> io::Result<()> {
    let text = serde_json::to_vec_pretty(settings)?;
    let file = settings_file();
    let mut temporary = tempfile::NamedTempFile::new_in(data_dir())?;
    temporary.write_all(&text)?;
    temporary.as_file().sync_all()?;
    temporary.persist(file).map_err(|error| error.error)?;
    Ok(())
}

/// Folder of the notebook that was open last, if it still exists.
pub fn last_notebook() -> Option<PathBuf> {
    let settings = load();
    let folder = PathBuf::from(settings.get(LAST_NOTEBOOK)?.as_str()?);
    folder.is_dir().then_some(folder)
}

/// A notebook in the list of recent ones.
#[derive(Serialize, Deserialize)]
pub struct RecentEntry {
    pub folder: String,
    pub name: String,
}

/// Entries that cannot be read are skipped.
fn recent_entries(settings: &Map<String, Value>) -> Vec<RecentEntry> {
    settings
        .get(RECENT_NOTEBOOKS)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| RecentEntry::deserialize(entry).ok())
        .collect()
}

/// Notebooks opened before, most recent first.
pub fn recent_notebooks() -> Vec<RecentEntry> {
    recent_entries(&load())
}

pub fn remember_notebook(folder: &Path, name: &str) {
    modify(|settings| {
        let folder = folder.to_string_lossy().into_owned();
        let mut recent = recent_entries(settings);
        recent.retain(|entry| entry.folder != folder);
        recent.insert(
            0,
            RecentEntry {
                folder: folder.clone(),
                name: name.to_owned(),
            },
        );
        recent.truncate(MAX_RECENT);
        settings.insert(RECENT_NOTEBOOKS.to_owned(), json!(recent));
        settings.insert(LAST_NOTEBOOK.to_owned(), Value::String(folder));
    });
}

/// Removes a notebook from the list of recent ones. The notebook itself is
/// not touched.
pub fn forget_notebook(folder: &str) {
    modify(|settings| {
        let mut recent = recent_entries(settings);
        recent.retain(|entry| entry.folder != folder);
        settings.insert(RECENT_NOTEBOOKS.to_owned(), json!(recent));
        if settings.get(LAST_NOTEBOOK).and_then(Value::as_str) == Some(folder) {
            settings.remove(LAST_NOTEBOOK);
        }
    });
}

/// Preferences of the user interface; an opaque object owned by the webview.
pub fn preferences() -> Value {
    let mut preferences = load()
        .get(PREFERENCES)
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));
    // The setting of a feature the program no longer has is removed for good.
    if preferences
        .as_object_mut()
        .is_some_and(|object| object.remove("showJournal").is_some())
    {
        set_preferences(preferences.clone());
    }
    preferences
}

pub fn set_preferences(preferences: Value) {
    if !preferences.is_object() {
        return;
    }
    modify(|settings| {
        settings.insert(PREFERENCES.to_owned(), preferences);
    });
}

/// Where the main window was, in physical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub maximized: bool,
}

pub fn window_state() -> Option<WindowState> {
    WindowState::deserialize(load().get(WINDOW)?).ok()
}

pub fn set_window_state(state: WindowState) {
    modify(|settings| {
        settings.insert(WINDOW.to_owned(), json!(state));
    });
}
