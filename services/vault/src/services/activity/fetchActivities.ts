/**
 * Activity tab orchestrator.
 *
 * Fetches all activity pages for the depositor, classifies and groups
 * liquidation siblings, then dispatches each indexer item to its projection.
 * The heavy lifting lives in:
 *  - `query.ts`           — GraphQL types, page documents, cursor loop
 *  - `classification.ts`  — partial/full liquidation + group rollup
 *  - `projection.ts`      — per-row projection, formatting, BTC invariant
 *
 * This file should stay an orchestrator; if it grows large again, the next
 * piece to lift out is the dispatch loop.
 */

import type { Address } from "viem";

import { logger } from "../../infrastructure";
import type { ActivityRow } from "../../types/activityLog";

import {
  resolveRedeemClaimTxids,
  type RedeemVaultLookup,
} from "./claimTxResolver";
import { buildLiquidationGroup, classifyLiquidations } from "./classification";
import {
  isStandardActivity,
  projectRefundedDeposit,
  projectStandardRow,
  type FetchUserActivitiesDeps,
} from "./projection";
import {
  fetchAllActivityPages,
  parseLogIndex,
  type GraphQLVaultActivityItem,
} from "./query";

export type { FetchUserActivitiesDeps } from "./projection";

/**
 * Module-scope set so a new activity type emitted by the indexer warns once
 * per browser session, not once per fetch (which would flood the console for
 * every polling tick on every connected user).
 */
const warnedUnknownTypes = new Set<string>();

function warnUnknownActivityTypeOnce(type: string) {
  if (warnedUnknownTypes.has(type)) return;
  warnedUnknownTypes.add(type);
  logger.warn("[fetchActivities] dropped unrecognised activity type", { type });
}

/** Test-only: clear the per-session warned-types set so each test starts fresh. */
export function __resetWarnedUnknownTypesForTests() {
  warnedUnknownTypes.clear();
}

export async function fetchUserActivities(
  address: Address,
  deps: FetchUserActivitiesDeps,
): Promise<ActivityRow[]> {
  const { activities, vaults } = await fetchAllActivityPages(
    address.toLowerCase(),
  );

  if (activities.length === 0) return [];

  const peginTxHashByVaultId = new Map<string, string>();
  for (const v of vaults) {
    peginTxHashByVaultId.set(v.id, v.peginTxHash);
  }

  const vaultLookup = new Map<string, RedeemVaultLookup>();
  for (const v of vaults) {
    vaultLookup.set(v.id, {
      peginTxHash: v.peginTxHash,
      vaultProvider: v.vaultProvider,
    });
  }

  const redeemRefs = activities
    .filter((a) => a.type === "redeem" && a.vaultId != null)
    .map((a) => ({ vaultId: a.vaultId as string }));

  const redeemClaimTxByVaultId = await resolveRedeemClaimTxids(
    redeemRefs,
    vaultLookup,
  );

  // Sibling repay events fire in the same EVM tx as a VaultLiquidated event.
  // Aave's RepaidFromPosition is position-scoped (vaultId is null) and fires
  // once per debt reserve, so one liquidation tx can produce multiple repays
  // (one per reserve being settled). Track them all per tx hash so:
  //   1. every repay is marked consumed (no orphan rows leak through), and
  //   2. the first repay attaches to the liquidation card (today's design;
  //      multi-repay card support is a separate design call).
  const repaysByTxHash = new Map<string, GraphQLVaultActivityItem[]>();
  for (const item of activities) {
    if (item.type === "repay") {
      const bucket = repaysByTxHash.get(item.transactionHash);
      if (bucket) {
        bucket.push(item);
      } else {
        repaysByTxHash.set(item.transactionHash, [item]);
      }
    }
  }

  const liquidationClassification = classifyLiquidations(activities);

  const sorted = [...activities].sort((a, b) => {
    const tsDiff = parseInt(b.timestamp, 10) - parseInt(a.timestamp, 10);
    if (tsDiff !== 0) return tsDiff;
    const blockDiff = parseInt(b.blockNumber, 10) - parseInt(a.blockNumber, 10);
    if (blockDiff !== 0) return blockDiff;
    return parseLogIndex(b.id) - parseLogIndex(a.id);
  });

  // Pre-mark repay rows that will be rolled into a liquidation group. The
  // sorted iteration is desc by (timestamp, blockNumber, logIndex), so the
  // sibling repay (higher logIndex) typically lands before the liquidation
  // that would consume it — we must know up-front which ids to skip.
  const consumedIds = new Set<string>();
  for (const item of activities) {
    if (item.type === "liquidation") {
      const repays = repaysByTxHash.get(item.transactionHash);
      if (repays) {
        for (const repay of repays) consumedIds.add(repay.id);
      }
    }
  }

  const rows: ActivityRow[] = [];

  for (const item of sorted) {
    if (consumedIds.has(item.id)) continue;

    if (item.type === "liquidation") {
      const classification =
        liquidationClassification.get(item.id) ?? "Partially Liquidated";
      // Multi-reserve case: only the first repay is shown in the card today.
      // The others are still consumed above so they don't leak as orphan rows.
      const repay = repaysByTxHash.get(item.transactionHash)?.[0];
      rows.push(buildLiquidationGroup(item, repay, classification, deps));
      continue;
    }

    if (item.type === "claim_expired") {
      rows.push(projectRefundedDeposit(item, peginTxHashByVaultId));
      continue;
    }

    if (isStandardActivity(item)) {
      rows.push(
        projectStandardRow(
          item,
          peginTxHashByVaultId,
          redeemClaimTxByVaultId,
          deps,
        ),
      );
      continue;
    }

    warnUnknownActivityTypeOnce(item.type);
  }

  return rows;
}
