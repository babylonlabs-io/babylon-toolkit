/**
 * Service for converting localStorage pending transactions to ActivityLog format
 *
 * This module reads pending transactions from localStorage and converts them
 * to ActivityLog format for display in the Activity page.
 */

import { getNetworkConfigBTC } from "../../config";
import {
  getPendingPegins,
  type PendingPeginRequest,
} from "../../storage/peginStorage";
import {
  type ActivityLog,
  PENDING_DEPOSIT_TYPE,
} from "../../types/activityLog";

const btcConfig = getNetworkConfigBTC();

/**
 * Convert a pending peg-in from localStorage to ActivityLog format
 */
function convertPendingPeginToActivity(
  pending: PendingPeginRequest,
): ActivityLog | null {
  if (!pending.amount) {
    return null;
  }

  return {
    kind: "row",
    id: pending.id,
    date: new Date(pending.timestamp),
    type: PENDING_DEPOSIT_TYPE,
    tokenIcon: btcConfig.icon,
    amount: {
      value: pending.amount,
      symbol: btcConfig.coinSymbol,
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
 * Only includes entries with valid, complete data.
 *
 * @param ethAddress - User's Ethereum address
 * @returns Array of pending activities as ActivityLog
 */
export function getPendingActivities(ethAddress: string): ActivityLog[] {
  if (!ethAddress) return [];

  // Get pending deposits, filtering out any with missing data
  const pendingPegins = getPendingPegins(ethAddress);
  const pendingDepositActivities = pendingPegins
    .map(convertPendingPeginToActivity)
    .filter((activity): activity is ActivityLog => activity !== null);

  // Sort by date (newest first)
  return pendingDepositActivities.sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
}
