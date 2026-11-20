//! Operations that change more than one page file: moving and deleting pages, attachments, and
//! where a file link points to.

mod attachments;
mod conversion;
mod delete;
mod file_links;
mod own_password;
mod page_move;
mod policy;
mod store;

pub use attachments::{Attachment, AttachmentRename};
pub use file_links::{Referenced, is_image};
pub use own_password::Protected;
pub use page_move::MoveReport;
pub use policy::{is_executable, is_openable_url};
