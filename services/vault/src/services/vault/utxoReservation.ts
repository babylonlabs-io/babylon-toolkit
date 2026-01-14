/** Utilities for identifying UTXOs reserved by in-flight peg-in transactions. */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Address } from "viem";

import { ContractStatus } from "../../models/peginStateMachine";
import {
  getPendingPegins,
  type PendingPeginRequest,
} from "../../storage/peginStorage";
import type { Vault } from "../../types/vault";
import { stripHexPrefix } from "../../utils/btc/btcUtils";

import { fetchVaultsByDepositor } from "./fetchVaults";

/**
 * A txid:vout pair uniquely identifying a UTXO.
 * (Called "outpoint" in Bitcoin terminology.)
 */
export interface UtxoRef {
  txid: string;
  vout: number;
}

/** Convert a UTXO reference to a canonical "txid:vout" string key. */
export function utxoRefToKey(txid: string, vout: number): string {
  return `${txid.toLowerCase()}:${vout}`;
}

/** Parse a transaction hex and return the UTXO references of all inputs. */
export function extractInputUtxoRefs(txHex: string): UtxoRef[] {
  try {
    const cleanHex = stripHexPrefix(txHex);
    const tx = Transaction.fromHex(cleanHex);

    return tx.ins.map((input) => {
      // input.hash is the txid in little-endian; reverse to big-endian
      const txidBuffer = Buffer.from(input.hash);
      const txid = txidBuffer.reverse().toString("hex");
      return { txid, vout: input.index };
    });
  } catch (error) {
    console.warn("[utxoReservation] Failed to parse transaction hex:", error);
    return [];
  }
}

export interface CollectReservedUtxoRefsParams {
  vaults?: Vault[];
  pendingPegins?: PendingPeginRequest[];
}

/**
 * Collect UTXO references from in-flight deposits (PENDING/VERIFIED vaults and localStorage).
 * Returns a Set of "txid:vout" keys for filtering available UTXOs.
 */
export function collectReservedUtxoRefs(
  params: CollectReservedUtxoRefsParams,
): Set<string> {
  const reserved = new Set<string>();
  const { vaults = [], pendingPegins = [] } = params;

  for (const pending of pendingPegins) {
    if (pending.selectedUTXOs && pending.selectedUTXOs.length > 0) {
      for (const utxo of pending.selectedUTXOs) {
        reserved.add(utxoRefToKey(utxo.txid, utxo.vout));
      }
    } else if (pending.unsignedTxHex) {
      for (const ref of extractInputUtxoRefs(pending.unsignedTxHex)) {
        reserved.add(utxoRefToKey(ref.txid, ref.vout));
      }
    }
  }

  for (const vault of vaults) {
    if (
      vault.status !== ContractStatus.PENDING &&
      vault.status !== ContractStatus.VERIFIED
    ) {
      continue;
    }
    if (vault.unsignedBtcTx) {
      for (const ref of extractInputUtxoRefs(vault.unsignedBtcTx)) {
        reserved.add(utxoRefToKey(ref.txid, ref.vout));
      }
    }
  }

  return reserved;
}

/** Filter out UTXOs whose references are in the reserved set. */
export function filterUtxos<T extends { txid: string; vout: number }>(
  utxos: T[],
  reservedUtxoRefs: Set<string>,
): T[] {
  if (reservedUtxoRefs.size === 0) {
    return utxos;
  }
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

/** Fetch reserved UTXO refs for a depositor from indexer + localStorage. */
export async function getReservedUtxoRefs(
  depositorAddress: Address,
): Promise<UtxoRef[]> {
  const [vaults, pendingPegins] = await Promise.all([
    fetchVaultsByDepositor(depositorAddress).catch(() => []),
    Promise.resolve(getPendingPegins(depositorAddress)),
  ]);

  const reservedSet = collectReservedUtxoRefs({ vaults, pendingPegins });
  return reservedSet.size > 0 ? utxoRefKeysToArray(reservedSet) : [];
}
