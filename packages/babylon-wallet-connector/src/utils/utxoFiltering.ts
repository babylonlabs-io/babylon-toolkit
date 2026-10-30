/**
 * UTXO Filtering Utilities
 *
 * Shared utilities for filtering UTXOs based on inscriptions and dust thresholds.
 * Used by both staking and vault services.
 */

import type { InscriptionIdentifier, UTXO } from "@/core/types";

/** Default threshold for filtering dust UTXOs (10,000 sats) */
export const LOW_VALUE_UTXO_THRESHOLD = 10_000;

/**
 * Filter out dust UTXOs below a value threshold.
 *
 * @param utxos - Array of UTXOs to filter
 * @param threshold - Minimum value in satoshis (default: 10,000)
 * @returns UTXOs above the threshold
 */
export function filterDust(
  utxos: UTXO[],
  threshold = LOW_VALUE_UTXO_THRESHOLD,
): UTXO[] {
  return utxos.filter((utxo) => utxo.value > threshold);
}

/**
 * Key that matches an inscription verdict to a UTXO.
 *
 * A txid is hex, so the same outpoint can be spelled in either case: the
 * mempool listing keeps the spelling its backend sent, and a wallet's
 * `getInscriptions()` may use the other. The txid is lowercased so both
 * spellings give one key and an inscribed UTXO is not missed.
 *
 * `vout` is interpolated, not compared as a number, because the UniSat, OKX
 * and OneKey providers return it as the string half of `output.split(":")`.
 *
 * @param txid - Transaction id, in either hex case
 * @param vout - Output index
 * @returns "txid:vout" with the txid lowercased
 */
export function inscriptionOutpointKey(txid: string, vout: number): string {
  return `${txid.toLowerCase()}:${vout}`;
}

/**
 * Create a lookup map from inscription identifiers for O(1) lookup.
 *
 * The identifiers come unvalidated from the wallet's `getInscriptions()` or
 * the ordinals API. One whose txid is not a string cannot name a UTXO, so it
 * is skipped rather than left to throw while the caller renders.
 *
 * @param inscriptions - Array of inscription identifiers
 * @returns Map of {@link inscriptionOutpointKey} -> inscription
 */
export function createInscriptionMap(
  inscriptions: InscriptionIdentifier[],
): Map<string, InscriptionIdentifier> {
  return new Map(
    inscriptions
      .filter((inscription) => typeof inscription.txid === "string")
      .map((inscription) => [
        inscriptionOutpointKey(inscription.txid, inscription.vout),
        inscription,
      ]),
  );
}

/**
 * Check if a UTXO contains an inscription.
 *
 * @param utxo - UTXO to check
 * @param inscriptionMap - Map of inscription identifiers
 * @returns true if UTXO contains an inscription
 */
export function isInscriptionUtxo(
  utxo: UTXO,
  inscriptionMap: Map<string, InscriptionIdentifier>,
): boolean {
  return inscriptionMap.has(inscriptionOutpointKey(utxo.txid, utxo.vout));
}

/**
 * Result of filtering UTXOs by inscriptions.
 */
export interface FilteredUtxos {
  /** UTXOs that do not contain inscriptions (safe to spend) */
  availableUtxos: UTXO[];
  /** UTXOs that contain inscriptions (should be protected) */
  inscriptionUtxos: UTXO[];
}

/**
 * Separate UTXOs into available (no inscriptions) and inscription UTXOs.
 *
 * @param utxos - Array of UTXOs to filter
 * @param inscriptions - Array of inscription identifiers
 * @returns Object with availableUtxos and inscriptionUtxos
 */
export function filterInscriptionUtxos(
  utxos: UTXO[],
  inscriptions: InscriptionIdentifier[],
): FilteredUtxos {
  const inscriptionMap = createInscriptionMap(inscriptions);

  const availableUtxos: UTXO[] = [];
  const inscriptionUtxos: UTXO[] = [];

  for (const utxo of utxos) {
    if (isInscriptionUtxo(utxo, inscriptionMap)) {
      inscriptionUtxos.push(utxo);
    } else {
      availableUtxos.push(utxo);
    }
  }

  return { availableUtxos, inscriptionUtxos };
}

/**
 * Get available UTXOs for spending (no inscriptions, above dust threshold).
 *
 * Convenience function that combines dust filtering and inscription filtering.
 *
 * @param utxos - Array of UTXOs
 * @param inscriptions - Array of inscription identifiers
 * @param dustThreshold - Minimum value threshold (default: 10,000 sats)
 * @returns UTXOs safe for spending
 */
export function getSpendableUtxos(
  utxos: UTXO[],
  inscriptions: InscriptionIdentifier[],
  dustThreshold = LOW_VALUE_UTXO_THRESHOLD,
): UTXO[] {
  const nonDustUtxos = filterDust(utxos, dustThreshold);
  const { availableUtxos } = filterInscriptionUtxos(nonDustUtxos, inscriptions);
  return availableUtxos;
}
