//! WASM bindings for vault operations
//!
//! This module exposes ONLY the following to JavaScript:
//! - WasmPeginTx - Create unfunded peg-in transactions
//! - WasmPeginPayoutConnector - Create payout scripts
//!
//! NO other vault internals are exposed.

use crate::connectors::{Connector, PeginPayoutConnector};
use crate::transactions::{PegInParams, PeginTx};
use bitcoin::key::XOnlyPublicKey;
use bitcoin::Network;
use std::str::FromStr;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

// ==================== WasmPeginTx ====================

/// WASM wrapper for creating unfunded PegIn transactions
#[wasm_bindgen]
pub struct WasmPeginTx {
    inner: bitcoin::Transaction,
}

#[wasm_bindgen]
impl WasmPeginTx {
    /// Create a new unfunded PegIn transaction
    ///
    /// # Arguments
    /// * `depositor_pubkey` - Depositor's x-only public key (64 hex chars)
    /// * `vault_provider_pubkey` - Vault provider's x-only public key (64 hex chars)
    /// * `vault_keeper_pubkeys` - Array of vault keeper x-only public keys
    /// * `universal_challenger_pubkeys` - Array of universal challenger x-only public keys
    /// * `pegin_amount` - Amount in satoshis
    /// * `network` - Network ("mainnet", "testnet", "regtest", "signet")
    #[wasm_bindgen(constructor)]
    pub fn new(
        depositor_pubkey: String,
        vault_provider_pubkey: String,
        vault_keeper_pubkeys: Vec<String>,
        universal_challenger_pubkeys: Vec<String>,
        pegin_amount: u64,
        network: String,
    ) -> Result<WasmPeginTx, JsValue> {
        let params = PegInParams {
            depositor_pubkey,
            vault_provider_pubkey,
            vault_keeper_pubkeys,
            universal_challenger_pubkeys,
            pegin_amount,
            network,
        };

        let inner = PeginTx::new_unfunded_peg_in_tx(params)
            .map_err(|e| JsValue::from_str(&format!("PegIn error: {}", e)))?;

        Ok(WasmPeginTx { inner })
    }

    /// Get the transaction as hex
    #[wasm_bindgen(js_name = toHex)]
    pub fn to_hex(&self) -> String {
        hex::encode(bitcoin::consensus::serialize(&self.inner))
    }

    /// Get the transaction ID
    #[wasm_bindgen(js_name = getTxid)]
    pub fn get_txid(&self) -> String {
        self.inner.compute_txid().to_string()
    }

    /// Get the vault output's script pubkey
    #[wasm_bindgen(js_name = getVaultScriptPubKey)]
    pub fn get_vault_script_pubkey(&self) -> String {
        hex::encode(self.inner.output[0].script_pubkey.as_bytes())
    }

    /// Get the vault output's value in satoshis
    #[wasm_bindgen(js_name = getVaultValue)]
    pub fn get_vault_value(&self) -> u64 {
        self.inner.output[0].value.to_sat()
    }
}

// ==================== WasmPeginPayoutConnector ====================

/// WASM wrapper for PeginPayoutConnector
///
/// Used to generate payout scripts for signing Payout and PayoutOptimistic transactions
#[wasm_bindgen]
pub struct WasmPeginPayoutConnector {
    inner: PeginPayoutConnector,
}

#[wasm_bindgen]
impl WasmPeginPayoutConnector {
    /// Create a new PeginPayoutConnector
    ///
    /// # Arguments
    /// * `depositor` - Depositor's x-only public key (64 hex chars)
    /// * `vault_provider` - Vault provider's x-only public key (64 hex chars)
    /// * `vault_keepers` - Array of vault keeper x-only public keys
    /// * `universal_challengers` - Array of universal challenger x-only public keys
    #[wasm_bindgen(constructor)]
    pub fn new(
        depositor: String,
        vault_provider: String,
        vault_keepers: Vec<String>,
        universal_challengers: Vec<String>,
    ) -> Result<WasmPeginPayoutConnector, JsValue> {
        let depositor_pubkey = parse_pubkey(&depositor)?;
        let vault_provider_pubkey = parse_pubkey(&vault_provider)?;
        let vault_keeper_pubkeys = parse_pubkeys(vault_keepers)?;
        let universal_challenger_pubkeys = parse_pubkeys(universal_challengers)?;

        let inner = PeginPayoutConnector::new(
            depositor_pubkey,
            vault_provider_pubkey,
            vault_keeper_pubkeys,
            universal_challenger_pubkeys,
        )
        .map_err(|e| JsValue::from_str(&format!("PeginPayoutConnector error: {}", e)))?;

        Ok(WasmPeginPayoutConnector { inner })
    }

    /// Get the taproot address for this connector
    #[wasm_bindgen(js_name = getAddress)]
    pub fn get_address(&self, network: String) -> Result<String, JsValue> {
        let net = parse_network(&network)?;
        Ok(self.inner.generate_taproot_address(net).to_string())
    }

    /// Get the script pubkey for this connector
    #[wasm_bindgen(js_name = getScriptPubKey)]
    pub fn get_script_pubkey(&self, network: String) -> Result<String, JsValue> {
        let net = parse_network(&network)?;
        Ok(hex::encode(
            self.inner.generate_taproot_script_pubkey(net).as_bytes(),
        ))
    }

    /// Get the payout script (tap leaf script)
    #[wasm_bindgen(js_name = getPayoutScript)]
    pub fn get_payout_script(&self) -> String {
        hex::encode(self.inner.generate_payout_script().as_bytes())
    }

    /// Get the taproot script hash (for sighash computation)
    #[wasm_bindgen(js_name = getTaprootScriptHash)]
    pub fn get_taproot_script_hash(&self) -> String {
        self.inner.generate_taproot_script_hash().to_string()
    }
}

// ==================== Helper Functions ====================

fn parse_network(network: &str) -> Result<Network, JsValue> {
    match network.to_lowercase().as_str() {
        "mainnet" | "bitcoin" => Ok(Network::Bitcoin),
        "testnet" => Ok(Network::Testnet),
        "regtest" => Ok(Network::Regtest),
        "signet" => Ok(Network::Signet),
        _ => Err(JsValue::from_str(&format!("Invalid network: {}", network))),
    }
}

fn parse_pubkey(pubkey_hex: &str) -> Result<XOnlyPublicKey, JsValue> {
    XOnlyPublicKey::from_str(pubkey_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid public key: {}", e)))
}

fn parse_pubkeys(pubkeys: Vec<String>) -> Result<Vec<XOnlyPublicKey>, JsValue> {
    pubkeys
        .into_iter()
        .map(|pk| parse_pubkey(pk.as_str()))
        .collect()
}
