/**
 * Local Storage utilities for pending peg-in transactions
 *
 * - Store pending peg-ins in localStorage
 * - Merge with API data when available
 * - Remove from localStorage when confirmed on-chain
 */

export interface PendingPeginRequest {
  id: string; // Peg-in ID (pegin tx hash)
  timestamp: number; // When the peg-in was initiated
  status: "pending" | "payout_signed" | "confirming" | "confirmed";
}

const STORAGE_KEY_PREFIX = "vault-pending-pegins";
const MAX_PENDING_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get storage key for a specific address
 */
function getStorageKey(ethAddress: string): string {
  return `${STORAGE_KEY_PREFIX}-${ethAddress}`;
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
    return parsed;
  } catch (error) {
    console.error("[peginStorage] Failed to parse pending pegins:", error);
    return [];
  }
}

/**
 * Save pending peg-ins to localStorage
 */
export function savePendingPegins(
  ethAddress: string,
  pegins: PendingPeginRequest[],
): void {
  if (!ethAddress) return;

  try {
    const key = getStorageKey(ethAddress);
    localStorage.setItem(key, JSON.stringify(pegins));
  } catch (error) {
    console.error("[peginStorage] Failed to save pending pegins:", error);
  }
}

/**
 * Add a new pending peg-in to localStorage
 */
export function addPendingPegin(
  ethAddress: string,
  pegin: Omit<PendingPeginRequest, "timestamp" | "status">,
): void {
  const existingPegins = getPendingPegins(ethAddress);

  const newPegin: PendingPeginRequest = {
    ...pegin,
    timestamp: Date.now(),
    status: "pending",
  };

  const updatedPegins = [...existingPegins, newPegin];
  savePendingPegins(ethAddress, updatedPegins);
}

/**
 * Remove a pending peg-in from localStorage by ID
 */
export function removePendingPegin(ethAddress: string, peginId: string): void {
  const existingPegins = getPendingPegins(ethAddress);
  const updatedPegins = existingPegins.filter((p) => p.id !== peginId);
  savePendingPegins(ethAddress, updatedPegins);
}

/**
 * Update status of a pending peg-in
 */
export function updatePeginStatus(
  ethAddress: string,
  peginId: string,
  status: PendingPeginRequest["status"],
  btcTxHash?: string,
): void {
  const existingPegins = getPendingPegins(ethAddress);
  const updatedPegins = existingPegins.map((p) =>
    p.id === peginId ? { ...p, status, ...(btcTxHash && { btcTxHash }) } : p,
  );
  savePendingPegins(ethAddress, updatedPegins);
}

/**
 * Filter and clean up old pending peg-ins
 */
export function filterPendingPegins(
  pendingPegins: PendingPeginRequest[],
  confirmedPegins: Array<{ id: string; status: number }>,
): PendingPeginRequest[] {
  const now = Date.now();

  return pendingPegins.filter((pegin) => {
    // Remove if exceeded max duration (24 hours)
    const age = now - pegin.timestamp;
    if (age > MAX_PENDING_DURATION) {
      return false;
    }

    // Check if pegin exists on blockchain
    const confirmedPegin = confirmedPegins.find((p) => p.id === pegin.id);

    // If on blockchain with status >= 2 (Available/InPosition/Expired), remove from localStorage
    // At this point, blockchain is the complete source of truth - no more user actions needed
    if (confirmedPegin && confirmedPegin.status >= 2) {
      return false;
    }

    // Keep in localStorage for:
    // 1. Not yet on blockchain (still pending submission)
    // 2. Status 0 or 1 (tracking intermediate user actions: payout_signed, confirming, etc.)
    return true;
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
