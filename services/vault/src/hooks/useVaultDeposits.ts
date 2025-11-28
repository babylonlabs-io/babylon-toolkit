/**
 * Hook to manage vault deposits data fetching
 * Fetches vault data from GraphQL, transforms to VaultActivity format,
 * and combines with local pending pegins from localStorage.
 */

import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";

import { FAST_POLL_INTERVAL, NORMAL_POLL_INTERVAL } from "@/constants";

import {
  ContractStatus,
  getPeginState,
  LocalStorageStatus,
} from "../models/peginStateMachine";
import { getPendingPegins } from "../storage/peginStorage";
import { usePeginStorage } from "../storage/usePeginStorage";
import { transformVaultToActivity } from "../utils/peginTransformers";

import { useVaults } from "./useVaults";

/**
 * Hook to manage vault deposits data fetching
 * Only responsible for data - UI modal states and action handlers are managed by parent components
 * Wallet connections are managed by parent components
 */
export function useVaultDeposits(connectedAddress: Address | undefined) {
  // State to track if fast polling is needed
  const [needsFastPolling, setNeedsFastPolling] = useState(false);

  // Determine polling interval based on whether any activity is "Processing"
  const pollingInterval = needsFastPolling
    ? FAST_POLL_INTERVAL
    : NORMAL_POLL_INTERVAL;

  // Fetch vault data from GraphQL
  const { data, isLoading, error, refetch } = useVaults(connectedAddress);

  // Trigger refetch when wallet connects (address changes from undefined to a value)
  useEffect(() => {
    if (connectedAddress) {
      refetch();
    }
  }, [connectedAddress, refetch]);

  // Set up dynamic polling interval
  useEffect(() => {
    if (!connectedAddress) return;

    const interval = setInterval(() => {
      refetch();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [connectedAddress, pollingInterval, refetch]);

  // Transform vaults to vault activities
  const confirmedActivities = useMemo(() => {
    if (!data) return [];

    return data.map(({ vault, txHash, isInUse }) =>
      transformVaultToActivity(vault, txHash, isInUse),
    );
  }, [data]);

  // Check if any activity has "Processing" status and update fast polling flag
  useEffect(() => {
    if (!connectedAddress || !confirmedActivities.length) {
      setNeedsFastPolling(false);
      return;
    }

    // Get pending pegins from localStorage to check local status
    const pendingPeginsFromStorage = getPendingPegins(connectedAddress);

    // Check if any activity is in "Processing" state
    const hasProcessingActivity = confirmedActivities.some((activity) => {
      const pendingPegin = pendingPeginsFromStorage.find(
        (p) => p.id === activity.id,
      );
      const localStatus = pendingPegin?.status as
        | LocalStorageStatus
        | undefined;

      // Get the state for this activity
      const state = getPeginState(
        (activity.contractStatus ?? 0) as ContractStatus,
        {
          localStatus,
          isInUse: activity.isInUse,
        },
      );

      return state.displayLabel === "Processing";
    });

    setNeedsFastPolling(hasProcessingActivity);
  }, [connectedAddress, confirmedActivities]);

  // Combine with local pending pegins from localStorage
  const { allActivities, pendingPegins, addPendingPegin } = usePeginStorage({
    ethAddress: connectedAddress || "",
    confirmedPegins: confirmedActivities,
  });

  // Wrap refetch to return Promise<void> for backward compatibility
  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    activities: allActivities,
    pendingPegins,
    loading: isLoading,
    error: error as Error | null,
    refetchActivities: wrappedRefetch,
    addPendingPegin,
  };
}
