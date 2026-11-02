/**
 * The depositor's other vaults on a Pre-PegIn, read from the BTCVaultRegistry.
 *
 * Refund and resume both rebuild a Pre-PegIn's HTLC vector from its siblings.
 * The candidates come from the registry rather than the indexer: an ID the
 * indexer invents can abort the batch read below, and one it omits shrinks the
 * vector, and either way blocks the depositor.
 *
 * A listed ID always has a record: the registry pushes it in the call that
 * creates the record (vault-contracts-aave-v4@13bff487:src/protocol/BTCVaultRegistry.sol:1025-1028),
 * registration rejects an empty signed PegIn (src/protocol/lib/PeginLogic.sol:117)
 * and nothing deletes a record. Only the depositor can add to the list (:193).
 * So both reads stay strict and share one block, and a failure means the node
 * is inconsistent or unavailable, never that one candidate should be skipped.
 */

import type { Hex } from "viem";

import { COPY } from "@/copy";

import { resolvePinnedReadBlock } from "../pinnedReadBlock";
import { getVaultRegistryReader } from "../sdk-readers";

import { getDepositorVaultIdsFromChain } from "./depositorVaultIds";
import type { OnChainVaultData } from "./query";

/**
 * IDs of the target's siblings: the depositor's other vaults registered to the
 * same Pre-PegIn. Selects by `prePeginTxHash` only, so an unrelated vault with
 * a stamped field the fully-validated read would refuse cannot block the caller.
 * A failed read throws. Callers still rely on their completeness checks: a
 * sibling registered after the pinned block is not returned.
 */
export async function getPrePeginSiblingIdsFromChain(
  targetVaultId: Hex,
  target: Pick<OnChainVaultData, "depositor" | "prePeginTxHash">,
): Promise<Hex[]> {
  const blockNumber = await resolvePinnedReadBlock();
  const registeredIds = await getDepositorVaultIdsFromChain(
    target.depositor,
    blockNumber,
  );

  const targetIdLower = targetVaultId.toLowerCase();
  const candidateIds = registeredIds.filter(
    (id) => id.toLowerCase() !== targetIdLower,
  );
  // The target has a record, so a list without it predates its registration
  // and could be missing siblings too.
  if (candidateIds.length === registeredIds.length) {
    throw new Error(
      COPY.deposit.errors.vaultMissingFromDepositorList(
        targetVaultId,
        blockNumber,
      ),
    );
  }

  const candidateInfos = await getVaultRegistryReader().getProtocolInfoBatch(
    candidateIds,
    blockNumber,
  );
  const prePeginTxHash = target.prePeginTxHash.toLowerCase();
  return candidateIds.filter(
    (_, i) => candidateInfos[i].prePeginTxHash.toLowerCase() === prePeginTxHash,
  );
}
