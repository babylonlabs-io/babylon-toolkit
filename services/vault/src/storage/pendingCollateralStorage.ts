/**
 * Local Storage utilities for pending collateral vault IDs
 *
 * Purpose:
 * - Store vault IDs that have been submitted for collateral but not yet indexed
 * - Show "Pending Deposit" UI feedback until indexer confirms
 * - Persist across page refreshes
 *
 * Cleanup Strategy:
 * - Auto-cleanup when vaults show as "In Use" in indexed data
 * - Remove stale entries older than 24 hours
 */

import {
  MAX_PENDING_DURATION,
  PENDING_COLLATERAL_KEY_PREFIX,
  PENDING_COLLATERAL_UPDATE_EVENT,
} from "../constants";

interface PendingVaultEntry {
  id: string;
  timestamp: number;
}

/**
 * Get storage key for a specific app and address
 */
function getStorageKey(appId: string, ethAddress: string): string {
  return `${PENDING_COLLATERAL_KEY_PREFIX}-${appId}-${ethAddress.toLowerCase()}`;
}

/**
 * Dispatch custom event to notify React hooks of localStorage changes
 */
function dispatchStorageUpdateEvent(appId: string, ethAddress: string): void {
  window.dispatchEvent(
    new CustomEvent(PENDING_COLLATERAL_UPDATE_EVENT, {
      detail: { appId, ethAddress },
    }),
  );
}

/**
 * Get pending collateral vault IDs from localStorage
 */
export function getPendingCollateralVaultIds(
  appId: string,
  ethAddress: string,
): string[] {
  if (!appId || !ethAddress) return [];

  try {
    const key = getStorageKey(appId, ethAddress);
    const stored = localStorage.getItem(key);
    if (!stored) return [];

    const entries: PendingVaultEntry[] = JSON.parse(stored);
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
        dispatchStorageUpdateEvent(appId, ethAddress);
      } catch (saveError) {
        console.error(
          "[pendingCollateralStorage] Failed to persist cleaned pending vaults:",
          saveError,
        );
      }
    }

    return validEntries.map((entry) => entry.id);
  } catch (error) {
    console.error(
      "[pendingCollateralStorage] Failed to parse pending vaults:",
      error,
    );
    // Clear corrupted data
    try {
      localStorage.removeItem(getStorageKey(appId, ethAddress));
    } catch (clearError) {
      console.error(
        "[pendingCollateralStorage] Failed to clear corrupted data:",
        clearError,
      );
    }
    return [];
  }
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

    dispatchStorageUpdateEvent(appId, ethAddress);
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
): void {
  if (!appId || !ethAddress || vaultIds.length === 0) return;

  const key = getStorageKey(appId, ethAddress);
  const now = Date.now();

  // Get existing entries with timestamps (single read from localStorage)
  let existingEntries: PendingVaultEntry[] = [];
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      existingEntries = JSON.parse(stored);
    }
  } catch (error) {
    console.error(
      "[pendingCollateralStorage] Failed to parse pending vaults:",
      error,
    );
    // Clear corrupted data to avoid future parse errors
    try {
      localStorage.removeItem(key);
    } catch (clearError) {
      console.error(
        "[pendingCollateralStorage] Failed to clear corrupted data:",
        clearError,
      );
    }
    existingEntries = [];
  }

  // Filter out stale entries from existing
  const validExistingEntries = existingEntries.filter(
    (entry) => now - entry.timestamp < MAX_PENDING_DURATION,
  );

  // Derive existing IDs from valid entries
  const existingIds = validExistingEntries.map((entry) => entry.id);

  // Create new entries for vault IDs that don't already exist
  const newEntries: PendingVaultEntry[] = vaultIds
    .filter((id) => !existingIds.includes(id))
    .map((id) => ({ id, timestamp: now }));

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
  let existingEntries: PendingVaultEntry[] = [];
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      existingEntries = JSON.parse(stored);
    }
  } catch {
    existingEntries = [];
  }

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
    dispatchStorageUpdateEvent(appId, ethAddress);
  } catch (error) {
    console.error(
      "[pendingCollateralStorage] Failed to clear pending vaults:",
      error,
    );
  }
}
