/**
 * Enforce the construction order of vaults funded by one Pre-PegIn.
 *
 * Aave appends a vault to the liquidation queue when it activates. For a split
 * deposit that makes activation order value-bearing: HTLC output 0 is the
 * sacrificial vault and must activate before output 1. UI/indexer order is not
 * authoritative, so every candidate sibling is rebound to the registry here.
 */

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Hex } from "viem";

import { COPY } from "@/copy";

import {
  getVaultFromChain,
  type OnChainVaultData,
} from "../../clients/eth-contract/btc-vault-registry/query";

type ActivationOrderVault = Pick<
  OnChainVaultData,
  "applicationEntryPoint" | "depositor" | "htlcVout" | "prePeginTxHash"
>;

function sameHex(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Refuse activation unless every lower-index sibling is already ACTIVE.
 *
 * `siblingVaultIds` is discovery input only. Each record is read from chain
 * and must match the target's Pre-PegIn, depositor and application before it
 * can satisfy a lower-index slot. A missing slot fails closed: an incomplete
 * indexer/local-storage list must never authorize an out-of-order activation.
 */
export async function assertActivationFollowsConstructionOrder(
  targetVaultId: Hex,
  target: ActivationOrderVault,
  siblingVaultIds: readonly Hex[],
): Promise<void> {
  if (!Number.isInteger(target.htlcVout) || target.htlcVout < 0) {
    throw new Error(COPY.pegin.messages.activationOrderUnavailable);
  }
  if (target.htlcVout === 0) return;

  const targetId = targetVaultId.toLowerCase();
  const candidateIds = [
    ...new Set(siblingVaultIds.map((id) => id.toLowerCase())),
  ]
    .filter((id) => id !== targetId)
    .map((id) => id as Hex);

  const candidates = await Promise.all(
    candidateIds.map((vaultId) => getVaultFromChain(vaultId)),
  );

  const lowerSiblings = new Map<number, OnChainVaultData>();
  for (const vault of candidates) {
    if (!sameHex(vault.prePeginTxHash, target.prePeginTxHash)) continue;
    if (
      !sameHex(vault.depositor, target.depositor) ||
      !sameHex(vault.applicationEntryPoint, target.applicationEntryPoint)
    ) {
      throw new Error(COPY.pegin.messages.activationOrderUnavailable);
    }
    if (vault.htlcVout >= target.htlcVout) continue;
    if (lowerSiblings.has(vault.htlcVout)) {
      throw new Error(COPY.pegin.messages.activationOrderUnavailable);
    }
    lowerSiblings.set(vault.htlcVout, vault);
  }

  for (let index = 0; index < target.htlcVout; index++) {
    const lowerSibling = lowerSiblings.get(index);
    if (!lowerSibling) {
      throw new Error(COPY.pegin.messages.activationOrderUnavailable);
    }
    if (lowerSibling.status !== OnChainBtcVaultStatus.ACTIVE) {
      throw new Error(COPY.pegin.messages.activationOrderBlocked);
    }
  }
}
