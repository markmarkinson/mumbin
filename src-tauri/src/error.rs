//! The error the webview receives: a stable code it translates, plus the
//! technical message for the log.

use std::fmt::Display;

use mumbin_core::crypto::CryptoError;
use mumbin_core::{NotebookError, PageNameError};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CommandError {
    code: &'static str,
    message: String,
}

pub(crate) type CommandResult<T> = Result<T, CommandError>;

impl CommandError {
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        CommandError {
            code,
            message: message.into(),
        }
    }

    /// A failure of the operating system that has no code of its own.
    pub(crate) fn io(error: impl Display) -> Self {
        Self::new("io", error.to_string())
    }

    pub(crate) fn code(&self) -> &'static str {
        self.code
    }
}

impl From<NotebookError> for CommandError {
    fn from(error: NotebookError) -> Self {
        let code = match &error {
            NotebookError::Io(io) => match io.kind() {
                std::io::ErrorKind::NotFound => "not-found",
                std::io::ErrorKind::InvalidInput => "invalid-move",
                std::io::ErrorKind::PermissionDenied => "denied",
                _ => "io",
            },
            NotebookError::Name(_) | NotebookError::RootHasNoPage => "invalid-name",
            NotebookError::FolderMissing(_) => "folder-missing",
            NotebookError::AlreadyExists(path) if path.extension().is_some() => "page-exists",
            NotebookError::AlreadyExists(_) => "notebook-exists",
            NotebookError::NotAPage(_) => "not-a-page",
            NotebookError::NotText(_) => "not-text",
            NotebookError::Conflict => "conflict",
            NotebookError::TooLarge(_) => "too-large",
            NotebookError::Locked => "locked",
            NotebookError::Crypto(CryptoError::WrongPassphrase) => "wrong-passphrase",
            NotebookError::Crypto(CryptoError::NoVault) => "no-vault",
            NotebookError::Crypto(CryptoError::Corrupt(_)) => "corrupt-encrypted",
            NotebookError::Crypto(_) => "crypto",
        };
        CommandError::new(code, error.to_string())
    }
}

impl From<PageNameError> for CommandError {
    fn from(error: PageNameError) -> Self {
        CommandError::new("invalid-name", error.to_string())
    }
}

/// Same codes as a notebook's own I/O errors (`not-found`, `denied`, ...).
impl From<std::io::Error> for CommandError {
    fn from(error: std::io::Error) -> Self {
        NotebookError::from(error).into()
    }
}
