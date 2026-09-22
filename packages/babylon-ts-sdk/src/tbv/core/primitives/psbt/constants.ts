/**
 * Protocol invariants for depositor graph transactions.
 *
 * These indices and counts encode the on-chain vault protocol layout
 * (which output of PegIn/Assert each child transaction spends, and how
 * many inputs each transaction has). Consumed by the PSBT builders and
 * the depositor graph signing service; a drift between copies of these
 * values would silently change validation behaviour.
 *
 * @module primitives/psbt/constants
 * @see btc-vault crates/vault/docs/btc-transactions-spec.md
 */

/**
 * Depositor Payout transaction input count.
 * Input 0: PegIn:0 ({@link PAYOUT_PEGIN_INPUT_INDEX}). Input 1: Assert:0
 * ({@link PAYOUT_ASSERT_INPUT_INDEX} carries the signing regimes).
 */
export const DEPOSITOR_PAYOUT_INPUT_COUNT = 2;

/**
 * Inputs the depositor signs per Payout / NoPayout PSBT at deposit time:
 * input 0 only. The other inputs are in the SIGHASH_DEFAULT sighash but carry
 * no depositor signature there — the Ledger host expects exactly this many
 * yields, so a drift here re-arms an input the device never signs at deposit
 * time.
 */
export const DEPOSITOR_SIGNED_INPUT_COUNT = 1;

/** PegIn vault output index spent by the depositor's Payout input 0. */
export const PEGIN_VAULT_OUTPUT_INDEX = 0;

/**
 * Assert output index spent by the Payout's input 1
 * ({@link PAYOUT_ASSERT_INPUT_INDEX} carries the signing regimes).
 */
export const ASSERT_PAYOUT_OUTPUT_INDEX = 0;

/** Payout input that spends the Vault UTXO (PegIn:{@link PEGIN_VAULT_OUTPUT_INDEX}); the depositor signs it in both regimes. */
export const PAYOUT_PEGIN_INPUT_INDEX = 0;

/** Payout input that spends the Assert connector (Assert:{@link ASSERT_PAYOUT_OUTPUT_INDEX}); the claimer signs it, which is the depositor only in a delegated claim. */
export const PAYOUT_ASSERT_INPUT_INDEX = 1;

/**
 * Claim input that spends the vault's PegIn. A depositor-as-claimer recovery
 * Claim is funded by exactly the PegIn's depositor-claim output
 * (`DEPOSITOR_CLAIM_VOUT = 1` in btc-vault `crates/vault/src/lib.rs:272`, used by
 * `depositor_claim_funding_outpoint` in `crates/vault/src/transactions/claim.rs:119-121`
 * @ ac4954e7); the depositor signs it.
 */
export const CLAIM_PEGIN_INPUT_INDEX = 0;

/**
 * Assert input that spends the Claim connector
 * (Claim:{@link CLAIM_CONNECTOR_OUTPUT_INDEX}); the claimer signs it. Matches
 * `CLAIM_ASSERT_INPUT` in btc-vault `crates/vault/src/transactions/assert.rs:56` @ ac4954e7.
 */
export const ASSERT_CLAIM_INPUT_INDEX = 0;

/**
 * Claim output the Assert spends. Matches `CLAIM_ASSERT_OUTPUT_INDEX` in
 * btc-vault `crates/vault/src/transactions/claim.rs:25` @ ac4954e7.
 */
export const CLAIM_CONNECTOR_OUTPUT_INDEX = 0;

/**
 * WronglyChallenged input that spends the ChallengeAssert connector; the
 * claimer signs it, which is the depositor only in a delegated claim. Matches
 * `CHALLENGE_ASSERT_INPUT` in btc-vault
 * `crates/vault/src/transactions/wrongly_challenged.rs:35`, the input
 * `claimer_signing_psbt` hands the external signer (`:187`) and `sign_claimer`
 * signs natively (`:243`) @ ac4954e7.
 */
export const WRONGLY_CHALLENGED_INPUT_INDEX = 0;

/**
 * Dust amount (sats) for the payout CPFP anchor output. Matches `DUST_AMOUNT`
 * in `btc-vault crates/vault/src/lib.rs`.
 */
export const PAYOUT_ANCHOR_DUST_SATS = 546;

/** Minimum number of HTLC outputs in a Pre-PegIn transaction. */
export const PRE_PEGIN_MIN_HTLC_OUTPUT_COUNT = 1;

/** Canonical value in sats for the optional Pre-PegIn auth output. */
export const PRE_PEGIN_AUTH_OUTPUT_VALUE_SATS = 0;

/**
 * Hex prefix for `OP_RETURN PUSH32`. This matches
 * `ScriptBuf::new_op_return(hash)` in
 * `btc-vault crates/vault/src/transactions/prepegin.rs`.
 */
export const PRE_PEGIN_AUTH_SCRIPT_PREFIX = "6a20";

/**
 * Value in sats for the Pre-PegIn CPFP anchor output. Matches `DUST_AMOUNT`
 * in `btc-vault crates/vault/src/lib.rs`.
 */
export const PRE_PEGIN_CPFP_VALUE_SATS = 546;

/**
 * Canonical Pre-PegIn transaction version. Matches `Version::TWO` in
 * `btc-vault crates/vault/src/transactions/prepegin.rs`.
 */
export const PRE_PEGIN_TX_VERSION = 2;

/**
 * Canonical Pre-PegIn transaction locktime. Matches `LockTime::ZERO` in
 * `btc-vault crates/vault/src/transactions/prepegin.rs`.
 */
export const PRE_PEGIN_TX_LOCKTIME = 0;

/** Vault Core 1 PegIn nVersion from `PegInTx::expected_tx_version`. */
export const PEGIN_TX_VERSION_CORE_1 = 2;

/** Vault Core 2 and 3 PegIn nVersion from `PegInTx::expected_tx_version`. */
export const PEGIN_TX_VERSION_CORE_2_AND_3 = 3;

/** PegIn locktime from `PegInTx::new_from_prepegin` (`LockTime::ZERO`). */
export const PEGIN_TX_LOCKTIME = 0;

/** PegIn input sequence from `PegInTx::new_from_prepegin`. */
export const PEGIN_INPUT_SEQUENCE = 0xfffffffe;

/**
 * Refund version and locktime match `WasmPrePeginTx::build_refund_tx`
 * (`Version::TWO`, `LockTime::ZERO`) in `btc-vault crates/vault/src/wasm/api.rs`.
 */
export const REFUND_TX_VERSION = 2;
export const REFUND_TX_LOCKTIME = 0;

/**
 * Payout transaction literals btc-vault builds deterministically
 * (`crates/vault/src/transactions/payout.rs`: `Version::TWO`,
 * `LockTime::ZERO`). The depositor's signature commits to both, so a
 * VP-supplied payout that deviates would produce a signature over a
 * transaction the protocol never constructs.
 */
export const PAYOUT_TX_VERSION = 2;
export const PAYOUT_TX_LOCKTIME = 0;

/**
 * Payout output that pays the payout receiver, resolved per claimer role (the
 * depositor's registered script for a VP or depositor claimer, the keeper's
 * for an AVK claimer — btc-vault `tx_graph/graph.rs:100-106` @ ac4954e7).
 * btc-vault has no named constant for the index itself:
 * `build_payout_outputs` (`crates/vault/src/transactions/mod.rs:206`)
 * returns the destination as `output0` in both layouts — `:246`/`:256` with a
 * VP commission, `:266`/`:270` without — and `transactions/payout.rs:153`
 * pushes the CPFP anchor after them @ ac4954e7.
 */
export const PAYOUT_DESTINATION_OUTPUT_INDEX = 0;

/** VP-claimer payout output count: [depositor payout, VP commission, CPFP anchor]. */
export const VP_CLAIMER_PAYOUT_OUTPUT_COUNT = 3;

/** Depositor/VK-claimer payout output count: [claimer payout, CPFP anchor]. */
export const NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT = 2;

/**
 * ChallengeAssert connectors the VP returns per challenger: one for the
 * ChallengeAssertX transaction and one for ChallengeAssertY — two single-input
 * transactions, not a single multi-input one. This is a per-challenger array
 * cardinality, NOT a count of inputs in one transaction.
 * @see btc-vault crates/vault/docs/btc-transactions-spec.md (ChallengeAssertX / ChallengeAssertY)
 */
export const CHALLENGE_ASSERT_CONNECTORS_PER_CHALLENGER = 2;

/**
 * Exclusive upper bound on VP commission (bps). Matches
 * `VPKeyRegistryLogic.sol` (`commissionBps >= 10000` reverts).
 * The minimum is version-locked (`minVpCommissionBps`) and enforced upstream,
 * not here.
 */
export const MAX_VP_COMMISSION_BPS_EXCLUSIVE = 10_000;

/**
 * Basis-points denominator for commission math:
 * `floor(value * bps / BPS_DENOMINATOR)`. Numerically equal to
 * {@link MAX_VP_COMMISSION_BPS_EXCLUSIVE} but a distinct concept — tightening
 * the accepted bps range must never change the arithmetic.
 */
export const BPS_DENOMINATOR = 10_000;

/**
 * Contract cap on a registered payout/commission scriptPubKey's byte length
 * (`MAX_PAYOUT_ADDRESS_LENGTH`, Constants.sol; empty scripts are rejected at
 * registration, so valid lengths are `[1, 128]`). A measured length outside
 * this range is provably not a registered script.
 */
export const MAX_PAYOUT_SCRIPT_LEN = 128;
