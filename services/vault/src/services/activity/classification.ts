/**
 * Liquidation classification + grouping.
 *
 * Two responsibilities, intentionally kept together because they share the
 * same `liquidation`-event-shaped input and produce the rollup that the
 * Activity card layer renders:
 *
 *  - `classifyLiquidations`: point-in-time partial/full label by walking
 *    activities chronologically (no `vault.status` snapshot — see the
 *    function's own JSDoc).
 *  - `buildLiquidationGroup`: pairs a liquidation with its sibling repays
 *    (same EVM tx hash) into a single `LiquidationGroupRow`: a collateral
 *    child row, then one child row per repaid debt reserve.
 */

import { COPY } from "../../copy";
import type {
  ActivityAmount,
  LiquidationChildRow,
  LiquidationGroupRow,
} from "../../types/activityLog";

import {
  formatAmount,
  toNumericAmount,
  VAULT_COLLATERAL_ASSET,
  type FetchUserActivitiesDeps,
} from "./projection";
import { parseLogIndex, type GraphQLVaultActivityItem } from "./query";

export type LiquidationClassification =
  | "Partially Liquidated"
  | "Fully Liquidated";

/**
 * Classify each liquidation event as Partially / Fully Liquidated by walking
 * activities chronologically and tracking which vaults are still open at the
 * moment the liquidation lands. If any deposited vault remains uncleared
 * (not liquidated, withdrawn, or redeemed) right after this liquidation, it
 * is "Partially Liquidated"; otherwise "Fully Liquidated".
 *
 * This is point-in-time, not the current vault.status snapshot — a liquidation
 * that was partial at the time stays labelled partial even after later events
 * close out the remaining vaults.
 */
export function classifyLiquidations(
  items: readonly GraphQLVaultActivityItem[],
): Map<string, LiquidationClassification> {
  const result = new Map<string, LiquidationClassification>();
  // Full ascending order: timestamp → blockNumber → logIndex. Same-second
  // events (especially same-block) must be ordered by block + log position
  // or the classifier can apply a later event before the one that actually
  // happened first, mislabelling a full liquidation as partial (or vice versa).
  const sortedAsc = [...items].sort((a, b) => {
    const tsDiff = parseInt(a.timestamp, 10) - parseInt(b.timestamp, 10);
    if (tsDiff !== 0) return tsDiff;
    const blockDiff = parseInt(a.blockNumber, 10) - parseInt(b.blockNumber, 10);
    if (blockDiff !== 0) return blockDiff;
    return parseLogIndex(a.id) - parseLogIndex(b.id);
  });
  const deposited = new Set<string>();
  const closed = new Set<string>();

  for (const item of sortedAsc) {
    if (!item.vaultId) continue;
    if (item.type === "deposit") {
      deposited.add(item.vaultId);
      continue;
    }
    if (
      item.type === "liquidation" ||
      item.type === "withdrawal" ||
      item.type === "redeem"
    ) {
      closed.add(item.vaultId);
    }
    if (item.type === "liquidation") {
      const stillOpen = [...deposited].some((v) => !closed.has(v));
      result.set(
        item.id,
        stillOpen ? "Partially Liquidated" : "Fully Liquidated",
      );
    }
  }
  return result;
}

/** One debt repay settled by a liquidation, as a card child row. */
function liquidationRepayChild(
  repay: GraphQLVaultActivityItem,
  deps: FetchUserActivitiesDeps,
): LiquidationChildRow {
  const repayReserve =
    repay.debtReserveId != null
      ? deps.reserves.get(repay.debtReserveId)
      : undefined;
  return {
    id: `${repay.id}-loan`,
    label: COPY.activity.liquidation.repaidLabel,
    amount: {
      value: repayReserve
        ? formatAmount(repay.amount, repayReserve.decimals)
        : repay.amount,
      symbol: repayReserve?.symbol ?? "—",
      hubLabel: repayReserve?.hubLabel,
      // Without the reserve the token's decimals are unknown, so the raw
      // amount cannot be scaled — leave it unpriced.
      numeric: repayReserve
        ? toNumericAmount(repay.amount, repayReserve.decimals)
        : undefined,
    },
    tokenIcon: repayReserve?.icon ?? "",
    chain: "ETH",
    transactionHash: repay.transactionHash,
    date: new Date(parseInt(repay.timestamp, 10) * 1000),
  };
}

/**
 * One card per liquidation, with a "Debt repaid" child for every debt reserve
 * the liquidation settled. The same token can be owed on several hubs, so each
 * repay keeps its own row, named with its hub.
 */
export function buildLiquidationGroup(
  liquidation: GraphQLVaultActivityItem,
  repays: readonly GraphQLVaultActivityItem[],
  classification: LiquidationClassification,
  deps: FetchUserActivitiesDeps,
): LiquidationGroupRow {
  const collateralAmount: ActivityAmount = {
    value: formatAmount(liquidation.amount, VAULT_COLLATERAL_ASSET.decimals),
    symbol: VAULT_COLLATERAL_ASSET.symbol,
    numeric: toNumericAmount(
      liquidation.amount,
      VAULT_COLLATERAL_ASSET.decimals,
    ),
  };

  const repayChildren = repays.map((repay) =>
    liquidationRepayChild(repay, deps),
  );
  // The summary carries a single debt figure; the first repay stands in for it.
  const firstRepay = repayChildren[0];

  const children: LiquidationChildRow[] = [
    {
      id: `${liquidation.id}-collateral`,
      label: COPY.activity.liquidation.collateralLabel,
      amount: collateralAmount,
      tokenIcon: VAULT_COLLATERAL_ASSET.icon,
      chain: "ETH",
      transactionHash: liquidation.transactionHash,
      date: new Date(parseInt(liquidation.timestamp, 10) * 1000),
    },
    ...repayChildren,
  ];

  return {
    kind: "liquidationGroup",
    id: liquidation.id,
    date: new Date(parseInt(liquidation.timestamp, 10) * 1000),
    type: classification,
    tokenIcons: [VAULT_COLLATERAL_ASSET.icon, firstRepay?.tokenIcon ?? ""],
    summary: {
      collateral: collateralAmount,
      debt: firstRepay?.amount ?? null,
    },
    children,
    transactionHash: liquidation.transactionHash,
  };
}
