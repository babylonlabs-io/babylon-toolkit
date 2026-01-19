/** Vault-specific UTXO reservation utilities. */

import type { Address } from "viem";

import { ContractStatus } from "../../models/peginStateMachine";
import {
  getPendingPegins,
  type PendingPeginRequest,
} from "../../storage/peginStorage";
import type { Vault } from "../../types/vault";
import {
  extractInputUtxoRefs,
  utxoRefKeysToArray,
  utxoRefToKey,
  type UtxoRef,
} from "../../utils/utxoSelection";

import { fetchVaultsByDepositor } from "./fetchVaults";

export {
  extractInputUtxoRefs,
  filterUtxos,
  selectAvailableUtxos,
  utxoRefKeysToArray,
  utxoRefToKey,
  type SelectAvailableUtxosParams,
  type SelectAvailableUtxosResult,
  type UtxoRef,
} from "../../utils/utxoSelection";

export interface CollectReservedUtxoRefsParams {
  vaults?: Vault[];
  pendingPegins?: PendingPeginRequest[];
}

/** Collect UTXO refs from in-flight deposits (PENDING/VERIFIED vaults and localStorage). */
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
