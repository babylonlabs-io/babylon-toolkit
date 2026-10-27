/**
 * Service for converting localStorage pending transactions to ActivityLog format
 *
 * This module reads pending transactions from localStorage and converts them
 * to ActivityLog format for display in the Activity page.
 */

import { getNetworkConfigBTC } from "../../config";
import { LocalStorageStatus } from "../../models/peginStateMachine";
import {
  getPendingPegins,
  type PendingPeginRequest,
  PendingPeginStorageReadError,
} from "../../storage/peginStorage";
import {
  type ActivityLog,
  PENDING_DEPOSIT_TYPE,
} from "../../types/activityLog";

const btcConfig = getNetworkConfigBTC();

/**
 * Local statuses of a deposit still in flight. A REFUND_BROADCAST record marks
 * a refund of an expired deposit, not a deposit: projecting it would date the
 * old deposit at the refund time and hide its expired-deposit row (see
 * expiredDepositRows.ts). Positive list, so a new status is not shown by default.
 */
const DEPOSIT_IN_FLIGHT_STATUSES: ReadonlySet<LocalStorageStatus> = new Set([
  LocalStorageStatus.PENDING,
  LocalStorageStatus.PAYOUT_SIGNED,
  LocalStorageStatus.CONFIRMING,
  LocalStorageStatus.CONFIRMED,
]);

/**
 * Convert a pending peg-in from localStorage to ActivityLog format
 */
function convertPendingPeginToActivity(
  pending: PendingPeginRequest,
): ActivityLog | null {
  if (!pending.amount || !DEPOSIT_IN_FLIGHT_STATUSES.has(pending.status)) {
    return null;
  }

  return {
    kind: "row",
    id: pending.id,
    // A pending peg-in's storage id IS the derived vault id.
    vaultId: pending.id,
    date: new Date(pending.timestamp),
    type: PENDING_DEPOSIT_TYPE,
    tokenIcon: btcConfig.icon,
    amount: {
      value: pending.amount,
      symbol: btcConfig.coinSymbol,
      // localStorage holds the amount as the user-facing BTC string, so it is
      // already unscaled. A malformed entry stays unpriced.
      numeric: Number.isFinite(Number(pending.amount))
        ? Number(pending.amount)
        : undefined,
    },
    chain: "BTC",
    transactionHash: pending.peginTxHash,
    isPending: true,
  };
}

/**
 * Get all pending activities from localStorage
 *
 * Returns pending peg-in (deposit) activities sorted by date (newest first).
 * Only includes deposits still in flight, with valid, complete data.
 *
 * @param ethAddress - User's Ethereum address
 * @returns Array of pending activities as ActivityLog
 */
export function getPendingActivities(ethAddress: string): ActivityLog[] {
  if (!ethAddress) return [];

  // Get pending deposits, filtering out any with missing data
  let pendingPegins: PendingPeginRequest[] = [];
  try {
    pendingPegins = getPendingPegins(ethAddress);
  } catch (error) {
    if (!(error instanceof PendingPeginStorageReadError)) throw error;
  }
  const pendingDepositActivities = pendingPegins
    .map(convertPendingPeginToActivity)
    .filter((activity): activity is ActivityLog => activity !== null);

  // Sort by date (newest first)
  return pendingDepositActivities.sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
}
