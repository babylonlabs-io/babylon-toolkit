/**
 * Local Storage utilities for pending peg-in transactions
 *
 * Purpose:
 * - Store pending deposits temporarily until they appear on-chain
 * - Show immediate feedback to users after deposit submission
 * - Auto-cleanup once transaction is confirmed on blockchain
 *
 * Cleanup Strategy:
 * - Remove when transaction exists in contract (contract = source of truth)
 * - Remove when older than 24 hours (stale data)
 * - Keep only transactions not yet on blockchain
 */

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
  status: "pending" | "payout_signed" | "confirming" | "confirmed";
  amount?: string; // Amount in BTC (formatted for display)
  providerId?: string[]; // Vault provider's Ethereum addresses
  btcTxHash?: string; // BTC transaction hash (optional)
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
    // Also normalize providerId from string to array (handles legacy data)
    const normalized = parsed.map((pegin) => {
      const normalizedPegin: PendingPeginRequest = {
        ...pegin,
        id: normalizeTransactionId(pegin.id),
        // Migrate providerId from string to array if needed
        providerId:
          pegin.providerId === undefined
            ? undefined
            : Array.isArray(pegin.providerId)
              ? pegin.providerId
              : [pegin.providerId as unknown as string], // Legacy: was string, now array
      };
      return normalizedPegin;
    });

    // Check if any IDs or providerIds were normalized (legacy data)
    const hasLegacyData = parsed.some(
      (pegin, index) =>
        pegin.id !== normalized[index].id ||
        (typeof pegin.providerId === "string" &&
          Array.isArray(normalized[index].providerId)),
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
 */
export function addPendingPegin(
  ethAddress: string,
  pegin: Omit<PendingPeginRequest, "timestamp" | "status"> & {
    status?: PendingPeginRequest["status"];
  },
): void {
  const existingPegins = getPendingPegins(ethAddress);

  // Normalize the ID to ensure it has 0x prefix
  const normalizedId = normalizeTransactionId(pegin.id);

  // Remove existing pegin with same txid to prevent duplicates
  const filteredPegins = existingPegins.filter((p) => p.id !== normalizedId);

  const newPegin: PendingPeginRequest = {
    ...pegin,
    id: normalizedId, // Use normalized ID
    status: pegin.status || "pending", // Default to "pending" if not provided
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
 */
export function updatePeginStatus(
  ethAddress: string,
  peginId: string,
  status: PendingPeginRequest["status"],
  btcTxHash?: string,
): void {
  const existingPegins = getPendingPegins(ethAddress);
  const normalizedId = normalizeTransactionId(peginId);
  const updatedPegins = existingPegins.map((p) =>
    p.id === normalizedId
      ? { ...p, status, ...(btcTxHash && { btcTxHash }) }
      : p,
  );
  savePendingPegins(ethAddress, updatedPegins);
}

/**
 * Filter and clean up old pending peg-ins
 *
 * Removes items from localStorage if:
 * 1. Transaction exists on blockchain (any status) - contract is source of truth
 * 2. Older than 24 hours - cleanup stale items
 *
 * Keeps items only if they're not yet on blockchain (still pending confirmation)
 */
export function filterPendingPegins(
  pendingPegins: PendingPeginRequest[],
  confirmedPegins: Array<{ id: string; status: number }>,
): PendingPeginRequest[] {
  const now = Date.now();

  // Normalize confirmed pegin IDs to ensure they have 0x prefix
  const normalizedConfirmedPegins = confirmedPegins.map((p) => ({
    id: normalizeTransactionId(p.id),
    status: p.status,
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

    // If it exists on blockchain, remove from localStorage
    // The contract is now the source of truth - no need to keep in localStorage anymore
    if (confirmedPegin) {
      return false;
    }

    // Keep in localStorage only if not yet on blockchain
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
