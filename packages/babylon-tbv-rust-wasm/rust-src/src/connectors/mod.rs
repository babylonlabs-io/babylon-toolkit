//! Connector types for vault transactions
//!
//! This module contains only the PeginPayoutConnector which is safe to expose publicly.
//! No other transaction graph connectors are included.

mod pegin_payout;

pub use pegin_payout::PeginPayoutConnector;

use bitcoin::key::XOnlyPublicKey;
use bitcoin::taproot::TaprootSpendInfo;
use bitcoin::{Address, Network, ScriptBuf};
use bitcoin_script::script;

/// Trait for connectors that can generate taproot spend info
pub trait Connector {
    fn generate_taproot_spend_info(&self) -> TaprootSpendInfo;

    fn generate_taproot_address(&self, network: Network) -> Address {
        Address::p2tr_tweaked(
            self.generate_taproot_spend_info().output_key(),
            network,
        )
    }

    fn generate_taproot_script_pubkey(&self, network: Network) -> ScriptBuf {
        self.generate_taproot_address(network).script_pubkey()
    }
}

/// Build an (N-of-N) multisig script using CHECKSIGADD
///
/// Script structure:
/// - <PubKey_0> OP_CHECKSIG
/// - <PubKey_1> OP_CHECKSIGADD ... <PubKey_N> OP_CHECKSIGADD
/// - <N> OP_NUMEQUAL (or OP_NUMEQUALVERIFY if verify=true)
pub fn build_multisig_script(
    pubkeys: &[XOnlyPublicKey],
    verify: bool,
) -> Result<Vec<u8>, &'static str> {
    if pubkeys.is_empty() {
        return Err("At least one public key is required for multisig");
    }

    let n = pubkeys.len();

    // First key uses OP_CHECKSIG
    let mut script_bytes = script! {
        { pubkeys[0] }
        OP_CHECKSIG
    }
    .compile()
    .to_bytes();

    // Remaining keys use OP_CHECKSIGADD
    for pk in pubkeys.iter().skip(1) {
        let add_script = script! {
            { *pk }
            OP_CHECKSIGADD
        }
        .compile()
        .to_bytes();
        script_bytes.extend(add_script);
    }

    // Add threshold check
    let threshold_script = if verify {
        script! {
            { n as i64 }
            OP_NUMEQUALVERIFY
        }
    } else {
        script! {
            { n as i64 }
            OP_NUMEQUAL
        }
    }
    .compile()
    .to_bytes();
    script_bytes.extend(threshold_script);

    Ok(script_bytes)
}

/// Combine multiple script components into a single script
pub fn combine_script_components(components: Vec<Vec<u8>>) -> ScriptBuf {
    let mut combined = Vec::new();
    for component in components {
        combined.extend(component);
    }
    ScriptBuf::from_bytes(combined)
}
