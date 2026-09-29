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
import { ActivationNotPossibleError } from "@/utils/errors";
import { sameHex } from "@/utils/hex";

import {
  getVaultFromChainWithGrace,
  type OnChainVaultData,
} from "../../clients/eth-contract/btc-vault-registry/query";

type ActivationOrderVault = Pick<
  OnChainVaultData,
  "applicationEntryPoint" | "depositor" | "htlcVout" | "prePeginTxHash"
>;

/**
 * On-chain statuses from which a lower sibling can still join the queue. An
 * ACTIVE sibling is already queued ahead; a REDEEMED or EXPIRED one can never
 * be queued, so it cannot be seized after this vault and does not block.
 */
const CAN_STILL_ACTIVATE: ReadonlySet<number> = new Set([
  OnChainBtcVaultStatus.PENDING,
  OnChainBtcVaultStatus.VERIFIED,
]);

/**
 * Read every candidate and drop the reads that fail. A failed read cannot
 * satisfy a lower slot, so the slot check below still fails closed when the
 * failed candidate was a required sibling; an unrelated candidate no longer
 * blocks the activation.
 */
async function readSiblings(vaultIds: Hex[]): Promise<OnChainVaultData[]> {
  const results = await Promise.allSettled(
    vaultIds.map((vaultId) => getVaultFromChainWithGrace(vaultId)),
  );
  return results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
}

/**
 * Refuse activation while any lower-index sibling can still activate.
 *
 * `siblingVaultIds` is discovery input only. Each record is read from chain
 * and must match the target's Pre-PegIn, depositor and application before it
 * can satisfy a lower-index slot. A missing slot fails closed: an incomplete
 * indexer/local-storage list must never authorize an out-of-order activation.
 * Inconsistent registry data is terminal ({@link ActivationNotPossibleError}):
 * a retry reads the same records.
 */
export async function assertActivationFollowsConstructionOrder(
  targetVaultId: Hex,
  target: ActivationOrderVault,
  siblingVaultIds: readonly Hex[],
): Promise<void> {
  if (!Number.isInteger(target.htlcVout) || target.htlcVout < 0) {
    throw new ActivationNotPossibleError(
      COPY.pegin.messages.activationOrderInconsistent,
    );
  }
  if (target.htlcVout === 0) return;

  const targetId = targetVaultId.toLowerCase();
  const candidateIds = [
    ...new Set(siblingVaultIds.map((id) => id.toLowerCase())),
  ]
    .filter((id) => id !== targetId)
    .map((id) => id as Hex);

  const candidates = await readSiblings(candidateIds);

  const lowerSiblings = new Map<number, OnChainVaultData>();
  for (const vault of candidates) {
    if (!sameHex(vault.prePeginTxHash, target.prePeginTxHash)) continue;
    if (
      !sameHex(vault.depositor, target.depositor) ||
      !sameHex(vault.applicationEntryPoint, target.applicationEntryPoint)
    ) {
      throw new ActivationNotPossibleError(
        COPY.pegin.messages.activationOrderInconsistent,
      );
    }
    if (vault.htlcVout >= target.htlcVout) continue;
    if (lowerSiblings.has(vault.htlcVout)) {
      throw new ActivationNotPossibleError(
        COPY.pegin.messages.activationOrderInconsistent,
      );
    }
    lowerSiblings.set(vault.htlcVout, vault);
  }

  for (let index = 0; index < target.htlcVout; index++) {
    const lowerSibling = lowerSiblings.get(index);
    if (!lowerSibling) {
      throw new Error(COPY.pegin.messages.activationOrderUnavailable);
    }
    if (CAN_STILL_ACTIVATE.has(lowerSibling.status)) {
      throw new Error(COPY.pegin.messages.activationOrderBlocked);
    }
  }
}
