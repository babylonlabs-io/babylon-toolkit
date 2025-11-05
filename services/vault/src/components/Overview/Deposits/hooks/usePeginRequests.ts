/**
 * Fetching and managing pegin request data from smart contracts
 * Used in VaultDeposit tab to show deposit/collateral status only (no Morpho data)
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";

import { FAST_POLL_INTERVAL, NORMAL_POLL_INTERVAL } from "@/constants";

import { CONTRACTS } from "../../../../config/contracts";
import {
  ContractStatus,
  getPeginState,
  LocalStorageStatus,
} from "../../../../models/peginStateMachine";
import { getPeginRequestsWithDetails } from "../../../../services/vault/vaultQueryService";
import { getPendingPegins } from "../../../../storage/peginStorage";
import type { VaultActivity } from "../../../../types";
import { transformPeginToActivity } from "../../../../utils/peginTransformers";

/**
 * Result interface for usePeginRequests hook
 */
export interface UsePeginRequestsResult {
  /** Array of vault activities transformed from pegin requests */
  activities: VaultActivity[];
  /** Loading state - true while fetching data */
  loading: boolean;
  /** Error state - contains error if fetch failed */
  error: Error | null;
  /** Function to manually refetch data */
  refetch: () => Promise<void>;
}

/**
 * Parameters for usePeginRequests hook
 */
export interface UsePeginRequestsParams {
  /** Ethereum address of connected wallet (undefined if not connected) */
  connectedAddress: Address | undefined;
}

/**
 * Custom hook to fetch pegin requests for a connected wallet address
 *
 * Fetches pegin/deposit data. The "in use" status is determined from the pegin status itself (status 3 = InPosition).
 * Does NOT fetch full Morpho position details (for performance).
 * For full position data with Morpho details, use useUserPositions instead.
 *
 * @param params - Hook parameters
 * @returns Object containing activities array, loading state, error state, and refetch function
 */
export function usePeginRequests({
  connectedAddress,
}: UsePeginRequestsParams): UsePeginRequestsResult {
  // State to track if fast polling is needed
  const [needsFastPolling, setNeedsFastPolling] = useState(false);

  // Determine polling interval based on whether any activity is "Processing"
  const pollingInterval = needsFastPolling
    ? FAST_POLL_INTERVAL
    : NORMAL_POLL_INTERVAL;

  // Use React Query to fetch data from service layer
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["peginRequests", connectedAddress, CONTRACTS.BTC_VAULTS_MANAGER],
    queryFn: () => {
      return getPeginRequestsWithDetails(
        connectedAddress!,
        CONTRACTS.BTC_VAULTS_MANAGER,
      );
    },
    enabled: !!connectedAddress,
    // Refetch when wallet connects to ensure fresh data
    refetchOnMount: true,
    // Dynamic polling: 15s for "Processing" status, 1 minute otherwise
    refetchInterval: pollingInterval,
  });

  // Trigger refetch when wallet connects (address changes from undefined to a value)
  useEffect(() => {
    if (connectedAddress) {
      refetch();
    }
  }, [connectedAddress, refetch]);

  // Transform pegin requests to vault activities
  const activities = useMemo(() => {
    if (!data) return [];

    const transformed = data.map(({ peginRequest, txHash }) =>
      transformPeginToActivity(peginRequest, txHash),
    );
    return transformed;
  }, [data]);

  // Check if any activity has "Processing" status and update fast polling flag
  useEffect(() => {
    if (!connectedAddress || !activities.length) {
      setNeedsFastPolling(false);
      return;
    }

    // Get pending pegins from localStorage to check local status
    const pendingPegins = getPendingPegins(connectedAddress);

    // Check if any activity is in "Processing" state
    const hasProcessingActivity = activities.some((activity) => {
      const pendingPegin = pendingPegins.find((p) => p.id === activity.id);
      const localStatus = pendingPegin?.status as
        | LocalStorageStatus
        | undefined;

      // Get the state for this activity
      const state = getPeginState(
        (activity.contractStatus ?? 0) as ContractStatus,
        localStatus,
      );

      return state.displayLabel === "Processing";
    });

    setNeedsFastPolling(hasProcessingActivity);
  }, [connectedAddress, activities]);

  // Wrap refetch to return Promise<void> for backward compatibility
  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    activities,
    loading: isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
  };
}
