/**
 * Hook to fetch user activities including pending transactions from localStorage
 *
 * Combines confirmed activities from the GraphQL API with pending transactions
 * stored in localStorage (pending deposits and pending collateral operations).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";

import { STORAGE_UPDATE_EVENT } from "../constants";
import { getPendingActivities } from "../services/activity";
import type { ActivityLog } from "../types/activityLog";

import { useActivities } from "./useActivities";

/**
 * Hook to fetch user activities including pending transactions
 *
 * Merges confirmed activities from GraphQL with pending transactions from localStorage.
 * Automatically updates when localStorage changes (via custom event).
 *
 * @param userAddress - User's Ethereum address
 * @returns Query result with combined activity data sorted by date (newest first)
 */
export function useActivitiesWithPending(userAddress: Address | undefined) {
  const {
    data: confirmedActivities,
    isLoading,
    ...queryResult
  } = useActivities(userAddress);
  const [pendingActivities, setPendingActivities] = useState<ActivityLog[]>([]);
  const [storageVersion, setStorageVersion] = useState(0);

  // Load pending activities from localStorage
  const loadPendingActivities = useCallback(() => {
    if (!userAddress) {
      setPendingActivities([]);
      return;
    }
    setPendingActivities(getPendingActivities(userAddress));
  }, [userAddress]);

  // Initial load and reload when address or storage version changes
  useEffect(() => {
    loadPendingActivities();
  }, [loadPendingActivities, storageVersion]);

  // Listen for localStorage update events (same-tab and cross-tab updates)
  useEffect(() => {
    if (!userAddress) return;

    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ ethAddress: string }>;
      // Check if this update is for the current user
      if (
        customEvent.detail?.ethAddress?.toLowerCase() ===
        userAddress.toLowerCase()
      ) {
        setStorageVersion((v) => v + 1);
      }
    };

    // Listen for custom storage update events
    window.addEventListener(STORAGE_UPDATE_EVENT, handleStorageUpdate);

    return () => {
      window.removeEventListener(STORAGE_UPDATE_EVENT, handleStorageUpdate);
    };
  }, [userAddress]);

  // Merge confirmed and pending activities, deduplicating by ID
  const allActivities = useMemo(() => {
    const confirmed = confirmedActivities ?? [];

    // Create set of confirmed IDs for deduplication
    const confirmedIds = new Set(confirmed.map((a) => a.id));

    // Filter out pending activities that are now confirmed
    const uniquePending = pendingActivities.filter(
      (p) => !confirmedIds.has(p.id),
    );

    // Combine and sort by date (newest first)
    return [...uniquePending, ...confirmed].sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    );
  }, [confirmedActivities, pendingActivities]);

  return {
    data: allActivities,
    isLoading,
    ...queryResult,
  };
}
