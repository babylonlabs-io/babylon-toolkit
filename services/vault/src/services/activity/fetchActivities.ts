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

  // Sibling repay events fire in the same EVM tx as a VaultLiquidated event.
  // Indexed by tx hash so liquidations can grab their repay child in one lookup.
  const repayByTxHash = new Map<string, GraphQLVaultActivityItem>();
  for (const item of activities) {
    if (item.type === "repay") {
      repayByTxHash.set(item.transactionHash, item);
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
      const repay = repayByTxHash.get(item.transactionHash);
      if (repay) consumedIds.add(repay.id);
    }
  }

  const rows: ActivityRow[] = [];

  for (const item of sorted) {
    if (consumedIds.has(item.id)) continue;

    if (item.type === "liquidation") {
      const classification =
        liquidationClassification.get(item.id) ?? "Partially Liquidated";
      const repay = repayByTxHash.get(item.transactionHash);
      rows.push(buildLiquidationGroup(item, repay, classification, deps));
      continue;
    }

    if (item.type === "claim_expired") {
      rows.push(projectRefundedDeposit(item, peginTxHashByVaultId));
      continue;
    }

    if (isStandardActivity(item)) {
      rows.push(projectStandardRow(item, peginTxHashByVaultId, deps));
      continue;
    }

    warnUnknownActivityTypeOnce(item.type);
  }

  return rows;
}
