//! Transaction types for vault operations
//!
//! This module contains only the PegIn transaction which is safe to expose publicly.
//! No other transaction types (Claim, Assert, Challenge, etc.) are included.

mod pegin;

pub use pegin::{PegInParams, PeginTx};
