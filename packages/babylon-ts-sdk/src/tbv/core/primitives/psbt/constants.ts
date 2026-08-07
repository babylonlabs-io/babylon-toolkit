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
 * Input 0: PegIn:0 (signed). Input 1: Assert:0 (in sighash, not signed).
 */
export const DEPOSITOR_PAYOUT_INPUT_COUNT = 2;

/** PegIn vault output index spent by the depositor's Payout input 0. */
export const PEGIN_VAULT_OUTPUT_INDEX = 0;

/** Assert output index spent by the depositor's Payout input 1 (NOT signed). */
export const ASSERT_PAYOUT_OUTPUT_INDEX = 0;

/**
 * Dust amount (sats) for the payout CPFP anchor output. Matches `DUST_AMOUNT`
 * in `btc-vault crates/vault/src/lib.rs`.
 */
export const PAYOUT_ANCHOR_DUST_SATS = 546;

/**
 * Payout transaction literals btc-vault builds deterministically
 * (`crates/vault/src/transactions/payout.rs`: `Version::TWO`,
 * `LockTime::ZERO`). The depositor's signature commits to both, so a
 * VP-supplied payout that deviates would produce a signature over a
 * transaction the protocol never constructs.
 */
export const PAYOUT_TX_VERSION = 2;
export const PAYOUT_TX_LOCKTIME = 0;

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
