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
import { getPeginRequestsWithUsageStatus } from "../../../../services/vault/vaultQueryService";
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
 * Fetch pegin requests with vault and usage status
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
    queryKey: [
      "peginRequests",
      connectedAddress,
      CONTRACTS.BTC_VAULTS_MANAGER,
      CONTRACTS.MORPHO_CONTROLLER,
    ],
    queryFn: async () => {
      // Fetch pegin requests with application usage status
      // Service layer handles orchestration of multiple client calls
      return await getPeginRequestsWithUsageStatus(
        connectedAddress!,
        CONTRACTS.BTC_VAULTS_MANAGER,
        CONTRACTS.MORPHO_CONTROLLER,
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

    return data.map(({ peginRequest, txHash, isInUse }) =>
      transformPeginToActivity(peginRequest, txHash, isInUse),
    );
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
        {
          localStatus,
          isInUse: activity.isInUse,
        },
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
