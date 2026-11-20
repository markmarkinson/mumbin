//! The vault of a notebook: making it, opening it, changing its passphrase, and converting pages.

use super::files::write_new_atomically;
use super::{Notebook, NotebookError};
use crate::crypto::{
    CryptoError, KdfParams, VAULT_FILE, Vault, VaultFile, read_vault_file, write_vault_backup,
    write_vault_file,
};

/// How many pages a bulk change touched, and which it could not change.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct BulkReport {
    pub changed: usize,
    pub failed: Vec<String>,
}

impl Notebook {
    /// The notebook has a vault, that is, it can hold encrypted pages.
    pub fn has_vault(&self) -> Result<bool, NotebookError> {
        Ok(read_vault_file(&self.folder)?.is_some())
    }

    /// Makes a vault for the notebook and returns it open. A notebook has one vault.
    pub fn create_vault(
        &self,
        passphrase: &str,
        params: KdfParams,
    ) -> Result<Vault, NotebookError> {
        self.make_vault(passphrase, params, false)
    }

    /// Makes the vault of a notebook that hides its file names too, and returns it open. Only
    /// a notebook without pages can be made so: its files would have to be renamed.
    pub fn create_sealed_vault(
        &self,
        passphrase: &str,
        params: KdfParams,
    ) -> Result<Vault, NotebookError> {
        self.make_vault(passphrase, params, true)
    }

    fn make_vault(
        &self,
        passphrase: &str,
        params: KdfParams,
        sealed_names: bool,
    ) -> Result<Vault, NotebookError> {
        let path = self.folder.join(VAULT_FILE);
        if self.has_vault()? {
            return Err(NotebookError::AlreadyExists(path));
        }
        if sealed_names && !self.all_pages()?.is_empty() {
            return Err(NotebookError::invalid(
                "only a notebook without pages can hide its file names",
            ));
        }
        let (vault, mut file) = Vault::create(passphrase, params)?;
        file.sealed_names = sealed_names;
        self.check_path(&path)?;
        let text = serde_json::to_vec_pretty(&file).map_err(std::io::Error::other)?;
        write_new_atomically(&path, &text)?;
        write_vault_backup(&self.folder, &file)?;
        if sealed_names {
            self.layout.mark_sealed();
            self.attach_vault(&vault);
        }
        Ok(vault)
    }

    /// Opens the vault of the notebook with its passphrase.
    pub fn unlock_vault(&self, passphrase: &str) -> Result<Vault, NotebookError> {
        self.unlock_vault_file(passphrase).map(|(vault, _)| vault)
    }

    fn unlock_vault_file(&self, passphrase: &str) -> Result<(Vault, VaultFile), NotebookError> {
        let file = read_vault_file(&self.folder)?.ok_or(CryptoError::NoVault)?;
        let vault = Vault::unlock(&file, passphrase)?;
        // A notebook that hides its file names can be listed from now on.
        self.attach_vault(&vault);
        Ok((vault, file))
    }

    /// Changes the passphrase; the contents stay as they are. The old passphrase must be right.
    pub fn change_passphrase(
        &self,
        old_passphrase: &str,
        new_passphrase: &str,
        params: KdfParams,
    ) -> Result<(), NotebookError> {
        let (vault, old_file) = self.unlock_vault_file(old_passphrase)?;
        let mut file = vault.wrap(new_passphrase, params)?;
        file.sealed_names = old_file.sealed_names;
        write_vault_file(&self.folder, &file)?;
        Ok(())
    }

    /// Encrypts (`encrypt`) or decrypts every page of the notebook. A page that
    /// cannot be changed is named in the report; the others are done.
    pub fn convert_all_pages(
        &self,
        vault: &Vault,
        encrypt: bool,
    ) -> Result<BulkReport, NotebookError> {
        let mut report = BulkReport::default();
        for page in self
            .all_pages()?
            .into_iter()
            .filter(|page| page.has_content)
        {
            let outcome = self
                .read_page_with(&page.name, Some(vault))
                .and_then(|loaded| {
                    // A page with a password of its own is not the vault's to change.
                    let Some(loaded) = loaded.filter(|loaded| !loaded.own_password) else {
                        return Ok(false);
                    };
                    // Retry attachment conversion even if a previous attempt
                    // changed the page before failing on an attachment.
                    self.set_page_encrypted(&page.name, vault, encrypt)?;
                    Ok(loaded.encrypted != encrypt)
                });
            match outcome {
                Ok(true) => report.changed += 1,
                Ok(false) => {}
                Err(_) => report.failed.push(page.name.to_string()),
            }
        }
        Ok(report)
    }
}
