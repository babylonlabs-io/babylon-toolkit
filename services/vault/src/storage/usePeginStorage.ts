/**
 * React hook for managing pending peg-in storage
 *
 * Combines confirmed peg-ins from the API with pending peg-ins from localStorage.
 * Provides helpers to add/update pending peg-ins and automatically cleans up
 * confirmed transactions from localStorage.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { getNetworkConfigBTC } from "../config";
import { STORAGE_UPDATE_EVENT } from "../constants";
import {
  ContractStatus,
  getPeginState,
  type LocalStorageStatus,
} from "../models/peginStateMachine";
import type { VaultActivity } from "../types/activity";
import { useDebounce } from "../utils/hooks";

import {
  addPendingPegin as addPendingPeginToStorage,
  filterPendingPegins,
  getPendingPegins,
  markRefundBroadcast as markRefundBroadcastInStorage,
  type PendingPeginRequest,
  savePendingPegins,
  updatePendingPeginStatus as updatePendingPeginStatusInStorage,
} from "./peginStorage";

const btcConfig = getNetworkConfigBTC();

export interface UsePeginStorageParams {
  /** Connected Ethereum address */
  ethAddress: string;
  /** Confirmed peg-ins from API */
  confirmedPegins: VaultActivity[];
}

export interface UsePeginStorageResult {
  /** All activities (pending + confirmed, merged and deduplicated) */
  allActivities: VaultActivity[];
  /** Pending peg-ins from localStorage */
  pendingPegins: PendingPeginRequest[];
  /** Add a new pending peg-in to localStorage */
  addPendingPegin: (pegin: Omit<PendingPeginRequest, "timestamp">) => void;
  /** Update status of a pending peg-in */
  updatePendingPeginStatus: (
    vaultId: string,
    status: LocalStorageStatus,
  ) => void;
  /**
   * Mark a pegin as REFUND_BROADCAST and stamp the broadcast time used by the
   * optimistic-suppression TTL.
   */
  markRefundBroadcast: (vaultId: string, refundBroadcastAt: number) => void;
}

/**
 * Hook to manage pending peg-in storage
 *
 * @param params - Hook parameters
 * @returns Storage management functions and merged activities
 */
export function usePeginStorage({
  ethAddress,
  confirmedPegins,
}: UsePeginStorageParams): UsePeginStorageResult {
  // Use state to allow manual updates when localStorage changes
  const [pendingPegins, setPendingPegins] = useState<PendingPeginRequest[]>([]);
  const [storageVersion, setStorageVersion] = useState(0);

  // Load pending peg-ins from localStorage whenever ethAddress changes or storage is updated
  useEffect(() => {
    if (!ethAddress) {
      setPendingPegins([]);
      return;
    }
    setPendingPegins(getPendingPegins(ethAddress));
  }, [ethAddress, storageVersion]);

  // Listen for custom events when localStorage is updated (same-tab updates)
  useEffect(() => {
    if (!ethAddress) return;

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ ethAddress: string }>;
      if (customEvent.detail.ethAddress === ethAddress) {
        // Trigger refresh by incrementing version
        setStorageVersion((v) => v + 1);
      }
    };

    window.addEventListener(STORAGE_UPDATE_EVENT, handleCustomEvent);

    return () => {
      window.removeEventListener(STORAGE_UPDATE_EVENT, handleCustomEvent);
    };
  }, [ethAddress]);

  // Clean up old pending peg-ins - debounced to avoid excessive writes
  // Note: This effect does NOT depend on pendingPegins to avoid circular dependency
  const cleanupPendingPegins = useCallback(() => {
    if (!ethAddress) return;

    // Read fresh data from localStorage (not from stale state)
    const currentPegins = getPendingPegins(ethAddress);

    const filteredPegins = filterPendingPegins(
      currentPegins,
      confirmedPegins.map((p) => ({
        id: p.id,
        status: p.contractStatus ?? ContractStatus.PENDING,
      })),
    );

    // Only save if something actually changed
    if (filteredPegins.length !== currentPegins.length) {
      savePendingPegins(ethAddress, filteredPegins);
      // No need to manually update state - event listener will trigger refresh
    }
  }, [ethAddress, confirmedPegins]);

  // Debounce the cleanup to avoid excessive localStorage writes
  const debouncedCleanup = useDebounce(cleanupPendingPegins, 500);

  // Run cleanup when confirmed pegins change
  useEffect(() => {
    debouncedCleanup();
  }, [debouncedCleanup]);

  // Merge pending and confirmed activities
  const allActivities = useMemo(() => {
    // Create a map of confirmed activities by ID for quick lookup
    const confirmedMap = new Map(confirmedPegins.map((p) => [p.id, p]));

    // Create a map of pending pegins by ID for quick lookup
    const pendingMap = new Map(pendingPegins.map((p) => [p.id, p]));

    // Convert pending peg-ins to VaultActivity format (only those not yet on blockchain)
    const pendingActivities: VaultActivity[] = pendingPegins
      .filter((pending) => !confirmedMap.has(pending.id))
      .map((pending) => ({
        id: pending.id,
        peginTxHash: pending.peginTxHash,
        collateral: {
          amount: pending.amount || "0",
          symbol: btcConfig.coinSymbol,
        },
        providers: pending.providerIds
          ? [
              {
                id: pending.providerIds?.join(",") || "",
              },
            ]
          : [],
        applicationEntryPoint: pending.applicationEntryPoint,
        contractStatus: ContractStatus.PENDING,
        displayLabel: getPeginState(ContractStatus.PENDING).displayLabel,
        isPending: true,
        pendingMessage: "Transaction pending confirmation...",
        timestamp: pending.timestamp,
        depositorBtcPubkey: pending.depositorBtcPubkey,
        unsignedPrePeginTx: pending.unsignedTxHex,
        depositorWotsPkHash: "",
      }));

    // Update confirmed activities with localStorage status (for displayLabel)
    // This ensures e.g. "CONFIRMING" status shows "Confirming" instead of "Verified"
    const confirmedWithLocalStatus: VaultActivity[] = confirmedPegins.map(
      (activity) => {
        const pendingPegin = pendingMap.get(activity.id);
        if (pendingPegin?.status) {
          // Re-compute displayLabel with localStorage status
          const state = getPeginState(
            (activity.contractStatus ??
              ContractStatus.PENDING) as ContractStatus,
            {
              localStatus: pendingPegin.status,
              isInUse: activity.isInUse,
              refundBroadcastAt: pendingPegin.refundBroadcastAt,
            },
          );
          return {
            ...activity,
            displayLabel: state.displayLabel,
          };
        }
        return activity;
      },
    );

    // Combine and sort by timestamp (newest first)
    // Use Date.now() as fallback for items without timestamps
    return [...pendingActivities, ...confirmedWithLocalStatus].sort((a, b) => {
      const aTime = a.timestamp || Date.now();
      const bTime = b.timestamp || Date.now();
      return bTime - aTime;
    });
  }, [pendingPegins, confirmedPegins]);

  // Add pending peg-in - storage function will dispatch event
  const addPendingPegin = useCallback(
    (pegin: Omit<PendingPeginRequest, "timestamp">) => {
      if (!ethAddress) return;
      addPendingPeginToStorage(ethAddress, pegin);
      // Event will be dispatched by storage function - no manual state update needed
    },
    [ethAddress],
  );

  // Update pending peg-in status - storage function will dispatch event
  const updatePendingPeginStatus = useCallback(
    (vaultId: string, status: LocalStorageStatus) => {
      if (!ethAddress) return;
      updatePendingPeginStatusInStorage(ethAddress, vaultId, status);
      // Event will be dispatched by storage function - no manual state update needed
    },
    [ethAddress],
  );

  const markRefundBroadcast = useCallback(
    (vaultId: string, refundBroadcastAt: number) => {
      if (!ethAddress) return;
      markRefundBroadcastInStorage(ethAddress, vaultId, refundBroadcastAt);
    },
    [ethAddress],
  );

  return {
    allActivities,
    pendingPegins,
    addPendingPegin,
    updatePendingPeginStatus,
    markRefundBroadcast,
  };
}
