/**
 * Hook for managing peg-in local storage
 *
 * Similar to simple-staking's useDelegationStorage pattern:
 * - Merges pending peg-ins from localStorage with confirmed peg-ins from API
 * - Automatically removes confirmed peg-ins from localStorage
 * - Cleans up old pending peg-ins
 */

import { useCallback, useEffect, useMemo } from "react";
import { useLocalStorage } from "usehooks-ts";

import {
  type PendingPeginRequest,
  filterPendingPegins,
} from "../../../../storage/peginStorage";
import type { VaultActivity } from "../../../../types/activity";

interface UsePeginStorageParams {
  ethAddress: string;
  confirmedPegins: VaultActivity[]; // Peg-ins from API/blockchain
}

export function usePeginStorage({
  ethAddress,
  confirmedPegins,
}: UsePeginStorageParams) {
  const storageKey = `vault-pending-pegins-${ethAddress}`;

  // Store pending peg-ins in localStorage
  const [pendingPegins = [], setPendingPegins] = useLocalStorage<
    PendingPeginRequest[]
  >(storageKey, []);

  // Create a map of confirmed peg-in IDs for quick lookup
  const confirmedPeginMap = useMemo(() => {
    return confirmedPegins.reduce(
      (acc, pegin) => ({
        ...acc,
        [pegin.id]: pegin,
      }),
      {} as Record<string, VaultActivity>,
    );
  }, [confirmedPegins]);

  // Sync: Remove pending peg-ins that reached Available status (2+)
  // Keep localStorage data for Pending (0) and Verified (1) status
  useEffect(() => {
    if (!ethAddress) return;

    // Map confirmed pegins to {id, status} for the filter function
    const confirmedPeginsWithStatus = confirmedPegins.map((p) => ({
      id: p.id,
      status: p.contractStatus ?? 0, // Default to 0 if missing
    }));
    const filteredPegins = filterPendingPegins(
      pendingPegins,
      confirmedPeginsWithStatus,
    );

    // Only update if something changed
    if (filteredPegins.length !== pendingPegins.length) {
      setPendingPegins(filteredPegins);
    }
  }, [ethAddress, confirmedPegins, pendingPegins, setPendingPegins]);

  // Convert pending peg-ins to VaultActivity format
  // localStorage only stores minimal data (id, status) - full data comes from blockchain
  const pendingActivities: VaultActivity[] = useMemo(() => {
    const filtered = pendingPegins.filter((pegin: PendingPeginRequest) => {
      const confirmedPegin = confirmedPeginMap[pegin.id];

      // Show pending pegin if:
      // 1. Not yet on blockchain
      // 2. On blockchain but status < 2 (Pending or Verified - not yet Available)
      if (!confirmedPegin) return false; // Skip if not on blockchain - we have no data to display
      return (confirmedPegin.contractStatus ?? 0) < 2;
    });

    return filtered.map((pegin: PendingPeginRequest) => {
      const confirmedPegin = confirmedPeginMap[pegin.id]!; // Safe: filtered only includes items with confirmedPegin

      // Determine pending message based on localStorage + blockchain status
      let pendingMessage = "Your peg-in is being processed.";

      // Handle different localStorage statuses
      if (pegin.status === "payout_signed") {
        pendingMessage =
          "Payout signatures submitted. Waiting for vault provider to collect acknowledgements and update on-chain status...";
      } else if (pegin.status === "confirming") {
        pendingMessage =
          "BTC transaction broadcast. Waiting for Bitcoin network confirmations (~5 hours).";
      } else if (confirmedPegin.contractStatus === 0) {
        // Pending status - let state machine handle the message
        // (either "Waiting for vault provider..." or no message for "Ready to Sign")
        pendingMessage = "";
      } else if (confirmedPegin.contractStatus === 1) {
        // Verified status - no warning message needed
        pendingMessage = "";
      }

      // Return activity with data from blockchain + localStorage status
      return {
        ...confirmedPegin,
        // Don't show warning for Verified status (contractStatus === 1)
        isPending: confirmedPegin.contractStatus !== 1,
        pendingMessage: pendingMessage || undefined,
      };
    });
  }, [pendingPegins, confirmedPeginMap]);

  // Merge pending and confirmed activities (remove duplicates)
  // localStorage entries are shown until blockchain status >= 2
  const allActivities: VaultActivity[] = useMemo(() => {
    // Build set of pending pegin IDs (these are shown from localStorage)
    const pendingIds = new Set(pendingActivities.map((p) => p.id));

    // Only show confirmed pegins if NOT in localStorage
    // (localStorage is source of truth until status >= 2)
    const filteredConfirmed = confirmedPegins.filter(
      (p) => !pendingIds.has(p.id),
    );

    // Merge and sort by timestamp (oldest first)
    const merged = [...pendingActivities, ...filteredConfirmed];
    return merged.sort((a, b) => {
      const timeA = a.timestamp ?? 0;
      const timeB = b.timestamp ?? 0;
      return timeA - timeB; // Ascending order (oldest first)
    });
  }, [pendingActivities, confirmedPegins]);

  // Add a new pending peg-in (minimal data - full data from blockchain)
  const addPendingPegin = useCallback(
    (pegin: Omit<PendingPeginRequest, "timestamp">) => {
      if (!ethAddress) return;

      const newPegin: PendingPeginRequest = {
        ...pegin,
        timestamp: Date.now(),
      };

      setPendingPegins((prev: PendingPeginRequest[]) => [...prev, newPegin]);
    },
    [ethAddress, setPendingPegins],
  );

  // Remove a pending peg-in manually
  const removePendingPegin = useCallback(
    (peginId: string) => {
      setPendingPegins((prev: PendingPeginRequest[]) =>
        prev.filter((p: PendingPeginRequest) => p.id !== peginId),
      );
    },
    [setPendingPegins],
  );

  // Clear all pending peg-ins
  const clearPendingPegins = useCallback(() => {
    setPendingPegins([]);
  }, [setPendingPegins]);

  // Update pending pegin status
  const updatePendingPeginStatus = useCallback(
    (peginId: string, status: PendingPeginRequest["status"]) => {
      setPendingPegins((prev: PendingPeginRequest[]) =>
        prev.map((p: PendingPeginRequest) =>
          p.id === peginId ? { ...p, status } : p,
        ),
      );
    },
    [setPendingPegins],
  );

  return {
    allActivities,
    pendingPegins,
    pendingActivities,
    addPendingPegin,
    removePendingPegin,
    clearPendingPegins,
    updatePendingPeginStatus,
  };
}
