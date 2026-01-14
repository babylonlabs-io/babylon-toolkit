//! PegIn transaction - Creates the initial deposit transaction
//!
//! This is the ONLY transaction type exposed publicly. It creates an unfunded
//! transaction that sends BTC to a vault-controlled taproot address.

use crate::connectors::{Connector, PeginPayoutConnector};
use crate::error::Error;
use bitcoin::key::XOnlyPublicKey;
use bitcoin::{Amount, Network, Transaction, TxOut};
use std::str::FromStr;

/// Parameters for creating a PegIn transaction from string-based inputs.
#[derive(Debug, Clone)]
pub struct PegInParams {
    pub depositor_pubkey: String,
    pub vault_provider_pubkey: String,
    pub vault_keeper_pubkeys: Vec<String>,
    pub universal_challenger_pubkeys: Vec<String>,
    pub pegin_amount: u64,
    pub network: String,
}

/// Represents a PegIn transaction that moves BTC into a vault-controlled taproot output.
pub struct PeginTx;

impl PeginTx {
    /// Creates an unfunded PegIn transaction with a single pegin output.
    ///
    /// This function creates a Bitcoin transaction with no inputs and a single output
    /// that sends funds to a vault-controlled Taproot address. The transaction will
    /// be funded separately by a wallet.
    ///
    /// # Arguments
    ///
    /// * `params` - A [`PegInParams`] struct containing string-based parameters
    ///
    /// # Returns
    ///
    /// Returns an unsigned [`Transaction`] with no inputs and a single output to the
    /// vault Taproot address.
    pub fn new_unfunded_peg_in_tx(params: PegInParams) -> Result<Transaction, Error> {
        // Parse network
        let network = Self::parse_network(&params.network)?;

        // Parse public keys
        let depositor = Self::parse_pubkey(&params.depositor_pubkey)?;
        let vault_provider = Self::parse_pubkey(&params.vault_provider_pubkey)?;

        let vault_keepers: Result<Vec<XOnlyPublicKey>, Error> = params
            .vault_keeper_pubkeys
            .iter()
            .map(|pk| Self::parse_pubkey(pk))
            .collect();
        let vault_keepers = vault_keepers?;

        let universal_challengers: Result<Vec<XOnlyPublicKey>, Error> = params
            .universal_challenger_pubkeys
            .iter()
            .map(|pk| Self::parse_pubkey(pk))
            .collect();
        let universal_challengers = universal_challengers?;

        // Create connector
        let connector =
            PeginPayoutConnector::new(depositor, vault_provider, vault_keepers, universal_challengers)
                .map_err(|e| Error::ConnectorError(e.to_string()))?;

        // Create output
        let output = TxOut {
            value: Amount::from_sat(params.pegin_amount),
            script_pubkey: connector.generate_taproot_script_pubkey(network),
        };

        // Create transaction with no inputs (to be funded by wallet)
        let tx = Transaction {
            version: bitcoin::transaction::Version::TWO,
            lock_time: bitcoin::absolute::LockTime::ZERO,
            input: vec![],
            output: vec![output],
        };

        Ok(tx)
    }

    fn parse_network(network: &str) -> Result<Network, Error> {
        match network.to_lowercase().as_str() {
            "bitcoin" | "mainnet" => Ok(Network::Bitcoin),
            "testnet" => Ok(Network::Testnet),
            "regtest" => Ok(Network::Regtest),
            "signet" => Ok(Network::Signet),
            _ => Err(Error::InvalidNetwork(network.to_string())),
        }
    }

    fn parse_pubkey(hex: &str) -> Result<XOnlyPublicKey, Error> {
        XOnlyPublicKey::from_str(hex)
            .map_err(|e| Error::InvalidPublicKey(format!("{}: {}", hex, e)))
    }
}
