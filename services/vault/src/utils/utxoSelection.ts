/** Generic UTXO selection utilities for filtering and selecting UTXOs with fallback. */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { stripHexPrefix } from "./btc/btcUtils";

/** A txid:vout pair uniquely identifying a UTXO (outpoint). */
export interface UtxoRef {
  txid: string;
  vout: number;
}

/** Convert a UTXO reference to a canonical "txid:vout" string key (lowercase). */
export function utxoRefToKey(txid: string, vout: number): string {
  return `${txid.toLowerCase()}:${vout}`;
}

/** Parse a transaction hex and return the UTXO references of all inputs. */
export function extractInputUtxoRefs(txHex: string): UtxoRef[] {
  try {
    const tx = Transaction.fromHex(stripHexPrefix(txHex));
    return tx.ins.map((input) => {
      const txid = Buffer.from(input.hash).reverse().toString("hex");
      return { txid, vout: input.index };
    });
  } catch {
    return [];
  }
}

/** Filter out UTXOs whose references are in the reserved set. */
export function filterUtxos<T extends { txid: string; vout: number }>(
  utxos: T[],
  reservedUtxoRefs: Set<string>,
): T[] {
  if (reservedUtxoRefs.size === 0) return utxos;
  return utxos.filter(
    (utxo) => !reservedUtxoRefs.has(utxoRefToKey(utxo.txid, utxo.vout)),
  );
}

/** Convert a Set of "txid:vout" keys to an array of UtxoRef objects. */
export function utxoRefKeysToArray(utxoRefKeys: Set<string>): UtxoRef[] {
  const result: UtxoRef[] = [];
  for (const key of utxoRefKeys) {
    const [txid, voutStr] = key.split(":");
    const vout = parseInt(voutStr, 10);
    if (txid && !isNaN(vout)) {
      result.push({ txid, vout });
    }
  }
  return result;
}

export interface SelectAvailableUtxosParams<
  T extends { txid: string; vout: number },
> {
  availableUtxos: T[];
  reservedUtxoRefs: Set<string>;
}

export interface SelectAvailableUtxosResult<
  T extends { txid: string; vout: number },
> {
  utxos: T[];
  usedFallback: boolean;
}

/**
 * Select available UTXOs, filtering out reserved ones with fallback.
 * Returns all available UTXOs if filtering leaves none (fallback).
 */
export function selectAvailableUtxos<T extends { txid: string; vout: number }>(
  params: SelectAvailableUtxosParams<T>,
): SelectAvailableUtxosResult<T> {
  const { availableUtxos, reservedUtxoRefs } = params;

  if (!availableUtxos || availableUtxos.length === 0) {
    return { utxos: [], usedFallback: false };
  }

  if (reservedUtxoRefs.size === 0) {
    return { utxos: availableUtxos, usedFallback: false };
  }

  const unreservedUtxos = filterUtxos(availableUtxos, reservedUtxoRefs);
  if (unreservedUtxos.length > 0) {
    return { utxos: unreservedUtxos, usedFallback: false };
  }

  return { utxos: availableUtxos, usedFallback: true };
}
