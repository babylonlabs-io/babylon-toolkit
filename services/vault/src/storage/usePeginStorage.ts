/**
 * React hook for managing pending peg-in storage
 *
 * Combines confirmed peg-ins from the API with pending peg-ins from localStorage.
 * Provides helpers to add/update pending peg-ins and automatically cleans up
 * confirmed transactions from localStorage.
 */

import { useCallback, useEffect, useMemo } from "react";

import type { VaultActivity } from "../types/activity";

import {
  addPendingPegin as addPendingPeginToStorage,
  filterPendingPegins,
  getPendingPegins,
  type PendingPeginRequest,
  savePendingPegins,
} from "./peginStorage";

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
  // Get pending peg-ins from localStorage
  const pendingPegins = useMemo(() => {
    if (!ethAddress) return [];
    return getPendingPegins(ethAddress);
  }, [ethAddress]);

  // Clean up old pending peg-ins on mount and when confirmed pegins change
  useEffect(() => {
    if (!ethAddress) return;

    // Filter and clean up old pending peg-ins (older than 24 hours and confirmed ones)
    const filteredPegins = filterPendingPegins(
      pendingPegins,
      confirmedPegins.map((p) => ({
        id: p.id,
        status: p.contractStatus ?? 0,
      })),
    );

    // Save filtered pegins back to localStorage if anything changed
    if (filteredPegins.length !== pendingPegins.length) {
      savePendingPegins(ethAddress, filteredPegins);
    }
  }, [ethAddress, confirmedPegins, pendingPegins]);

  // Merge pending and confirmed activities
  const allActivities = useMemo(() => {
    // Create a map of confirmed activities by ID for quick lookup
    const confirmedMap = new Map(confirmedPegins.map((p) => [p.id, p]));

    // Convert pending peg-ins to VaultActivity format
    const pendingActivities: VaultActivity[] = pendingPegins
      .filter((pending) => !confirmedMap.has(pending.id))
      .map((pending) => ({
        id: pending.id,
        collateral: {
          amount: pending.amount || "0", // Use stored amount from localStorage
          symbol: "BTC",
        },
        providers: pending.providerId
          ? [
              {
                id: pending.providerId,
                name: "Vault Provider", // Name will be fetched from contract later
                icon: "",
              },
            ]
          : [],
        contractStatus: 0, // Pending status
        isPending: true,
        pendingMessage: "Transaction pending confirmation...",
        timestamp: pending.timestamp,
      }));

    // Combine and sort by timestamp (newest first)
    return [...pendingActivities, ...confirmedPegins].sort((a, b) => {
      const aTime = a.timestamp || 0;
      const bTime = b.timestamp || 0;
      return bTime - aTime;
    });
  }, [pendingPegins, confirmedPegins]);

  // Add pending peg-in
  const addPendingPegin = useCallback(
    (pegin: Omit<PendingPeginRequest, "timestamp">) => {
      if (!ethAddress) return;
      addPendingPeginToStorage(ethAddress, {
        id: pegin.id,
        amount: pegin.amount,
        providerId: pegin.providerId,
      });
    },
    [ethAddress],
  );

  return {
    allActivities,
    pendingPegins,
    addPendingPegin,
  };
}
