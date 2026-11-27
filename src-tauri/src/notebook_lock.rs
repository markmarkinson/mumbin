//! One writer per notebook: while a notebook is open, the operating system
//! refuses its lock file to a second window or program.

use std::fs::{File, OpenOptions, TryLockError};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::error::{CommandError, CommandResult};

/// Held for as long as the notebook is open; the file is unlocked when it is dropped.
pub(crate) type NotebookLock = Arc<File>;

/// The lock file of a notebook: in the temporary folder, named after the
/// notebook's path, so it is neither in the notebook (which may be synchronised)
/// nor in the portable data folder (each copy of the program has its own).
fn lock_path(folder: &Path) -> PathBuf {
    // FNV-1a over the lower-cased path; stable, unlike the standard hasher.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in folder.to_string_lossy().to_lowercase().bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    std::env::temp_dir()
        .join("mumbin-locks")
        .join(format!("{hash:016x}.lock"))
}

/// Takes the lock of a notebook. When another window holds it, opening fails
/// without touching the notebook.
pub(crate) fn acquire(folder: &Path) -> CommandResult<NotebookLock> {
    let path = lock_path(folder);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(path)
        .map_err(CommandError::io)?;
    match file.try_lock() {
        Ok(()) => Ok(Arc::new(file)),
        Err(TryLockError::WouldBlock) => Err(CommandError::new(
            "notebook-in-use",
            "the notebook is open in another window",
        )),
        Err(TryLockError::Error(error)) => Err(CommandError::io(error)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_in_use<T>(result: &CommandResult<T>) -> bool {
        matches!(result, Err(error) if error.code() == "notebook-in-use")
    }

    #[test]
    fn a_notebook_can_be_locked_by_one_holder_at_a_time() {
        let folder = std::env::temp_dir().join(format!(
            "mumbin-lock-test-{}-{:?}",
            std::process::id(),
            std::time::SystemTime::now()
        ));
        let first = acquire(&folder).expect("the first holder gets the lock");
        assert!(
            is_in_use(&acquire(&folder)),
            "a second holder must be refused"
        );
        // Another notebook is not affected, and a free lock can be taken again.
        let other = folder.join("other");
        assert!(acquire(&other).is_ok());
        drop(first);
        assert!(acquire(&folder).is_ok());
        // Case and spelling of the path do not make a second lock file.
        assert_eq!(
            lock_path(&folder),
            lock_path(Path::new(&folder.to_string_lossy().to_uppercase()))
        );
        let _ = std::fs::remove_file(lock_path(&folder));
        let _ = std::fs::remove_file(lock_path(&other));
    }
}
