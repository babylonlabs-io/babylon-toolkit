//! Error types for vault operations

use thiserror::Error;

/// Errors that can occur during vault operations
#[derive(Error, Debug)]
pub enum Error {
    #[error("Invalid transaction: {0}")]
    InvalidTransaction(String),

    #[error("Invalid public key: {0}")]
    InvalidPublicKey(String),

    #[error("Invalid network: {0}")]
    InvalidNetwork(String),

    #[error("Connector error: {0}")]
    ConnectorError(String),
}
