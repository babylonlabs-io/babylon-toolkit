/**
 * Service for converting localStorage pending transactions to ActivityLog format
 *
 * This module reads pending transactions from localStorage and converts them
 * to ActivityLog format for display in the Activity page.
 */

import {
  getApplicationMetadataByController,
  getEnabledApplications,
} from "../../applications";
import { getNetworkConfigBTC } from "../../config";
import {
  getPendingPegins,
  type PendingPeginRequest,
} from "../../storage/peginStorage";
import {
  getPendingCollateralVaults,
  type PendingVaultInfo,
} from "../../storage/pendingCollateralStorage";
import type { ActivityLog, ActivityType } from "../../types/activityLog";

const btcConfig = getNetworkConfigBTC();

/**
 * Convert a pending peg-in from localStorage to ActivityLog format
 */
function convertPendingPeginToActivity(
  pending: PendingPeginRequest,
): ActivityLog {
  // Get application metadata if available
  const appMetadata = pending.applicationController
    ? getApplicationMetadataByController(pending.applicationController)
    : undefined;

  return {
    id: pending.id,
    date: new Date(pending.timestamp),
    application: {
      id: appMetadata?.id ?? "unknown",
      name: appMetadata?.name ?? "Unknown App",
      logoUrl: appMetadata?.logoUrl ?? "/images/unknown-app.svg",
    },
    type: "Pending Deposit",
    amount: {
      value: pending.amount ?? "0",
      symbol: btcConfig.coinSymbol,
      icon: btcConfig.icon,
    },
    transactionHash: "", // No tx hash yet for pending
    isPending: true,
  };
}

/**
 * Map pending collateral operation to ActivityType
 */
function mapCollateralOperationType(
  operation: PendingVaultInfo["operation"],
): ActivityType {
  return operation === "add"
    ? "Pending Add Collateral"
    : "Pending Remove Collateral";
}

/**
 * Convert pending collateral operations from localStorage to ActivityLog format
 *
 * Note: Pending collateral operations are stored per-app, so we need to
 * iterate through all enabled applications to find pending entries.
 */
function getPendingCollateralActivities(ethAddress: string): ActivityLog[] {
  const activities: ActivityLog[] = [];
  const enabledApps = getEnabledApplications();

  for (const app of enabledApps) {
    const pendingVaults = getPendingCollateralVaults(
      app.metadata.id,
      ethAddress,
    );

    for (const pending of pendingVaults) {
      activities.push({
        id: `pending-collateral-${app.metadata.id}-${pending.id}`,
        date: new Date(), // No timestamp stored for collateral operations
        application: {
          id: app.metadata.id,
          name: app.metadata.name,
          logoUrl: app.metadata.logoUrl,
        },
        type: mapCollateralOperationType(pending.operation),
        amount: {
          value: "—", // Amount not stored in pending collateral
          symbol: btcConfig.coinSymbol,
          icon: btcConfig.icon,
        },
        transactionHash: "", // No tx hash yet for pending
        isPending: true,
      });
    }
  }

  return activities;
}

/**
 * Get all pending activities from localStorage
 *
 * Combines pending peg-ins (deposits) and pending collateral operations
 * into a single list sorted by date (newest first).
 *
 * @param ethAddress - User's Ethereum address
 * @returns Array of pending activities as ActivityLog
 */
export function getPendingActivities(ethAddress: string): ActivityLog[] {
  if (!ethAddress) return [];

  // Get pending deposits
  const pendingPegins = getPendingPegins(ethAddress);
  const pendingDepositActivities = pendingPegins.map(
    convertPendingPeginToActivity,
  );

  // Get pending collateral operations
  const pendingCollateralActivities =
    getPendingCollateralActivities(ethAddress);

  // Combine and sort by date (newest first)
  return [...pendingDepositActivities, ...pendingCollateralActivities].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
}
