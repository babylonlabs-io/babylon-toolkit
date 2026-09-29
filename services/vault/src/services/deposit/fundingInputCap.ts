import { script as bitcoinScript } from "bitcoinjs-lib";
import { Buffer } from "buffer";

/**
 * Client-side guard rail on the number of wallet UTXOs one Pre-PegIn may
 * spend. Mirrors the contract deploy default `INITIAL_MAX_FUNDING_INPUT_COUNT`
 * (`vault-contracts-aave-v4`) — governance can move that bound with
 * `setTBVParams`, and this constant would need to move with it. The contract
 * remains the enforcement; this only keeps the dApp from building a
 * transaction the contract is guaranteed to reject.
 *
 * TODO(#2402): read maxFundingInputCount from the ProtocolParams tuple once
 * the reader lands; follow the pinnedBuildLimits.ts pattern.
 */
export const MAX_PRE_PEGIN_FUNDING_INPUTS = 20;

// The global Buffer, not the `buffer` polyfill imported above: polyfill
// instances fail bitcoinjs/typeforce's `Buffer.isBuffer` (see btcUtils.ts:52).
function hasValidScript(scriptPubKey: string): boolean {
  const GlobalBuffer = (globalThis as { Buffer: typeof Buffer }).Buffer;
  return !!bitcoinScript.decompile(GlobalBuffer.from(scriptPubKey, "hex"));
}

/**
 * The UTXOs `selectUtxosForPegin` will consider — those whose `scriptPubKey`
 * decompiles, matching its internal `validUTXOs` filter in
 * `packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts`. Both the
 * capped and the uncapped max must be derived from this set so they count the
 * same population. Does not mutate the input.
 */
export function withSpendableScripts<T extends { scriptPubKey: string }>(
  utxos: readonly T[],
): T[] {
  return utxos.filter((utxo) => hasValidScript(utxo.scriptPubKey));
}

/**
 * Cap a UTXO set to the largest {@link MAX_PRE_PEGIN_FUNDING_INPUTS} entries
 * whose script the selector can decompile, sorted value-descending. Both the
 * validity filter and the sort order match `selectUtxosForPegin`'s internal
 * `validUTXOs`/`sortedUTXOs` exactly, so the estimator, the selector, and the
 * build all agree on which UTXOs are in play — and a malformed high-value
 * entry, which the selector would discard anyway, cannot occupy a capped slot.
 * Does not mutate the input.
 */
export function capFundingUtxos<
  T extends { value: number; scriptPubKey: string },
>(utxos: readonly T[]): T[] {
  return withSpendableScripts(utxos)
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_PRE_PEGIN_FUNDING_INPUTS);
}
