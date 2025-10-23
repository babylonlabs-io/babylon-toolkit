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
