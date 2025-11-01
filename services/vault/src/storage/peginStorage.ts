/**
 * Local Storage utilities for pending peg-in transactions
 *
 * Purpose:
 * - Store pending deposits temporarily until they reach Available state (contract status 2+)
 * - Track user actions through localStorage status field
 * - Show immediate feedback to users after deposit submission
 * - Auto-cleanup based on peginStateMachine shouldRemoveFromLocalStorage logic
 *
 * Cleanup Strategy:
 * - Keep entries for contract status 0-1 (PENDING, VERIFIED)
 * - Remove entries for contract status 2+ (AVAILABLE, IN_POSITION, EXPIRED)
 * - Remove when older than 24 hours (stale data)
 * - Status field tracks user actions: pending → payout_signed → confirming
 */

import {
  LocalStorageStatus,
  shouldRemoveFromLocalStorage,
  type ContractStatus,
} from "../models/peginStateMachine";

/**
 * Provider information stored in localStorage
 * Minimal set needed for UI display
 */
export interface StoredProvider {
  id: string; // Vault provider's Ethereum address
  name?: string; // Provider display name (if available)
  icon?: string; // Provider icon URL (if available)
}

export interface PendingPeginRequest {
  id: string; // Peg-in ID (pegin tx hash)
  timestamp: number; // When the peg-in was initiated
  amount?: string; // Amount in BTC (formatted for display)
  providerIds?: string[]; // Vault provider's Ethereum addresses
  status?: LocalStorageStatus; // Track user actions (pending, payout_signed, confirming)
  btcTxHash?: string; // BTC transaction hash (set when broadcasting to Bitcoin)
  // Fields for cross-device broadcasting support
  unsignedTxHex?: string; // Unsigned BTC transaction hex (for broadcasting later)
  selectedUTXOs?: Array<{
    // UTXOs used in the transaction
    txid: string;
    vout: number;
    value: string; // Store as string for JSON serialization
    scriptPubKey: string;
  }>;
}

const STORAGE_KEY_PREFIX = "vault-pending-pegins";
const MAX_PENDING_DURATION = 24 * 60 * 60 * 1000; // 24 hours - cleanup stale items

/**
 * Get storage key for a specific address
 */
function getStorageKey(ethAddress: string): string {
  return `${STORAGE_KEY_PREFIX}-${ethAddress}`;
}

/**
 * Normalize transaction ID to ensure it has 0x prefix
 * This handles legacy data that might not have the prefix
 */
function normalizeTransactionId(id: string): string {
  return id.startsWith("0x") ? id : `0x${id}`;
}

/**
 * Get all pending peg-ins from localStorage for an address
 */
export function getPendingPegins(ethAddress: string): PendingPeginRequest[] {
  if (!ethAddress) return [];

  try {
    const key = getStorageKey(ethAddress);
    const stored = localStorage.getItem(key);
    if (!stored) return [];

    const parsed: PendingPeginRequest[] = JSON.parse(stored);

    // Normalize IDs to ensure they all have 0x prefix (handles legacy data)
    const normalized = parsed.map((pegin) => ({
      ...pegin,
      id: normalizeTransactionId(pegin.id),
    }));

    // Check if any IDs were normalized (legacy data)
    const hasLegacyData = parsed.some(
      (pegin, index) => pegin.id !== normalized[index].id,
    );

    // If we normalized any legacy data, save it back to localStorage
    if (hasLegacyData) {
      localStorage.setItem(key, JSON.stringify(normalized));
    }

    return normalized;
  } catch (error) {
    console.error("[peginStorage] Failed to parse pending pegins:", error);
    return [];
  }
}

/**
 * Save pending peg-ins to localStorage
 * If pegins array is empty, delete the entire key instead of storing empty array
 */
export function savePendingPegins(
  ethAddress: string,
  pegins: PendingPeginRequest[],
): void {
  if (!ethAddress) return;

  try {
    const key = getStorageKey(ethAddress);

    // If no pegins left, delete the entire key
    if (pegins.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(pegins));
    }
  } catch (error) {
    console.error("[peginStorage] Failed to save pending pegins:", error);
  }
}

/**
 * Add a new pending peg-in to localStorage
 * Prevents duplicates: if txid already exists, removes old entry before adding new one
 * Status defaults to LocalStorageStatus.PENDING if not provided
 */
export function addPendingPegin(
  ethAddress: string,
  pegin: Omit<PendingPeginRequest, "timestamp">,
): void {
  const existingPegins = getPendingPegins(ethAddress);

  // Normalize the ID to ensure it has 0x prefix
  const normalizedId = normalizeTransactionId(pegin.id);

  // Remove existing pegin with same txid to prevent duplicates
  const filteredPegins = existingPegins.filter((p) => p.id !== normalizedId);

  const newPegin: PendingPeginRequest = {
    ...pegin,
    id: normalizedId, // Use normalized ID
    status: pegin.status || LocalStorageStatus.PENDING, // Default to PENDING
    timestamp: Date.now(),
  };

  // Add new pegin
  const updatedPegins = [...filteredPegins, newPegin];

  savePendingPegins(ethAddress, updatedPegins);
}

/**
 * Remove a pending peg-in from localStorage by ID
 */
export function removePendingPegin(ethAddress: string, peginId: string): void {
  const existingPegins = getPendingPegins(ethAddress);
  const normalizedId = normalizeTransactionId(peginId);
  const updatedPegins = existingPegins.filter((p) => p.id !== normalizedId);
  savePendingPegins(ethAddress, updatedPegins);
}

/**
 * Update status of a pending peg-in
 * Used to track user actions through the peg-in flow
 * Optionally updates btcTxHash when broadcasting to Bitcoin
 */
export function updatePendingPeginStatus(
  ethAddress: string,
  peginId: string,
  status: LocalStorageStatus,
  btcTxHash?: string,
): void {
  const existingPegins = getPendingPegins(ethAddress);
  const normalizedId = normalizeTransactionId(peginId);

  const updatedPegins = existingPegins.map((pegin) =>
    pegin.id === normalizedId
      ? { ...pegin, status, ...(btcTxHash && { btcTxHash }) }
      : pegin,
  );

  savePendingPegins(ethAddress, updatedPegins);
}

/**
 * Filter and clean up old pending peg-ins
 *
 * Uses peginStateMachine.shouldRemoveFromLocalStorage() for cleanup logic:
 * - Keep entries for contract status 0-1 (PENDING, VERIFIED)
 * - Remove entries for contract status 2+ (AVAILABLE, IN_POSITION, EXPIRED)
 * - Remove entries older than 24 hours (stale data)
 * - Remove when contract status has progressed beyond local status
 *
 * This ensures localStorage stays in sync with the state machine
 */
export function filterPendingPegins(
  pendingPegins: PendingPeginRequest[],
  confirmedPegins: Array<{ id: string; status: number }>,
): PendingPeginRequest[] {
  const now = Date.now();

  // Normalize confirmed pegin IDs to ensure they have 0x prefix
  const normalizedConfirmedPegins = confirmedPegins.map((p) => ({
    id: normalizeTransactionId(p.id),
    status: p.status as ContractStatus,
  }));

  return pendingPegins.filter((pegin) => {
    // Normalize the pending pegin ID as well (should already be normalized, but just in case)
    const normalizedPeginId = normalizeTransactionId(pegin.id);

    // Remove if exceeded max duration (24 hours)
    const age = now - pegin.timestamp;
    if (age > MAX_PENDING_DURATION) {
      return false;
    }

    // Check if pegin exists on blockchain (using normalized IDs)
    const confirmedPegin = normalizedConfirmedPegins.find(
      (p) => p.id === normalizedPeginId,
    );

    // If it doesn't exist on blockchain yet, keep it in localStorage
    if (!confirmedPegin) {
      return true;
    }

    // If it exists on blockchain, use peginStateMachine to determine if we should remove it
    // This handles the logic for keeping status 0-1 and removing status 2+
    if (pegin.status && confirmedPegin) {
      return !shouldRemoveFromLocalStorage(confirmedPegin.status, pegin.status);
    }

    // If no status in localStorage, remove it if on blockchain (legacy behavior)
    return false;
  });
}

/**
 * Clear all pending peg-ins for an address
 */
export function clearPendingPegins(ethAddress: string): void {
  if (!ethAddress) return;

  try {
    const key = getStorageKey(ethAddress);
    localStorage.removeItem(key);
  } catch (error) {
    console.error("[peginStorage] Failed to clear pending pegins:", error);
  }
}
