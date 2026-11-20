//! Temporary plaintext explicitly requested for opening or printing. Each
//! process owns its files; another window may only remove orphaned copies.
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use crate::state::locked;

struct Copy {
    // Release the lock before TempDir attempts to remove its files.
    _lock: File,
    _folder: tempfile::TempDir,
}

pub struct PrivateFiles {
    root: PathBuf,
    copies: Mutex<Vec<Copy>>,
}

impl Default for PrivateFiles {
    fn default() -> Self {
        Self::new(crate::data_dir().join("open-temp"))
    }
}

impl PrivateFiles {
    fn new(root: PathBuf) -> Self {
        Self {
            root,
            copies: Mutex::default(),
        }
    }

    pub fn stage(&self, name: &Path, bytes: &[u8]) -> io::Result<PathBuf> {
        let mut components = name.components();
        if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "expected a file name",
            ));
        }
        fs::create_dir_all(&self.root)?;
        let folder = tempfile::Builder::new()
            .prefix("mumbin-open-")
            .tempdir_in(&self.root)?;
        let lock = File::options()
            .create_new(true)
            .write(true)
            .open(folder.path().join(".owner"))?;
        lock.lock()?;
        let target = folder.path().join(name);
        let mut file = File::options().create_new(true).write(true).open(&target)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        locked(&self.copies).push(Copy {
            _lock: lock,
            _folder: folder,
        });
        Ok(target)
    }

    pub fn clear(&self) {
        locked(&self.copies).clear();
    }

    pub fn cleanup_orphans(&self) {
        let Ok(entries) = fs::read_dir(&self.root) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = fs::symlink_metadata(&path) else {
                continue;
            };
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if metadata.file_attributes() & 0x400 != 0 {
                    continue;
                }
            }
            if !metadata.is_dir()
                || metadata.file_type().is_symlink()
                || path.parent() != Some(self.root.as_path())
                || !entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("mumbin-open-")
            {
                continue;
            }
            let Ok(lock) = File::options().write(true).open(path.join(".owner")) else {
                continue;
            };
            if lock.try_lock().is_ok() {
                drop(lock);
                // Only an owned direct child of this profile's private temp root.
                let _ = fs::remove_dir_all(path);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_never_clean_another_live_windows_plaintext() {
        let root = tempfile::tempdir().unwrap();
        let first = PrivateFiles::new(root.path().to_owned());
        let second = PrivateFiles::new(root.path().to_owned());
        let file = first.stage(Path::new("copy.txt"), b"private").unwrap();
        second.cleanup_orphans();
        assert_eq!(fs::read(&file).unwrap(), b"private");
        assert!(first.stage(Path::new("../escape"), b"no").is_err());
        first.clear();
        assert!(!file.exists());
        let orphan = root.path().join("mumbin-open-orphan");
        fs::create_dir(&orphan).unwrap();
        fs::write(orphan.join(".owner"), b"").unwrap();
        fs::write(orphan.join("secret"), b"left after crash").unwrap();
        second.cleanup_orphans();
        assert!(!orphan.exists());
    }
}
