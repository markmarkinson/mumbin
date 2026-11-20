//! Hooks for the end-to-end tests. They do nothing unless `MUMBIN_E2E=1` is set,
//! so a normal start never reads the other variables.

use std::env;
use std::path::PathBuf;

fn flag(variable: &str) -> bool {
    env::var_os(variable).is_some_and(|value| value == "1")
}

/// The page may offer a handle to replay events that only the operating system can create;
/// outside programs are not started and the KDF runs at its weakest setting.
pub(crate) fn enabled() -> bool {
    flag("MUMBIN_E2E")
}

/// The dock of a first start is open, not folded.
pub(crate) fn dock_open() -> bool {
    enabled() && flag("MUMBIN_E2E_DOCK_OPEN")
}

fn folder(variable: &str) -> Option<PathBuf> {
    if !enabled() {
        return None;
    }
    env::var_os(variable)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

/// Stands in for the folder dialog of "open or create a notebook".
pub(crate) fn pick_dir() -> Option<PathBuf> {
    folder("MUMBIN_E2E_PICK_DIR")
}

/// Stands in for the folder dialog of export and "save the decryption tool"; also keeps
/// the browser from being started on the result.
pub(crate) fn export_dir() -> Option<PathBuf> {
    folder("MUMBIN_E2E_EXPORT_DIR")
}
