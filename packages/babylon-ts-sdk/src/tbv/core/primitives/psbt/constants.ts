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

/** Payout input index bound to the graph Assert tx (NOT signed). */
export const PAYOUT_ASSERT_INPUT_INDEX = 1;

/** Assert output index spent by the depositor's Payout input 1 (NOT signed). */
export const ASSERT_PAYOUT_OUTPUT_INDEX = 0;

/** Assert output index spent by NoPayout input 0 (signed). */
export const ASSERT_NOPAYOUT_OUTPUT_INDEX = 0;
