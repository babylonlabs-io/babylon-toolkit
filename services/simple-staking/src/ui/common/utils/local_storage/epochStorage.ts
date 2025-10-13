import { network } from "@/ui/common/config/network/bbn";

/**
 * Combined storage structure for epoch and pending operations.
 * This ensures epoch and pending operations are always in sync.
 * When epoch changes, pending operations are automatically cleared.
 */
export interface BabyEpochData {
  epoch: number;
  pendingOperations: Record<string, any[]>; // walletAddress -> operations[]
}

const BABY_EPOCH_DATA_KEY = `baby-epoch-data-v1-${network}`;

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
    window.dispatchEvent(new Event("baby-epoch-updated"));
  } catch {
    /* noop */
  }
}
