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
  status: 'pending' | 'confirming' | 'confirmed';
  // New fields for deferred BTC broadcasting
  unsignedTxHex?: string; // Unsigned BTC transaction hex (for broadcasting after verification)
  utxo?: {
    txid: string;
    vout: number;
    value: string; // Store as string to avoid BigInt serialization
    scriptPubKey: string;
  };
}

const STORAGE_KEY_PREFIX = 'vault-pending-pegins';
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
    // Silent fail - non-critical localStorage error
  }
}

/**
 * Add a new pending peg-in to localStorage
 */
export function addPendingPegin(
  ethAddress: string,
  pegin: Omit<PendingPeginRequest, 'timestamp' | 'status'>,
): void {
  const existingPegins = getPendingPegins(ethAddress);

  const newPegin: PendingPeginRequest = {
    ...pegin,
    timestamp: Date.now(),
    status: 'pending',
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
  status: PendingPeginRequest['status'],
  btcTxHash?: string,
): void {
  const existingPegins = getPendingPegins(ethAddress);
  const updatedPegins = existingPegins.map((p) =>
    p.id === peginId
      ? { ...p, status, ...(btcTxHash && { btcTxHash }) }
      : p,
  );
  savePendingPegins(ethAddress, updatedPegins);
}

/**
 * Filter and clean up old pending peg-ins
 * Removes peg-ins that have exceeded the max duration OR reached Available status (2+)
 *
 * IMPORTANT: For vault flow, we must keep localStorage data until BTC is broadcast:
 * - Status 0 (Pending): Keep in localStorage (waiting for provider ACK)
 * - Status 1 (Verified): Keep in localStorage (need unsignedTxHex/utxo for BTC broadcast)
 * - Status 2+ (Available/Expired): Remove from localStorage (BTC broadcast complete or expired)
 */
export function filterPendingPegins(
  pendingPegins: PendingPeginRequest[],
  confirmedPegins: Array<{ id: string; status: number }>,
): PendingPeginRequest[] {
  const now = Date.now();

  // Create a map of confirmed pegin IDs to their status for quick lookup
  const confirmedPeginMap = new Map(
    confirmedPegins.map((p) => [p.id, p.status])
  );

  return pendingPegins.filter((pegin) => {
    // Check if this pegin exists in confirmed pegins
    const confirmedStatus = confirmedPeginMap.get(pegin.id);

    if (confirmedStatus !== undefined) {
      // If status is Available (2) or higher, remove from localStorage
      // (BTC broadcast is complete or pegin expired)
      if (confirmedStatus >= 2) {
        return false;
      }
      // If status is Pending (0) or Verified (1), keep in localStorage
      // (still need unsignedTxHex and utxo for BTC broadcast)
      return true;
    }

    // Remove if exceeded max duration
    const age = now - pegin.timestamp;
    if (age > MAX_PENDING_DURATION) {
      return false;
    }

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
    // Silent fail - non-critical localStorage error
  }
}
