//! Mumbin core: notebook storage, wiki format, index and search.
//!
//! This crate has no UI dependency. The desktop shell in `src-tauri` exposes
//! it to the webview; tests exercise it directly on temporary notebooks.

pub mod crypto;
pub mod export;
pub mod index;
pub mod ini;
pub mod links;
mod markup;
pub mod notebook;
pub mod ops;
pub mod pagefile;
pub mod pagename;
pub mod scan;
pub mod search;
pub mod tasks;
pub mod template;
#[cfg(test)]
mod test_support;

pub use index::Index;
pub use notebook::{Expect, FileStamp, LoadedPage, Notebook, NotebookError, PageInfo, SaveOutcome};
pub use pagename::{PageName, PageNameError};

/// Version of the core crate, shown in the about dialog.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
