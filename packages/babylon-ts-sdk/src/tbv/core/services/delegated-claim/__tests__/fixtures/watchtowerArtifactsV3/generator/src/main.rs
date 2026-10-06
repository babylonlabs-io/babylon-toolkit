//! One-off generator for babylon-toolkit's graph-v3 delegated-claim fixture.
//!
//! Replays btc-vault's `test_depositor_claimer_graph_for_depositor` and
//! `DelegatedClaimFixture::new` (crates/vault/src/test_utils.rs @ b534ff9e)
//! with `vault_core_version = 3`, runs btc-vault's own artifacts builder and
//! verifier over the result, and writes `fixture.json` next to Cargo.toml.

use std::collections::{BTreeMap, HashMap};
use std::num::NonZeroU16;

use bitcoin::hashes::{Hash as _, sha256};
use bitcoin::key::XOnlyPublicKey;
use bitcoin::secp256k1::schnorr::Signature as SchnorrSignature;
use bitcoin::{Network, Transaction, Txid};
use btc_vault::connectors::{Bip86KeyConnector, Connector, dummy_pubkey_seeded};
use btc_vault::delegated_claim::{
    ArtifactsError, WatchtowerArtifactsInputs, build_watchtower_artifacts,
    verify_watchtower_artifacts,
};
use btc_vault::sign::{
    SECP, compute_assert_claimer_sighashes, compute_claim_depositor_sighash,
    compute_payout_claimer_sighash, compute_wrongly_challenged_claimer_sighashes,
    finalize_claim_tx,
};
use btc_vault::test_utils::{
    DELEGATED_CLAIM_FIXTURE_BLOCK_NUMBER, DELEGATED_CLAIM_FIXTURE_CIRCUIT_VERSION,
    DELEGATED_CLAIM_FIXTURE_SESSION_HEX, TEST_DEPOSITOR_CLAIMER_SEED, dummy_keypair_seeded,
    presign_test_depositor_claimer_graph, sign_depositor_payout_sig,
    test_depositor_claimer_wots_keypairs,
};
use btc_vault::transactions::{
    ClaimParams, ClaimTx, HtlcParams, PegInParams, PegInTx, PrePegInParams, PrePegInTx,
    depositor_claim_funding_outpoint,
};
use btc_vault::{
    ACTIVE_VAULT_CORE_VERSION, ChallengerGCData, GcWotsPublicKeyBlocks, NUM_FINALIZED_INSTANCES,
    P2A_ANCHOR_VALUE, SecurityCouncil, Sha256, TxGraph, TxGraphConfig, TxGraphParams,
    UniversalChallengers, VaultKeepers, WotsBlockSecretKey, WotsPublicKeyBlocks,
};
use btc_vault_crypto::wots::protocol::small_block_specs;
use rand::SeedableRng as _;
use rand_chacha::ChaCha20Rng;
use serde_json::{Value, json};
use sha3::{Digest as _, Keccak256};

const BTC_VAULT_REV: &str = "b534ff9e846d93367fbaabe0f54517db200326fd";

/// The graph version the delegated-claim surface exists for.
const TX_GRAPH_VERSION: u16 = 3;

/// Sepolia; the value btc-vault's own marker test stamps (tx_graph/graph.rs:2292).
const SETTLEMENT_CHAIN_ID: u64 = 11_155_111;

// Party seeds, identical to test_depositor_claimer_graph_for_depositor.
const VAULT_PROVIDER_SEED: u8 = 2;
const VAULT_KEEPER_SEEDS: [u8; 2] = [3, 4];
const UNIVERSAL_CHALLENGER_SEEDS: [u8; 1] = [5];
const COUNCIL_SEEDS: [u8; 2] = [10, 11];
const COUNCIL_QUORUM: usize = 2;

// Values, identical to test_depositor_claimer_graph_for_depositor except that
// the HTLC also funds the v3 P2A anchor so the baked PegIn fee stays 1 000.
const PEGIN_AMOUNT: u64 = 100_000_000;
const DEPOSITOR_CLAIM_VALUE: u64 = 1_000_000;
const PEGIN_TX_FEE: u64 = 1_000;
const HASHLOCK_BYTE: u8 = 0xaa;
const TIMELOCK_REFUND: u16 = 144;

/// Seed for the per-challenger garbled-circuit WOTS keys. btc-vault's recipe
/// draws them from `thread_rng`; a fixed ChaCha20 seed keeps them stable.
const GC_WOTS_SEED: [u8; 32] = [0x6c; 32];

/// Hardhat account #1, the address the SDK's vaultIdBinding tests already use.
const DEPOSITOR_ETH_ADDRESS: &str = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

/// Copied verbatim from btc-vault crates/vault/src/delegated_claim.rs:1273
/// (test module, not public): a well-formed compressed Groth16 verifying key
/// built from BN254 generator points. Passes the builder's structural check,
/// verifies no proof.
const GENERATOR_VERIFYING_KEY_HEX: &str = "0100000000000000000000000000000000000000000000000000000000000000edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e19edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e19edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1901000000000000000100000000000000000000000000000000000000000000000000000000000000";

struct ClaimerSignatures {
    signed_claim: Transaction,
    assert_claimer_sig: SchnorrSignature,
    payout_claimer_sig: SchnorrSignature,
    depositor_payout_sig: SchnorrSignature,
    wrongly_challenged_sigs: HashMap<XOnlyPublicKey, Vec<SchnorrSignature>>,
}

fn main() {
    assert_eq!(
        TX_GRAPH_VERSION, ACTIVE_VAULT_CORE_VERSION,
        "btc-vault's active Core version moved; re-check the v3 recipe"
    );
    self_test_vault_id_derivation();

    let depositor_pk = dummy_pubkey_seeded(TEST_DEPOSITOR_CLAIMER_SEED);
    let keypair = dummy_keypair_seeded(TEST_DEPOSITOR_CLAIMER_SEED);
    assert_eq!(
        keypair.x_only_public_key().0,
        depositor_pk,
        "dummy_pubkey_seeded and dummy_keypair_seeded disagree"
    );

    let mut graph = build_v3_graph(depositor_pk);
    tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("tokio runtime")
        .block_on(presign_test_depositor_claimer_graph(&mut graph));
    let sigs = sign_claimer_side(&graph, &keypair);

    let graph_json = serde_json::to_string(&graph).expect("serialize graph");
    assert_wasm_facade_v3_shape(&graph_json);

    let pegin_txid = graph.pegin_tx.get_txid();
    let depositor_eth = eth_address_bytes(DEPOSITOR_ETH_ADDRESS);
    let vault_id_hex = format!("0x{}", hex::encode(derive_vault_id(pegin_txid, &depositor_eth)));

    let mut challengers: Vec<XOnlyPublicKey> = graph.challenger_subgraphs.keys().copied().collect();
    challengers.sort();

    let wrongly_challenged_sig_hexes: BTreeMap<String, Vec<String>> = sigs
        .wrongly_challenged_sigs
        .iter()
        .map(|(pk, sigs)| {
            (
                pk.to_string(),
                sigs.iter().map(|sig| hex::encode(sig.as_ref())).collect(),
            )
        })
        .collect();

    let inputs = |babe_sessions_json: String| WatchtowerArtifactsInputs {
        graph_json: graph_json.clone(),
        signed_claim_tx_hex: hex::encode(bitcoin::consensus::serialize(&sigs.signed_claim)),
        assert_claimer_sig_hex: hex::encode(sigs.assert_claimer_sig.as_ref()),
        payout_claimer_sig_hex: hex::encode(sigs.payout_claimer_sig.as_ref()),
        wrongly_challenged_sigs_json: serde_json::to_string(&wrongly_challenged_sig_hexes)
            .expect("wrongly challenged sig json"),
        depositor_payout_sig_hex: hex::encode(sigs.depositor_payout_sig.as_ref()),
        verifying_key_hex: GENERATOR_VERIFYING_KEY_HEX.to_string(),
        claimable_event_block_number: DELEGATED_CLAIM_FIXTURE_BLOCK_NUMBER,
        prover_circuit_version: DELEGATED_CLAIM_FIXTURE_CIRCUIT_VERSION,
        vault_id_hex: vault_id_hex.clone(),
        babe_sessions_json,
        expected_vault_core_version: TX_GRAPH_VERSION,
    };

    // 1. Unjoined: empty session map builds and verifies, written through as {}.
    let unjoined = build_watchtower_artifacts(inputs("{}".to_string())).expect("build unjoined");
    verify_watchtower_artifacts(&unjoined).expect("verify unjoined");
    let unjoined_value: Value = serde_json::from_str(&unjoined).expect("unjoined artifacts JSON");
    assert_eq!(unjoined_value["babe_sessions"], json!({}));
    assert_eq!(unjoined_value["vault_core_version"], json!(TX_GRAPH_VERSION));
    assert_eq!(unjoined_value["vault_id"], json!(vault_id_hex));
    println!("unjoined: build Ok, verify Ok ({} bytes)", unjoined.len());

    // 2. Joined: one session per challenger builds and verifies.
    let joined_map = babe_sessions(&challengers);
    let joined = build_watchtower_artifacts(inputs(joined_map.to_string())).expect("build joined");
    verify_watchtower_artifacts(&joined).expect("verify joined");
    let joined_value: Value = serde_json::from_str(&joined).expect("joined artifacts JSON");
    assert_eq!(joined_value["babe_sessions"], joined_map);
    println!("joined:   build Ok, verify Ok ({} bytes)", joined.len());

    // 3. Partial: dropping one challenger is refused with BabeSessionMissing.
    let dropped = challengers[0];
    let mut partial = joined_map.as_object().expect("object").clone();
    partial.remove(&dropped.to_string());
    match build_watchtower_artifacts(inputs(Value::Object(partial).to_string())) {
        Ok(_) => panic!("partial BaBe session map was accepted"),
        Err(ArtifactsError::BabeSessionMissing { challenger_pk }) => {
            assert_eq!(challenger_pk, dropped);
            println!("partial:  refused with BabeSessionMissing {{ {challenger_pk} }}");
        }
        Err(other) => panic!("partial BaBe session map refused with the wrong error: {other}"),
    }

    let fixture = json!({
        "meta": {
            "btcVaultRev": BTC_VAULT_REV,
            "generator": "claim-fixture scratch crate (see README.md)",
            "network": "regtest",
            "settlementChainId": SETTLEMENT_CHAIN_ID,
            "seeds": {
                "depositor": TEST_DEPOSITOR_CLAIMER_SEED,
                "vaultProvider": VAULT_PROVIDER_SEED,
                "vaultKeepers": VAULT_KEEPER_SEEDS,
                "universalChallengers": UNIVERSAL_CHALLENGER_SEEDS,
                "council": COUNCIL_SEEDS,
                "councilQuorum": COUNCIL_QUORUM,
                "claimerWotsSeedByte": TEST_DEPOSITOR_CLAIMER_SEED,
                "gcWotsChaCha20Seed": hex::encode(GC_WOTS_SEED),
            },
            "values": {
                "peginAmountSats": PEGIN_AMOUNT,
                "depositorClaimValueSats": DEPOSITOR_CLAIM_VALUE,
                "p2aAnchorValueSats": P2A_ANCHOR_VALUE,
                "peginTxFeeSats": PEGIN_TX_FEE,
                "htlcValueSats": htlc_value(),
                "timelockRefund": TIMELOCK_REFUND,
            },
        },
        "inputs": {
            "txGraphVersion": TX_GRAPH_VERSION,
            "graphJson": graph_json,
            "signedClaimTxHex": hex::encode(bitcoin::consensus::serialize(&sigs.signed_claim)),
            "assertClaimerSigHex": hex::encode(sigs.assert_claimer_sig.as_ref()),
            "payoutClaimerSigHex": hex::encode(sigs.payout_claimer_sig.as_ref()),
            "wronglyChallengedSigs": wrongly_challenged_sig_hexes,
            "depositorPayoutSigHex": hex::encode(sigs.depositor_payout_sig.as_ref()),
            "verifyingKeyHex": GENERATOR_VERIFYING_KEY_HEX,
            "claimableEventBlockNumber": DELEGATED_CLAIM_FIXTURE_BLOCK_NUMBER,
            "proverCircuitVersion": DELEGATED_CLAIM_FIXTURE_CIRCUIT_VERSION,
            "vaultIdHex": vault_id_hex,
            "babeSessionsJson": "{}",
            "expectedVaultCoreVersion": TX_GRAPH_VERSION,
        },
        "babeSessionsJoined": joined_map,
        "usableForVault": {
            "expectedVaultId": vault_id_hex,
            "depositorEthAddress": DEPOSITOR_ETH_ADDRESS,
            "trustedVerifyingKeyHex": GENERATOR_VERIFYING_KEY_HEX,
            "expectedProverCircuitVersion": DELEGATED_CLAIM_FIXTURE_CIRCUIT_VERSION,
            "expectedClaimableEventBlockNumber": DELEGATED_CLAIM_FIXTURE_BLOCK_NUMBER,
        },
        "vault": {
            "peginTxid": pegin_txid.to_string(),
            "claimTxid": graph.claim_tx.tx.compute_txid().to_string(),
            "depositorBtcXOnlyPubkey": depositor_pk.to_string(),
            "vaultProviderPubkey": dummy_pubkey_seeded(VAULT_PROVIDER_SEED).to_string(),
            "challengerPubkeys": challengers.iter().map(ToString::to_string).collect::<Vec<_>>(),
        },
    });

    let out_path = concat!(env!("CARGO_MANIFEST_DIR"), "/fixture.json");
    let fixture_text = serde_json::to_string_pretty(&fixture).expect("fixture JSON");
    std::fs::write(out_path, &fixture_text).expect("write fixture.json");

    println!("pegin txid:   {pegin_txid}");
    println!("vault id:     {vault_id_hex}");
    println!("challengers:  {}", challengers.len());
    println!("graph JSON:   {} bytes", graph_json.len());
    println!("fixture.json: {} bytes -> {out_path}", fixture_text.len());
}

fn htlc_value() -> u64 {
    PEGIN_AMOUNT
        .checked_add(DEPOSITOR_CLAIM_VALUE)
        .and_then(|v| v.checked_add(P2A_ANCHOR_VALUE))
        .and_then(|v| v.checked_add(PEGIN_TX_FEE))
        .expect("fixture values cannot overflow")
}

/// test_depositor_claimer_graph_for_depositor @ b534ff9e, at Core version 3.
fn build_v3_graph(depositor_pk: XOnlyPublicKey) -> TxGraph {
    let vault_provider_pk = dummy_pubkey_seeded(VAULT_PROVIDER_SEED);
    let vault_keeper_pks: Vec<XOnlyPublicKey> =
        VAULT_KEEPER_SEEDS.into_iter().map(dummy_pubkey_seeded).collect();
    let uc_pks: Vec<XOnlyPublicKey> = UNIVERSAL_CHALLENGER_SEEDS
        .into_iter()
        .map(dummy_pubkey_seeded)
        .collect();

    let vault_keepers = VaultKeepers::new(vault_keeper_pks.clone()).expect("valid keepers");
    let universal_challengers = UniversalChallengers::new(uc_pks.clone()).expect("valid UCs");

    let council = SecurityCouncil::new(
        COUNCIL_SEEDS.into_iter().map(dummy_pubkey_seeded).collect(),
        COUNCIL_QUORUM,
    )
    .expect("valid council");
    let mut config = TxGraphConfig::test_config(Network::Regtest, council);
    config.vault_core_version = TX_GRAPH_VERSION;
    config.settlement_chain_id = SETTLEMENT_CHAIN_ID;

    let hashlock = sha256::Hash::from_byte_array([HASHLOCK_BYTE; 32]);
    let timelock_refund = NonZeroU16::new(TIMELOCK_REFUND).expect("non-zero timelock");

    let prepegin_tx = PrePegInTx::new_unfunded(PrePegInParams {
        depositor: depositor_pk,
        vault_provider: vault_provider_pk,
        vault_keepers: vault_keepers.clone(),
        universal_challengers: universal_challengers.clone(),
        htlcs: vec![Some(HtlcParams {
            hashlock,
            value: htlc_value(),
        })],
        timelock_refund,
        network: Network::Regtest,
        auth_anchor_hash: None,
    })
    .expect("valid prepegin");

    let pegin_tx = PegInTx::new_from_prepegin(
        PegInParams {
            core_version: config.vault_core_version,
            depositor: depositor_pk,
            vault_provider: vault_provider_pk,
            vault_keepers: vault_keepers.clone(),
            universal_challengers: universal_challengers.clone(),
            timelock_pegin: config.timelock_assert,
            hashlock,
            timelock_refund,
            pegin_amount: Some(PEGIN_AMOUNT),
            depositor_claim_value: Some(DEPOSITOR_CLAIM_VALUE),
            network: Network::Regtest,
            htlc_vout: 0,
        },
        &prepegin_tx,
    )
    .expect("valid pegin");

    let claimer_wots_keys = test_depositor_claimer_wots_keypairs().public_keys();

    let assert_output_value = config
        .compute_assert_output_value(vault_keepers.len(), universal_challengers.len())
        .expect("assert output value");

    let claim_tx = ClaimTx::new_funded_from_outpoint(
        ClaimParams {
            claimer: depositor_pk,
            vault_provider: vault_provider_pk,
            vault_keepers: vault_keepers.clone(),
            universal_challengers: universal_challengers.clone(),
            wots_public_keys: claimer_wots_keys.clone(),
            network: Network::Regtest,
            assert_output_value,
            depositor: depositor_pk,
        },
        depositor_claim_funding_outpoint(pegin_tx.tx.compute_txid()),
        DEPOSITOR_CLAIM_VALUE,
    )
    .expect("valid claim");

    // Challenger set for a depositor claimer = VKs + UCs. The Vec order fixes
    // which seeded GC keys each challenger gets.
    let mut challenger_pks = vault_keeper_pks;
    challenger_pks.extend(uc_pks);
    let mut rng = ChaCha20Rng::from_seed(GC_WOTS_SEED);
    let challenger_gc_data: HashMap<XOnlyPublicKey, ChallengerGCData> = challenger_pks
        .iter()
        .map(|pk| {
            let output_label_hashes: Vec<Sha256> = (0..NUM_FINALIZED_INSTANCES)
                .map(|i| Sha256::hash(&[i as u8; 32]))
                .collect();
            (
                *pk,
                ChallengerGCData {
                    gc_wots_keys: seeded_gc_wots_keys(&mut rng),
                    output_label_hashes,
                },
            )
        })
        .collect();

    let payout_btc_address = Bip86KeyConnector::new(depositor_pk)
        .generate_taproot_script_pubkey(Network::Regtest)
        .expect("payout script");

    TxGraph::new(TxGraphParams {
        pegin_tx,
        claim_tx,
        depositor_pubkey: depositor_pk,
        claimer_pubkey: depositor_pk,
        vault_provider_pubkey: vault_provider_pk,
        vault_keepers,
        universal_challengers,
        claimer_wots_keys,
        payout_btc_address,
        vp_payout_script: None,
        challenger_gc_data,
        config,
    })
    .expect("valid depositor-as-claimer v3 graph")
}

/// `WotsSmallBlockKeypairsBatch::generate(NUM_FINALIZED_INSTANCES).public_keys()`
/// with a caller-supplied RNG instead of `thread_rng`.
fn seeded_gc_wots_keys(rng: &mut ChaCha20Rng) -> GcWotsPublicKeyBlocks {
    let specs = small_block_specs();
    (0..NUM_FINALIZED_INSTANCES)
        .map(|_| {
            let blocks = specs
                .iter()
                .map(|spec| WotsBlockSecretKey::generate(*spec, rng).public_key())
                .collect();
            WotsPublicKeyBlocks::try_new(blocks, &specs).expect("small-block layout")
        })
        .collect()
}

/// DelegatedClaimFixture::new @ b534ff9e: every claimer-side signature.
fn sign_claimer_side(graph: &TxGraph, keypair: &bitcoin::secp256k1::Keypair) -> ClaimerSignatures {
    let claim_msg = compute_claim_depositor_sighash(graph).expect("claim sighash");
    let claim_sig = SECP.sign_schnorr_no_aux_rand(&claim_msg, keypair);
    let signed_claim = finalize_claim_tx(graph, claim_sig).expect("finalize claim");

    let assert_msg = compute_assert_claimer_sighashes(&graph.assert_tx).expect("assert sighashes")[0];
    let assert_claimer_sig = SECP.sign_schnorr_no_aux_rand(&assert_msg, keypair);

    let payout_msg =
        compute_payout_claimer_sighash(&graph.payout_tx).expect("payout claimer sighash");
    let payout_claimer_sig = SECP.sign_schnorr_no_aux_rand(&payout_msg, keypair);

    let depositor_payout_sig = sign_depositor_payout_sig(graph, keypair);

    let wrongly_challenged_sigs = compute_wrongly_challenged_claimer_sighashes(graph)
        .expect("wrongly challenged sighashes")
        .into_iter()
        .map(|(challenger_pk, msgs)| {
            let sigs = msgs
                .iter()
                .map(|msg| SECP.sign_schnorr_no_aux_rand(msg, keypair))
                .collect();
            (challenger_pk, sigs)
        })
        .collect();

    ClaimerSignatures {
        signed_claim,
        assert_claimer_sig,
        payout_claimer_sig,
        depositor_payout_sig,
        wrongly_challenged_sigs,
    }
}

/// `{"<pk>": {"decryptor_artifacts_hex": "a1a2"}}` for every challenger.
fn babe_sessions(challengers: &[XOnlyPublicKey]) -> Value {
    let sessions: serde_json::Map<String, Value> = challengers
        .iter()
        .map(|pk| {
            (
                pk.to_string(),
                json!({ "decryptor_artifacts_hex": DELEGATED_CLAIM_FIXTURE_SESSION_HEX }),
            )
        })
        .collect();
    Value::Object(sessions)
}

/// The structural gate vault-wasm applies before any v3 delegated-claim
/// export (src/dispatch/mod.rs `check_pegin_value_tx_graph_version` @
/// fd9872c4): the embedded PegIn must be an nVersion-3 tx with 3 outputs.
fn assert_wasm_facade_v3_shape(graph_json: &str) {
    let value: Value = serde_json::from_str(graph_json).expect("graph JSON");
    let tx_version = value.pointer("/pegin_tx/tx/version").and_then(Value::as_i64);
    let num_outputs = value
        .pointer("/pegin_tx/tx/output")
        .and_then(Value::as_array)
        .map(Vec::len);
    assert_eq!(tx_version, Some(3), "PegIn tx version must be 3 for graph v3");
    assert_eq!(num_outputs, Some(3), "PegIn must carry 3 outputs for graph v3");
}

/// `keccak256(abi.encode(bytes32 peginTxHash, address depositor))`, the
/// contract's vault id. The txid goes in display order, exactly as the SDK's
/// `derivePeginVaultId(peginTxidFromClaimTx(..), depositor)` feeds it.
fn derive_vault_id(pegin_txid: Txid, depositor_eth: &[u8; 20]) -> [u8; 32] {
    let display_txid = hex::decode(pegin_txid.to_string()).expect("txid hex");
    let mut encoded = [0u8; 64];
    encoded[..32].copy_from_slice(&display_txid);
    encoded[44..].copy_from_slice(depositor_eth);
    Keccak256::digest(encoded).into()
}

fn eth_address_bytes(address: &str) -> [u8; 20] {
    hex::decode(address.strip_prefix("0x").expect("0x-prefixed address"))
        .expect("address hex")
        .try_into()
        .expect("20-byte address")
}

/// Golden vector from btc-vault crates/eth-client/src/vault_id.rs:128-147
/// (computed there with `cast`).
fn self_test_vault_id_derivation() {
    let txid = Txid::from_byte_array([0xab; 32]);
    let depositor = eth_address_bytes("0x1234567890abcdef1234567890abcdef12345678");
    assert_eq!(
        hex::encode(derive_vault_id(txid, &depositor)),
        "f8d22e64c72a84a3dacdedb7d8b42e285bf06bd25850da911398c51d5a6c2dba"
    );
}
