import { script as bitcoinScript } from "bitcoinjs-lib";
import { Buffer } from "buffer";

const PRE_UPGRADE_FUNDING_INPUT_CAP = 20;

/**
 * `null` means the ProtocolParams deployment predates `maxFundingInputCount`
 * and enforces no bound; the app keeps its previous client-side cap of 20
 * there. Delete this once every target network returns the field.
 */
export function resolveFundingInputCap(
  maxFundingInputCount: number | null,
): number {
  if (maxFundingInputCount === null) {
    return PRE_UPGRADE_FUNDING_INPUT_CAP;
  }
  return maxFundingInputCount;
}

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
 * Cap a UTXO set to the largest `maxFundingInputCount` entries whose script
 * the selector can decompile, sorted value-descending. The bound is
 * `ProtocolParams.maxFundingInputCount`, read from the contract; the contract
 * remains the enforcement, and this only keeps the dApp from building a
 * transaction the contract is guaranteed to reject. Both the
 * validity filter and the sort order match `selectUtxosForPegin`'s internal
 * `validUTXOs`/`sortedUTXOs` exactly, so the estimator, the selector, and the
 * build all agree on which UTXOs are in play — and a malformed high-value
 * entry, which the selector would discard anyway, cannot occupy a capped slot.
 * Does not mutate the input.
 */
export function capFundingUtxos<
  T extends { value: number; scriptPubKey: string },
>(utxos: readonly T[], maxFundingInputCount: number): T[] {
  return withSpendableScripts(utxos)
    .sort((a, b) => b.value - a.value)
    .slice(0, maxFundingInputCount);
}
