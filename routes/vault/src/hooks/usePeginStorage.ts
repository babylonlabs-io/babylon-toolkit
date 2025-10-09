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

  // Sync: Remove pending peg-ins that are now confirmed
  useEffect(() => {
    if (!ethAddress) return;

    const confirmedIds = Object.keys(confirmedPeginMap);
    const filteredPegins = filterPendingPegins(pendingPegins, confirmedIds);

    // Only update if something changed
    if (filteredPegins.length !== pendingPegins.length) {
      setPendingPegins(filteredPegins);
    }
  }, [ethAddress, confirmedPeginMap, pendingPegins, setPendingPegins]);

  // Convert pending peg-ins to VaultActivity format
  const pendingActivities: VaultActivity[] = useMemo(() => {
    const filtered = pendingPegins.filter((pegin: PendingPeginRequest) => {
      const isConfirmed = !!confirmedPeginMap[pegin.id];
      console.log(
        `[usePeginStorage] 🔍 Checking pegin ${pegin.id}: isConfirmed=${isConfirmed}`,
      );
      return !isConfirmed; // Don't show if already confirmed
    });

    return filtered.map((pegin: PendingPeginRequest) => ({
      id: pegin.id,
      collateral: {
        amount: pegin.amount,
        symbol: 'BTC',
        icon: bitcoinIcon,
      },
      status: {
        label: 'Pending',
        variant: 'pending' as const,
      },
      providers: pegin.providers.map((providerId: string) => ({
        id: providerId,
        name: providerId, // TODO: Map to actual provider names
        icon: undefined,
      })),
      action: {
        label: 'Borrow USDC',
        onClick: () => console.log('Borrow from pending peg-in:', pegin.id),
      },
      isPending: true, // Flag to show callout message
    }));
  }, [pendingPegins, confirmedPeginMap]);

  // Merge pending and confirmed activities
  const allActivities: VaultActivity[] = useMemo(() => {
    return [...pendingActivities, ...confirmedPegins];
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

  return {
    allActivities,
    pendingPegins,
    pendingActivities,
    addPendingPegin,
    removePendingPegin,
    clearPendingPegins,
  };
}
