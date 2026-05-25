/**
 * Pending-vault outpoint overlap detection.
 *
 * Given the depositor's pending vaults (indexer + local cache) and the
 * outpoints a new deposit's coin selector picked, return the set of
 * pending vault ids whose Pre-PegIn BTC tx shares an input. Advisory
 * only — used to warn the user before signing.
 *
 * Only `PENDING` vaults contribute: VERIFIED+ have their Pre-PegIn
 * already confirmed on-chain, so those inputs cannot still appear in
 * the wallet's spendable set.
 */
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { stripHexPrefix } from "../../primitives/utils/bitcoin";
import { ContractStatus } from "../../services/deposit/peginState";

import { type UtxoRef } from "./availability";

/** Locally-known pending pegin. `id` is the bytes32 vault id. */
export interface PendingPeginLike {
  id?: string;
  unsignedTxHex?: string;
}

/** On-chain vault row from the indexer. */
export interface VaultLike {
  id?: string;
  status: number;
  unsignedPrePeginTx: string;
}

export interface FindOverlappingPendingVaultsParams {
  selectedOutpoints: ReadonlyArray<UtxoRef>;
  vaults?: ReadonlyArray<VaultLike>;
  pendingPegins?: ReadonlyArray<PendingPeginLike>;
}

function extractInputUtxoRefs(txHex: string): UtxoRef[] {
  try {
    const tx = Transaction.fromHex(stripHexPrefix(txHex));
    return tx.ins.map((input) => ({
      txid: Buffer.from(input.hash).reverse().toString("hex"),
      vout: input.index,
    }));
  } catch {
    return [];
  }
}

function outpointKey(o: UtxoRef): string {
  return `${o.txid.toLowerCase()}:${o.vout}`;
}

/**
 * Return the ids of pending vaults whose committed Pre-PegIn inputs
 * overlap any of the just-selected outpoints. On-chain `PENDING` vaults
 * take precedence over a same-id local pegin entry.
 */
export function findOverlappingPendingVaults(
  params: FindOverlappingPendingVaultsParams,
): string[] {
  const { selectedOutpoints, vaults = [], pendingPegins = [] } = params;

  const selectedSet = new Set(selectedOutpoints.map(outpointKey));
  if (selectedSet.size === 0) return [];

  const seenIds = new Set<string>();
  const impacted = new Set<string>();

  const consider = (id: string | undefined, txHex: string): void => {
    if (!id) return;
    const idLower = id.toLowerCase();
    if (seenIds.has(idLower)) return;
    seenIds.add(idLower);
    const inputs = extractInputUtxoRefs(txHex);
    for (const input of inputs) {
      if (selectedSet.has(outpointKey(input))) {
        impacted.add(id);
        return;
      }
    }
  };

  // On-chain wins on id collision.
  for (const v of vaults) {
    if (v.status !== ContractStatus.PENDING) continue;
    consider(v.id, v.unsignedPrePeginTx);
  }
  for (const p of pendingPegins) {
    if (!p.unsignedTxHex) continue;
    consider(p.id, p.unsignedTxHex);
  }

  return Array.from(impacted);
}
