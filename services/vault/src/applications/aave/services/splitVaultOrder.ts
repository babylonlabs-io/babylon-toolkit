/** Derive the intended split-deposit liquidation order from registry data. */

import type { VaultProtocolInfo } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Hex } from "viem";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";

function sameHex(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Sort siblings sharing a Pre-PegIn by their on-chain HTLC output index while
 * preserving every batch's existing slots relative to unrelated deposits.
 */
export function deriveConstructionOrderedVaultIds(
  currentVaultIds: readonly Hex[],
  protocolInfo: readonly VaultProtocolInfo[],
): Hex[] {
  if (currentVaultIds.length !== protocolInfo.length) {
    throw new Error(
      "Collateral order read returned a different number of registry records.",
    );
  }

  const desired = [...currentVaultIds];
  const positionsByPrePegin = new Map<string, number[]>();
  protocolInfo.forEach((info, position) => {
    const key = info.prePeginTxHash.toLowerCase();
    const positions = positionsByPrePegin.get(key) ?? [];
    positions.push(position);
    positionsByPrePegin.set(key, positions);
  });

  for (const positions of positionsByPrePegin.values()) {
    if (positions.length < 2) continue;

    const seenIndices = new Set<number>();
    const orderedPositions = [...positions].sort((a, b) => {
      const aIndex = Number(protocolInfo[a].htlcVout);
      const bIndex = Number(protocolInfo[b].htlcVout);
      return aIndex - bIndex;
    });
    for (const position of orderedPositions) {
      const index = Number(protocolInfo[position].htlcVout);
      if (!Number.isInteger(index) || index < 0 || seenIndices.has(index)) {
        throw new Error(
          "Collateral order read returned invalid split construction indices.",
        );
      }
      seenIndices.add(index);
    }

    const orderedIds = orderedPositions.map(
      (position) => currentVaultIds[position],
    );
    positions.forEach((position, index) => {
      desired[position] = orderedIds[index];
    });
  }

  return desired;
}

export function isSameVaultOrder(
  a: readonly Hex[],
  b: readonly Hex[],
): boolean {
  return a.length === b.length && a.every((id, index) => sameHex(id, b[index]));
}

/** Read construction metadata for the contract-authoritative queue. */
export async function readConstructionOrderedVaultIds(
  currentVaultIds: readonly Hex[],
): Promise<Hex[]> {
  const protocolInfo =
    await getVaultRegistryReader().getProtocolInfoBatch(currentVaultIds);
  return deriveConstructionOrderedVaultIds(currentVaultIds, protocolInfo);
}
