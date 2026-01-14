//! PeginPayoutConnector - Connector for Payout and PayoutOptimistic transactions
//!
//! This is the ONLY connector exposed publicly. It creates the taproot script
//! for the first output of PegIn transactions.

use super::{build_multisig_script, combine_script_components, Connector};
use crate::UNSPENDABLE_PUBKEY;
use bitcoin::key::XOnlyPublicKey;
use bitcoin::secp256k1::Secp256k1;
use bitcoin::taproot::{LeafVersion, TapNodeHash, TaprootBuilder, TaprootSpendInfo};
use bitcoin::ScriptBuf;
use bitcoin_script::script;

/// Represents the connector from the first output of PegIn to either
/// a PayoutOptimistic transaction or Payout transaction.
///
/// Script structure:
/// - Depositor must sign (CHECKSIGVERIFY)
/// - Vault Provider must sign (CHECKSIGVERIFY)
/// - All Vault Keepers must sign (N-of-N multisig)
/// - All Universal Challengers must sign (combined with VKs for (N+M)-of-(N+M))
#[derive(Clone, Debug)]
pub struct PeginPayoutConnector {
    pub depositor: XOnlyPublicKey,
    pub vault_provider: XOnlyPublicKey,
    pub vault_keepers: Vec<XOnlyPublicKey>,
    pub universal_challengers: Vec<XOnlyPublicKey>,
}

impl PeginPayoutConnector {
    /// Constructs a new instance of [`PeginPayoutConnector`].
    ///
    /// # Errors
    ///
    /// Returns an error if vault_keepers vector is empty.
    pub fn new(
        depositor: XOnlyPublicKey,
        vault_provider: XOnlyPublicKey,
        vault_keepers: Vec<XOnlyPublicKey>,
        universal_challengers: Vec<XOnlyPublicKey>,
    ) -> Result<Self, &'static str> {
        if vault_keepers.is_empty() {
            return Err("At least one vault keeper is required");
        }

        Ok(Self {
            depositor,
            vault_provider,
            vault_keepers,
            universal_challengers,
        })
    }

    /// Generates the pegin payout script.
    ///
    /// Script structure:
    /// - <Depositor> OP_CHECKSIGVERIFY
    /// - <VaultProvider> OP_CHECKSIGVERIFY
    /// - <VaultKeeper_0> OP_CHECKSIG <VaultKeeper_1> OP_CHECKSIGADD ... <VaultKeeper_N> OP_CHECKSIGADD
    /// - <UC_0> OP_CHECKSIGADD <UC_1> OP_CHECKSIGADD ... <UC_M> OP_CHECKSIGADD
    /// - <N+M> OP_NUMEQUAL (enforcing (N+M)-of-(N+M) multisig for vault keepers + UCs)
    pub fn generate_payout_script(&self) -> ScriptBuf {
        // Build role signatures (depositor and vault provider must sign)
        let role_sigs = script! {
            { self.depositor }
            OP_CHECKSIGVERIFY
            { self.vault_provider }
            OP_CHECKSIGVERIFY
        }
        .compile()
        .to_bytes();

        // Merge vault keepers and universal challengers for the multisig
        let mut all_challengers = self.vault_keepers.clone();
        all_challengers.extend_from_slice(&self.universal_challengers);

        // Build combined multisig ((N+M)-of-(N+M), uses OP_NUMEQUAL)
        let challenger_multisig = build_multisig_script(&all_challengers, false)
            .expect("Failed to build challenger multisig script");

        // Combine all components
        combine_script_components(vec![role_sigs, challenger_multisig])
    }

    /// Generates the taproot script hash for the pegin payout script.
    pub fn generate_taproot_script_hash(&self) -> TapNodeHash {
        let payout_script = self.generate_payout_script();
        TapNodeHash::from_script(&payout_script, LeafVersion::TapScript)
    }
}

impl Connector for PeginPayoutConnector {
    fn generate_taproot_spend_info(&self) -> TaprootSpendInfo {
        let secp = Secp256k1::new();
        let payout_script = self.generate_payout_script();
        let unspendable_pubkey = *UNSPENDABLE_PUBKEY;

        TaprootBuilder::new()
            .add_leaf(0, payout_script)
            .expect("Failed to add payout script leaf")
            .finalize(&secp, unspendable_pubkey)
            .expect("Failed to create taproot spend info")
    }
}
