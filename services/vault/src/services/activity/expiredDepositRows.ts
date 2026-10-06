/**
 * Feed rows for expired deposits the activity feed has no row for.
 *
 * The indexer records a `deposit` activity only when a vault activates, and the
 * browser's pending record is dropped once the indexer reports the vault
 * EXPIRED. A deposit that expired before activating therefore has no feed row
 * of its own — and the expired deposit's action (the refund, or the redeem once
 * the PegIn has swept it) attaches to a feed row by vault id. These rows give
 * such a deposit somewhere to carry that action. The caller passes only
 * deposits whose row would carry one: a row with nothing to offer would read as
 * a successful deposit.
 */

import { getNetworkConfigBTC } from "../../config";
import type { VaultActivity } from "../../types/activity";
import type { ActivityLog, ActivityRow } from "../../types/activityLog";

const btcConfig = getNetworkConfigBTC();

/** Prefix that keeps a synthetic row's id apart from indexer event ids. */
const EXPIRED_ROW_ID_PREFIX = "expired-";

/**
 * The feed row for one expired deposit, or `null` when the deposit carries no
 * timestamp to place it in the newest-first feed.
 */
function projectExpiredDepositRow(activity: VaultActivity): ActivityLog | null {
  if (activity.timestamp === undefined) return null;
  // The collateral amount is the formatted BTC string the deposit rows use;
  // the numeric form drives only the USD sub-line.
  const numeric = Number(activity.collateral.amount.replace(/,/g, ""));
  return {
    kind: "row",
    id: `${EXPIRED_ROW_ID_PREFIX}${activity.id}`,
    vaultId: activity.id,
    date: new Date(activity.timestamp),
    type: "Deposit",
    tokenIcon: btcConfig.icon,
    amount: {
      value: activity.collateral.amount,
      symbol: activity.collateral.symbol,
      numeric: Number.isFinite(numeric) ? numeric : undefined,
    },
    chain: "BTC",
    // The Pre-PegIn is the transaction an expired deposit actually broadcast.
    transactionHash: activity.prePeginTxHash ?? "",
  };
}

/**
 * Adds a row for every expired deposit the feed does not already show, keeping
 * the feed newest-first. Rows already present are returned untouched.
 */
export function withExpiredDepositRows(
  rows: ActivityRow[],
  expiredActivities: readonly VaultActivity[],
): ActivityRow[] {
  const feedVaultIds = new Set<string>();
  for (const row of rows) {
    if (row.kind === "row" && row.vaultId) feedVaultIds.add(row.vaultId);
  }
  const missing = expiredActivities
    .filter((activity) => !feedVaultIds.has(activity.id))
    .map(projectExpiredDepositRow)
    .filter((row): row is ActivityLog => row !== null);
  if (missing.length === 0) return rows;
  // Stable sort: rows that tie on date keep their incoming order.
  return [...rows, ...missing].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
}
