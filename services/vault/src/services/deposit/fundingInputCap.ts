/**
 * Client-side guard rail on the number of wallet UTXOs one Pre-PegIn may
 * spend. Mirrors the contract deploy default `INITIAL_MAX_FUNDING_INPUT_COUNT`
 * (`vault-contracts-aave-v4`) — governance can move that bound with
 * `setTBVParams`, and this constant would need to move with it. The contract
 * remains the enforcement; this only keeps the dApp from building a
 * transaction the contract is guaranteed to reject.
 */
export const MAX_PRE_PEGIN_FUNDING_INPUTS = 20;

/**
 * Cap a UTXO set to the largest {@link MAX_PRE_PEGIN_FUNDING_INPUTS}, sorted
 * value-descending. Sort order matches
 * `selectUtxosForPegin`'s internal `sortedUTXOs` in
 * `packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts` exactly, so
 * the estimator, the selector, and the build all agree on which UTXOs are in
 * play. Does not mutate the input.
 */
export function capFundingUtxos<T extends { value: number }>(
  utxos: readonly T[],
): T[] {
  return [...utxos]
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_PRE_PEGIN_FUNDING_INPUTS);
}
