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
 *  - `buildLiquidationGroup`: pairs a liquidation with its sibling repay
 *    (same EVM tx hash) into a single `LiquidationGroupRow` with two child
 *    rows for the card body.
 */

import { COPY } from "../../copy";
import type {
  ActivityAmount,
  LiquidationChildRow,
  LiquidationGroupRow,
} from "../../types/activityLog";

import {
  formatAmount,
  VAULT_COLLATERAL_ASSET,
  type FetchUserActivitiesDeps,
} from "./projection";
import type { GraphQLVaultActivityItem } from "./query";

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
  const sortedAsc = [...items].sort(
    (a, b) => parseInt(a.timestamp, 10) - parseInt(b.timestamp, 10),
  );
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

export function buildLiquidationGroup(
  liquidation: GraphQLVaultActivityItem,
  repay: GraphQLVaultActivityItem | undefined,
  classification: LiquidationClassification,
  deps: FetchUserActivitiesDeps,
): LiquidationGroupRow {
  const collateralAmount: ActivityAmount = {
    value: formatAmount(liquidation.amount, VAULT_COLLATERAL_ASSET.decimals),
    symbol: VAULT_COLLATERAL_ASSET.symbol,
  };

  const repayReserve =
    repay && repay.debtReserveId != null
      ? deps.reserves.get(repay.debtReserveId)
      : undefined;
  const debtAmount: ActivityAmount | null = repay
    ? {
        value: repayReserve
          ? formatAmount(repay.amount, repayReserve.decimals)
          : repay.amount,
        symbol: repayReserve?.symbol ?? "—",
      }
    : null;
  const debtIcon = repayReserve?.icon ?? "";

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
  ];
  if (repay && debtAmount) {
    children.push({
      id: `${repay.id}-loan`,
      label: COPY.activity.liquidation.repaidLabel,
      amount: debtAmount,
      tokenIcon: debtIcon,
      chain: "ETH",
      transactionHash: repay.transactionHash,
      date: new Date(parseInt(repay.timestamp, 10) * 1000),
    });
  }

  return {
    kind: "liquidationGroup",
    id: liquidation.id,
    date: new Date(parseInt(liquidation.timestamp, 10) * 1000),
    type: classification,
    tokenIcons: [VAULT_COLLATERAL_ASSET.icon, debtIcon],
    summary: {
      collateral: collateralAmount,
      debt: debtAmount,
    },
    children,
    transactionHash: liquidation.transactionHash,
  };
}
