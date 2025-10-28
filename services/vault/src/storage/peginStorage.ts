/**
 * Local Storage utilities for pending peg-in transactions
 *
 * Similar to simple-staking's delegation storage pattern:
 * - Store pending peg-ins in localStorage
 * - Merge with API data when available
 * - Remove from localStorage when confirmed on-chain
 */

export interface PendingPeginRequest {
  id: string; // Unique identifier (BTC tx hash or temporary ID)
  btcTxHash?: string; // BTC transaction hash (once available)
  amount: string; // BTC amount as string to avoid BigInt serialization issues
  providers: string[]; // Selected vault provider IDs
  ethAddress: string; // ETH address that initiated the peg-in
  btcAddress: string; // BTC address used
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
  } catch {
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
  } catch {
    // Silent failure - localStorage might be unavailable
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
 * Filter and clean up old pending peg-ins.
 * Removes peg-ins that exist on blockchain OR exceeded max duration.
 *
 * IMPORTANT: localStorage is a temporary placeholder until blockchain confirms the transaction.
 * - NOT on blockchain yet: Keep in localStorage (show pending state to user)
 * - ON blockchain (any presence): Remove from localStorage (blockchain is source of truth)
 * - Older than 24 hours: Remove from localStorage (cleanup stale data)
 */
export function filterPendingPegins(
  pendingPegins: PendingPeginRequest[],
  confirmedPegins: Array<{ id: string }>,
): PendingPeginRequest[] {
  const now = Date.now();

  // Create a set of confirmed pegin IDs for quick lookup
  const confirmedPeginIds = new Set(confirmedPegins.map((p) => p.id));

  return pendingPegins.filter((pegin) => {
    // If this pegin exists on blockchain (any status), remove from localStorage
    // Blockchain data is now the source of truth
    if (confirmedPeginIds.has(pegin.id)) {
      return false;
    }

    // Remove if exceeded max duration
    const age = now - pegin.timestamp;
    if (age > MAX_PENDING_DURATION) {
      return false;
    }

    // Keep in localStorage (not yet on blockchain)
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
  } catch {
    // Silent failure - localStorage might be unavailable
  }
}
