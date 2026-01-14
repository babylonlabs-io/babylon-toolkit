//! Babylon Vault WASM - Minimal WASM bindings for BTC vault operations
//!
//! This crate provides WASM bindings for creating PegIn transactions and
//! PeginPayoutConnector scripts. It intentionally excludes all other vault
//! transaction types (Claim, Assert, Challenge, etc.) and the transaction graph.
//!
//! ## What's Included (Safe to Expose)
//!
//! - `WasmPeginTx` - Create unfunded peg-in transactions
//! - `WasmPeginPayoutConnector` - Create payout scripts for signing
//!
//! ## What's NOT Included (Confidential)
//!
//! - Transaction graph (`tx_graphs`)
//! - Claim transactions
//! - Assert transactions
//! - Challenge transactions
//! - Setup transactions
//! - Any other internal vault logic

pub mod connectors;
pub mod error;
pub mod transactions;
pub mod wasm;

use bitcoin::key::XOnlyPublicKey;
use std::str::FromStr;
use std::sync::LazyLock;

/// Unspendable public key string used for Taproot internal key
pub const UNSPENDABLE_PUBKEY_STR: &str =
    "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0";

/// Unspendable public key used for Taproot internal key in covenant transactions
pub static UNSPENDABLE_PUBKEY: LazyLock<XOnlyPublicKey> = LazyLock::new(|| {
    XOnlyPublicKey::from_str(UNSPENDABLE_PUBKEY_STR).expect("Static value must be correct")
});
