/**
 * Local Storage utilities for pending collateral vault IDs
 *
 * Purpose:
 * - Store vault IDs that have been submitted for collateral operations but not yet indexed
 * - Show "Pending" UI feedback until indexer confirms
 * - Persist across page refreshes
 *
 * Cleanup Strategy:
 * - Auto-cleanup when vaults reach expected status in indexed data
 * - Remove stale entries older than 24 hours
 */

import {
  MAX_PENDING_DURATION,
  PENDING_COLLATERAL_KEY_PREFIX,
} from "../constants";

/** Type of pending vault operation */
export type PendingOperation = "add" | "withdraw" | "redeem";

interface PendingVaultEntry {
  id: string;
  timestamp: number;
  /** The operation type - determines expected final status */
  operation: PendingOperation;
}

/**
 * Get storage key for a specific app and address
 */
function getStorageKey(appId: string, ethAddress: string): string {
  return `${PENDING_COLLATERAL_KEY_PREFIX}-${appId}-${ethAddress.toLowerCase()}`;
}

/**
 * Read and parse pending vault entries from localStorage.
 * Returns empty array if storage is empty or corrupted.
 */
function readEntries(key: string): PendingVaultEntry[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error(
      "[pendingCollateralStorage] Failed to parse pending vaults:",
      error,
    );
    // Clear corrupted data
    try {
      localStorage.removeItem(key);
    } catch (clearError) {
      console.error(
        "[pendingCollateralStorage] Failed to clear corrupted data:",
        clearError,
      );
    }
    return [];
  }
}

/** Pending vault info returned from storage */
export interface PendingVaultInfo {
  id: string;
  operation: PendingOperation;
}

/**
 * Get pending collateral vault entries from localStorage
 */
export function getPendingCollateralVaults(
  appId: string,
  ethAddress: string,
): PendingVaultInfo[] {
  if (!appId || !ethAddress) return [];

  const key = getStorageKey(appId, ethAddress);
  const entries = readEntries(key);
  if (entries.length === 0) return [];

  const now = Date.now();
  const validEntries = entries.filter(
    (entry) => now - entry.timestamp < MAX_PENDING_DURATION,
  );

  // Persist cleaned entries back to storage to remove stale data
  if (validEntries.length !== entries.length) {
    try {
      if (validEntries.length === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(validEntries));
      }
    } catch (saveError) {
      console.error(
        "[pendingCollateralStorage] Failed to persist cleaned pending vaults:",
        saveError,
      );
    }
  }

  return validEntries.map((entry) => ({
    id: entry.id,
    operation: entry.operation ?? "add", // Default for backwards compatibility
  }));
}

/**
 * Save pending collateral vault IDs to localStorage
 */
function savePendingCollateralVaultIds(
  appId: string,
  ethAddress: string,
  entries: PendingVaultEntry[],
): void {
  if (!appId || !ethAddress) return;

  try {
    const key = getStorageKey(appId, ethAddress);

    if (entries.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(entries));
    }
  } catch (error) {
    console.error(
      "[pendingCollateralStorage] Failed to save pending vaults:",
      error,
    );
  }
}

/**
 * Add vault IDs to pending collateral storage
 */
export function addPendingCollateralVaultIds(
  appId: string,
  ethAddress: string,
  vaultIds: string[],
  operation: PendingOperation,
): void {
  if (!appId || !ethAddress || vaultIds.length === 0) return;

  const key = getStorageKey(appId, ethAddress);
  const now = Date.now();
  const existingEntries = readEntries(key);

  // Filter out stale entries from existing
  const validExistingEntries = existingEntries.filter(
    (entry) => now - entry.timestamp < MAX_PENDING_DURATION,
  );

  // Derive existing IDs from valid entries
  const existingIds = new Set(validExistingEntries.map((entry) => entry.id));

  // Create new entries for vault IDs that don't already exist
  const newEntries: PendingVaultEntry[] = vaultIds
    .filter((id) => !existingIds.has(id))
    .map((id) => ({ id, timestamp: now, operation }));

  savePendingCollateralVaultIds(appId, ethAddress, [
    ...validExistingEntries,
    ...newEntries,
  ]);
}

/**
 * Remove vault IDs from pending collateral storage
 */
export function removePendingCollateralVaultIds(
  appId: string,
  ethAddress: string,
  vaultIds: string[],
): void {
  if (!appId || !ethAddress || vaultIds.length === 0) return;

  const key = getStorageKey(appId, ethAddress);
  const existingEntries = readEntries(key);

  const idsToRemove = new Set(vaultIds);
  const updatedEntries = existingEntries.filter(
    (entry) => !idsToRemove.has(entry.id),
  );

  savePendingCollateralVaultIds(appId, ethAddress, updatedEntries);
}

/**
 * Clear all pending collateral vault IDs for an app and address
 */
export function clearPendingCollateralVaultIds(
  appId: string,
  ethAddress: string,
): void {
  if (!appId || !ethAddress) return;

  try {
    const key = getStorageKey(appId, ethAddress);
    localStorage.removeItem(key);
  } catch (error) {
    console.error(
      "[pendingCollateralStorage] Failed to clear pending vaults:",
      error,
    );
  }
}
