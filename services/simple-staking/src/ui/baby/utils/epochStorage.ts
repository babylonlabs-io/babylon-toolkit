import { network } from "@/ui/common/config/network/bbn";

/**
 * localStorage-serializable format of PendingOperation.
 * Converts bigint → string because JSON doesn't support BigInt.
 */
export interface PendingOperationStorage {
  validatorAddress: string;
  amount: string; // Serialized bigint
  operationType: "stake" | "unstake";
  timestamp: number;
  walletAddress: string;
  epoch: number;
}

/**
 * Combined storage structure for epoch and pending operations.
 * This ensures epoch and pending operations are always in sync.
 * When epoch changes, pending operations are automatically cleared.
 */
export interface BabyEpochData {
  epoch: number;
  pendingOperations: Record<string, PendingOperationStorage[]>; // walletAddress -> operations[]
}

// Storage keys - centralized to avoid magic strings throughout the codebase
const BABY_EPOCH_DATA_KEY = `baby-epoch-data-v1-${network}`;

// Custom event names for cross-component communication
export const BABY_EPOCH_UPDATED_EVENT = "baby-epoch-updated";
export const BABY_PENDING_OPERATIONS_UPDATED_EVENT =
  "baby-pending-operations-updated";

export function getBabyEpochData(): BabyEpochData | null {
  try {
    const value = localStorage.getItem(BABY_EPOCH_DATA_KEY);
    if (!value) return null;
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function setBabyEpochData(data: BabyEpochData): void {
  try {
    localStorage.setItem(BABY_EPOCH_DATA_KEY, JSON.stringify(data));
  } catch {
    /* noop */
  }
}

export function getCurrentEpoch(): number | undefined {
  const data = getBabyEpochData();
  return data?.epoch;
}

export function setCurrentEpoch(epoch: number): void {
  try {
    if (!Number.isFinite(epoch)) return;

    const currentData = getBabyEpochData();

    // If epoch changed, clear all pending operations
    if (currentData && currentData.epoch !== epoch) {
      setBabyEpochData({
        epoch,
        pendingOperations: {}, // Clear all pending operations on epoch change
      });
    } else if (currentData) {
      // Same epoch, keep existing pending operations
      setBabyEpochData({
        ...currentData,
        epoch,
      });
    } else {
      // First time setting epoch
      setBabyEpochData({
        epoch,
        pendingOperations: {},
      });
    }

    // Emit custom event for same-tab updates
    window.dispatchEvent(new Event(BABY_EPOCH_UPDATED_EVENT));
  } catch {
    /* noop */
  }
}
