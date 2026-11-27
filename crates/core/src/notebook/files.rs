//! File primitives that never follow links: bounded reads, pinned directories and atomic writes.

use std::fs;
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

use super::NotebookError;
use crate::pagefile::PageFile;

/// Suffix of the temporary file used for atomic writes.
pub(crate) const TEMP_SUFFIX: &str = ".mumbin-new~";
/// Prefix of the temporary files; hidden, so no listing shows them.
const TEMP_PREFIX: &str = ".mumbin-";

/// Hidden and temporary entries never show up as pages.
pub(crate) fn is_hidden(file_name: &str) -> bool {
    file_name.starts_with(['.', '~']) || file_name.ends_with('~')
}

pub(crate) fn linked_path_error(path: &Path) -> NotebookError {
    io::Error::new(
        io::ErrorKind::PermissionDenied,
        format!(
            "linked paths are not allowed inside a notebook: {}",
            path.display()
        ),
    )
    .into()
}

/// Symbolic links and, on Windows, junctions and other reparse points.
pub(crate) fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

/// Opens a directory without following a link and, on Windows, keeps it from being
/// replaced while the handle lives.
pub(crate) fn pin_directory(path: &Path) -> Result<fs::File, NotebookError> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES; FILE_SHARE_READ | FILE_SHARE_WRITE;
        // FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT.
        options
            .access_mode(0x81)
            .share_mode(3)
            .custom_flags(0x0220_0000);
    }
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_dir() || is_link(&metadata) {
        return Err(linked_path_error(path));
    }
    Ok(file)
}

/// Opens a regular file for reading; a link is refused.
pub(crate) fn open_regular(path: &Path) -> Result<fs::File, NotebookError> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Deny writes/deletion while reading; never follow a final reparse point.
        options.share_mode(1).custom_flags(0x0020_0000);
    }
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || is_link(&metadata) {
        return Err(linked_path_error(path));
    }
    Ok(file)
}

/// Pins a path's parents before reading an explicitly allowed document root.
/// Unlike canonicalize, this never follows directory reparse points.
pub(crate) fn guard_absolute_parents(path: &Path) -> Result<Vec<fs::File>, NotebookError> {
    let parent = path.parent().ok_or_else(|| linked_path_error(path))?;
    if !parent.is_absolute() {
        return Err(linked_path_error(path));
    }
    let mut current = PathBuf::new();
    let mut guards = Vec::new();
    for part in parent.components() {
        match part {
            Component::Prefix(_) => current.push(part),
            Component::RootDir | Component::Normal(_) => {
                current.push(part);
                guards.push(pin_directory(&current)?);
            }
            _ => return Err(linked_path_error(path)),
        }
    }
    Ok(guards)
}

/// The whole file, `TooLarge` when it has more than `maximum` bytes.
pub(crate) fn read_bounded(path: &Path, maximum: u64) -> Result<Vec<u8>, NotebookError> {
    let file = open_regular(path)?;
    if file.metadata()?.len() > maximum {
        return Err(NotebookError::TooLarge(path.to_owned()));
    }
    // Reading at most one byte more than allowed also holds if the file grows
    // while it is being read.
    let mut bytes = Vec::new();
    file.take(maximum + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > maximum {
        return Err(NotebookError::TooLarge(path.to_owned()));
    }
    Ok(bytes)
}

/// Like [`read_bounded`], `None` when the file does not exist.
pub(crate) fn read_if_exists(path: &Path, maximum: u64) -> Result<Option<Vec<u8>>, NotebookError> {
    match read_bounded(path, maximum) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(NotebookError::Io(error)) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// The entries of a folder, `None` when the folder does not exist.
pub(crate) fn read_dir_if_exists(folder: &Path) -> Result<Option<fs::ReadDir>, NotebookError> {
    match fs::read_dir(folder) {
        Ok(entries) => Ok(Some(entries)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// The first `limit` bytes of a regular file, `None` when it cannot be read.
pub(crate) fn read_prefix(path: &Path, limit: u64) -> Option<Vec<u8>> {
    let file = open_regular(path).ok()?;
    let mut bytes = Vec::new();
    file.take(limit).read_to_end(&mut bytes).ok()?;
    Some(bytes)
}

/// Header check on the first bytes only, so listing a folder stays fast.
pub(crate) fn is_page_file(path: &Path) -> bool {
    read_prefix(path, 64).is_some_and(|start| PageFile::looks_like_page(&start))
}

/// Writes next to the target and renames over it, so a crash never leaves a
/// half-written file.
pub(crate) fn write_atomically(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut temp = tempfile::Builder::new()
        .prefix(TEMP_PREFIX)
        .suffix(TEMP_SUFFIX)
        .tempfile_in(parent_of(path)?)?;
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    temp.persist(path).map_err(|error| error.error)?;
    Ok(())
}

/// Publishes a complete new file without ever replacing a competing file or link.
pub(crate) fn write_new_atomically(path: &Path, bytes: &[u8]) -> io::Result<()> {
    copy_new_atomically(path, &mut &bytes[..])
}

pub(crate) fn copy_new_atomically(path: &Path, source: &mut impl Read) -> io::Result<()> {
    let mut temp = tempfile::Builder::new()
        .prefix(TEMP_PREFIX)
        .tempfile_in(parent_of(path)?)?;
    io::copy(source, &mut temp)?;
    temp.as_file().sync_all()?;
    temp.persist_noclobber(path).map_err(|error| error.error)?;
    Ok(())
}

fn parent_of(path: &Path) -> io::Result<&Path> {
    path.parent()
        .ok_or_else(|| io::Error::other("missing parent directory"))
}
