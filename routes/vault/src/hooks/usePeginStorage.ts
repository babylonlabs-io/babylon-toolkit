/**
 * Hook for managing peg-in local storage
 *
 * Similar to simple-staking's useDelegationStorage pattern:
 * - Merges pending peg-ins from localStorage with confirmed peg-ins from API
 * - Automatically removes confirmed peg-ins from localStorage
 * - Cleans up old pending peg-ins
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import type { VaultActivity } from '../mockData/vaultActivities';
import {
  type PendingPeginRequest,
  filterPendingPegins,
} from '../storage/peginStorage';
import { bitcoinIcon } from '../assets';

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
  // localStorage is the source of truth for display until blockchain status >= 2 (Available)
  const pendingActivities: VaultActivity[] = useMemo(() => {
    const filtered = pendingPegins.filter((pegin: PendingPeginRequest) => {
      const confirmedPegin = confirmedPeginMap[pegin.id];

      // Show pending pegin if:
      // 1. Not yet on blockchain
      // 2. On blockchain but status < 2 (Pending or Verified - not yet Available)
      if (!confirmedPegin) return true;
      return (confirmedPegin.contractStatus ?? 0) < 2;
    });

    return filtered.map((pegin: PendingPeginRequest) => {
      const confirmedPegin = confirmedPeginMap[pegin.id];

      // Determine display label based on localStorage + blockchain status
      let statusLabel = 'Pending';
      let pendingMessage =
        'Your peg-in is being processed. This can take up to ~5 hours while Bitcoin confirmations and provider acknowledgements complete.';

      if (pegin.status === 'confirming') {
        statusLabel = 'Pending BTC Confirmations';
        pendingMessage =
          'BTC transaction broadcast. Waiting for Bitcoin network confirmations (~5 hours).';
      } else if (confirmedPegin?.contractStatus === 1) {
        statusLabel = 'Verified';
        pendingMessage = '';
      }

      return {
        id: pegin.id,
        txHash: confirmedPegin?.txHash, // Use blockchain tx hash if available
        collateral: {
          amount: pegin.amount,
          symbol: 'BTC',
          icon: bitcoinIcon,
        },
        status: {
          label: statusLabel,
          variant: 'pending' as const,
        },
        contractStatus: confirmedPegin?.contractStatus,
        providers:
          confirmedPegin?.providers ||
          pegin.providers.map((id: string) => ({
            id,
            name: id,
            icon: undefined,
          })),
        action: undefined,
        isPending: statusLabel !== 'Verified', // Don't show warning for Verified status
        pendingMessage: pendingMessage || undefined,
        morphoPosition: undefined,
        borrowingData: undefined,
        marketData: undefined,
        positionDate: undefined,
        vaultMetadata: undefined,
        isInUse: undefined,
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

    return [...pendingActivities, ...filteredConfirmed];
  }, [pendingActivities, confirmedPegins]);

  // Add a new pending peg-in
  const addPendingPegin = useCallback(
    (pegin: Omit<PendingPeginRequest, 'timestamp' | 'status'>) => {
      if (!ethAddress) return;

      const newPegin: PendingPeginRequest = {
        ...pegin,
        timestamp: Date.now(),
        status: 'pending',
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

  // Update pending pegin status (for BTC broadcast confirmation)
  const updatePendingPeginStatus = useCallback(
    (
      peginId: string,
      status: PendingPeginRequest['status'],
      btcTxHash?: string,
    ) => {
      setPendingPegins((prev: PendingPeginRequest[]) =>
        prev.map((p: PendingPeginRequest) =>
          p.id === peginId
            ? { ...p, status, ...(btcTxHash && { btcTxHash }) }
            : p,
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
