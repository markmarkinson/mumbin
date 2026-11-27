//! What the program knows between two commands: the open notebook with its
//! index, the vault key, the keys of pages with their own password and the read-only switch.

use std::ops::Deref;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use mumbin_core::crypto::{Keys, PageKey, PageKeys, Vault};
use mumbin_core::{Index, Notebook, NotebookError, PageName};

use crate::error::{CommandError, CommandResult};
use crate::notebook_lock::{self, NotebookLock};
use crate::private_files::PrivateFiles;

/// How long an index is reused without looking at the disk again. Bursts of
/// commands (opening a page asks for several things) share one index.
const INDEX_FRESH_FOR: Duration = Duration::from_millis(400);

struct Open {
    notebook: Notebook,
    lock: NotebookLock,
    index: Option<Arc<Index>>,
    built: Instant,
    stale: bool,
}

/// The notebook shown in the window, if any, with its index.
#[derive(Default)]
pub struct AppState {
    open: Mutex<Option<Open>>,
    /// Keeps the notebook and key snapshots of one command consistent.
    operations: Mutex<()>,
    /// "Read only" mode: nothing in the notebook may be changed, whatever the webview asks.
    read_only: AtomicBool,
    /// The master key while the notebook's vault is open; never written anywhere.
    vault: Mutex<Option<Arc<Vault>>>,
    /// The keys of the pages with a password of their own that are open, by page name.
    page_keys: Mutex<PageKeys>,
    /// File that opens the most recent export, for "show the result".
    last_export: Mutex<Option<PathBuf>>,
    /// Plain copies of encrypted files the person asked to open or print.
    pub(crate) private_files: PrivateFiles,
}

/// A panic in another command must not take every later command down with it.
pub(crate) fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// One command at work. Commands run one at a time, and state is reached through
/// the guard (it derefs to [`AppState`]).
pub struct Operation<'a> {
    state: &'a AppState,
    _turn: MutexGuard<'a, ()>,
}

impl Deref for Operation<'_> {
    type Target = AppState;

    fn deref(&self) -> &AppState {
        self.state
    }
}

/// The keys a command opens encrypted pages with, as they were when it started.
pub struct OpenKeys {
    vault: Option<Arc<Vault>>,
    pages: PageKeys,
}

impl OpenKeys {
    /// What the notebook operations take to read and write encrypted pages.
    pub fn keys(&self) -> Keys<'_> {
        Keys::new(self.vault.as_deref(), &self.pages)
    }

    pub fn page(&self, name: &PageName) -> Option<Arc<PageKey>> {
        self.pages.get(name).cloned()
    }
}

impl AppState {
    /// Starts a command that only reads.
    pub(crate) fn read(&self) -> Operation<'_> {
        Operation {
            state: self,
            _turn: locked(&self.operations),
        }
    }

    /// Starts a command that changes the notebook; refused in read-only mode.
    pub(crate) fn write(&self) -> CommandResult<Operation<'_>> {
        let operation = self.read();
        if self.read_only.load(Ordering::Relaxed) {
            return Err(CommandError::new("read-only", "the notebook is read only"));
        }
        Ok(operation)
    }

    pub(crate) fn is_read_only(&self) -> bool {
        self.read_only.load(Ordering::Relaxed)
    }

    pub(crate) fn set_read_only(&self, on: bool) {
        self.read_only.store(on, Ordering::Relaxed);
    }

    pub(crate) fn notebook(&self) -> CommandResult<Notebook> {
        locked(&self.open)
            .as_ref()
            .map(|open| open.notebook.clone())
            .ok_or_else(no_notebook)
    }

    /// Takes the notebook over for the window. Fails, and leaves the open
    /// notebook as it is, when another window already has it.
    pub(crate) fn open_notebook(&self, notebook: Notebook) -> CommandResult<()> {
        let same_notebook = locked(&self.open)
            .as_ref()
            .filter(|open| open.notebook.folder() == notebook.folder())
            .map(|open| open.lock.clone());
        let changing = same_notebook.is_none();
        let lock = match same_notebook {
            Some(lock) => lock,
            None => notebook_lock::acquire(notebook.folder())?,
        };
        if changing {
            // Another notebook has its own vault and pages: the keys of this one are forgotten.
            self.forget_vault();
            self.forget_page_keys();
        } else if let Some(vault) = self.vault() {
            // The same notebook opened again: a notebook that hides its file names gets its keys back.
            notebook.attach_vault(&vault);
        }
        *locked(&self.open) = Some(Open {
            notebook,
            lock,
            index: None,
            built: Instant::now(),
            stale: true,
        });
        Ok(())
    }

    /// Same notebook, changed configuration (`notebook.mumbin` was written).
    pub(crate) fn update_notebook(&self, notebook: Notebook) {
        if let Some(open) = locked(&self.open).as_mut() {
            open.notebook = notebook;
            open.index = None;
            open.stale = true;
        }
    }

    pub(crate) fn vault(&self) -> Option<Arc<Vault>> {
        locked(&self.vault).clone()
    }

    /// The vault and the page keys that are open now.
    pub(crate) fn open_keys(&self) -> OpenKeys {
        OpenKeys {
            vault: self.vault(),
            pages: locked(&self.page_keys).clone(),
        }
    }

    /// Keeps the key of a page that was opened with its password.
    pub(crate) fn unlock_page(&self, name: &PageName, key: Arc<PageKey>) {
        locked(&self.page_keys).insert(name, key);
        self.drop_index();
    }

    /// Forgets the key of one page and the plain copies made with any key.
    pub(crate) fn lock_page(&self, name: &PageName) {
        self.private_files.clear();
        locked(&self.page_keys).remove(name);
        self.drop_index();
    }

    /// Forgets the keys of all pages with a password of their own.
    pub(crate) fn forget_page_keys(&self) {
        self.private_files.clear();
        locked(&self.page_keys).clear();
        self.drop_index();
    }

    /// A page was moved or renamed: its key, and those of the pages below it, follow.
    pub(crate) fn relocate_page_keys(&self, from: &PageName, to: &PageName) {
        locked(&self.page_keys).relocate(from, to);
    }

    /// A page was deleted: its key and those of the pages below it are forgotten.
    pub(crate) fn forget_pages_within(&self, name: &PageName) {
        locked(&self.page_keys).remove_within(name);
    }

    /// The index is made again at the next question, so it holds no text its keys no longer open.
    fn drop_index(&self) {
        if let Some(open) = locked(&self.open).as_mut() {
            open.index = None;
            open.stale = true;
        }
    }

    /// The open vault, or the "locked" error a command shows when there is none.
    pub(crate) fn require_vault(&self) -> Result<Arc<Vault>, NotebookError> {
        self.vault().ok_or(NotebookError::Locked)
    }

    /// Keeps the master key of the notebook while the vault is open.
    pub(crate) fn unlock_vault(&self, vault: Vault) {
        self.replace_vault(Some(&Arc::new(vault)));
    }

    /// Forgets the key and the plain copies made with it.
    pub(crate) fn forget_vault(&self) {
        self.private_files.clear();
        self.replace_vault(None);
    }

    /// What the index holds of encrypted pages is dropped, so text read with the key does
    /// not outlive it.
    fn replace_vault(&self, vault: Option<&Arc<Vault>>) {
        *locked(&self.vault) = vault.cloned();
        if let Some(open) = locked(&self.open).as_mut() {
            // A notebook that hides its file names can only be listed while its vault is open.
            match vault {
                Some(vault) => open.notebook.attach_vault(vault),
                None => open.notebook.detach_vault(),
            }
            open.index = None;
            open.stale = true;
        }
    }

    /// Marks the index as outdated after a change made through this app.
    pub(crate) fn touch(&self) {
        if let Some(open) = locked(&self.open).as_mut() {
            open.stale = true;
        }
    }

    /// Current index. Rebuilding only reads files that changed on disk.
    pub(crate) fn index(&self) -> CommandResult<Arc<Index>> {
        let (notebook, previous) = {
            let guard = locked(&self.open);
            let open = guard.as_ref().ok_or_else(no_notebook)?;
            if let Some(index) = &open.index
                && !open.stale
                && open.built.elapsed() < INDEX_FRESH_FOR
            {
                return Ok(index.clone());
            }
            (open.notebook.clone(), open.index.clone())
        };
        // Built without holding the lock; file access may take a moment.
        let keys = self.open_keys();
        let index = Arc::new(Index::build_with(
            &notebook,
            previous.as_deref(),
            keys.keys(),
        )?);
        if let Some(open) = locked(&self.open).as_mut()
            && open.notebook.folder() == notebook.folder()
        {
            open.index = Some(index.clone());
            open.built = Instant::now();
            open.stale = false;
        }
        Ok(index)
    }

    pub(crate) fn last_export(&self) -> Option<PathBuf> {
        locked(&self.last_export).clone()
    }

    pub(crate) fn set_last_export(&self, entry: PathBuf) {
        *locked(&self.last_export) = Some(entry);
    }
}

fn no_notebook() -> CommandError {
    CommandError::new("no-notebook", "no notebook is open")
}
