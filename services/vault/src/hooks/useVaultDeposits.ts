/**
 * Hook to manage vault deposits data fetching
 * Fetches vault data from GraphQL, transforms to VaultActivity format,
 * and combines with local pending pegins from localStorage.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";

import { FAST_POLL_INTERVAL, NORMAL_POLL_INTERVAL } from "@/constants";

import {
  ContractStatus,
  getPeginState,
  LocalStorageStatus,
  PEGIN_DISPLAY_LABELS,
} from "../models/peginStateMachine";
import {
  getPendingPegins,
  type PendingPeginRequest,
  PendingPeginStorageReadError,
} from "../storage/peginStorage";
import { usePeginStorage } from "../storage/usePeginStorage";
import { transformVaultToActivity } from "../utils/vaultTransformers";

import { useActiveVaultChainCheck } from "./useActiveVaultChainCheck";
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

  const { data, isLoading, error, refetch, status } = useVaults(
    connectedAddress,
    {
      poll: true,
      interval: pollingInterval,
    },
  );

  // Forces a refresh on `undefined → sameAddress` reconnect, which RQ
  // would otherwise serve from cache while still within `staleTime`.
  useEffect(() => {
    if (connectedAddress) {
      refetch();
    }
  }, [connectedAddress, refetch]);

  const indexerActiveIds = useMemo(
    () =>
      (data?.vaults ?? [])
        .filter((vault) => vault.status === ContractStatus.ACTIVE)
        .map((vault) => vault.id),
    [data],
  );
  const chainCheck = useActiveVaultChainCheck(indexerActiveIds);
  // The status each vault last reached the activities with, lowercased id.
  const lastStatusesRef = useRef<ReadonlyMap<string, ContractStatus>>(
    new Map(),
  );

  // Transform vaults to vault activities. The registry status replaces an
  // indexer ACTIVE that the chain has not reached, so the activities built
  // here (and the deposit views, storage cleanup and milestones that read
  // them) never show a false activation success or hide the Activate action.
  // While a vault's registry read has not settled, it keeps the status it
  // last had, or is held out if it had none: its ACTIVE alone would delete
  // the local record and emit the completion milestone.
  const confirmedActivities = useMemo(() => {
    if (!data) return [];

    const statuses = new Map<string, ContractStatus>();
    const activities = data.vaults.flatMap((vault) => {
      const id = vault.id.toLowerCase();
      const status = chainCheck.pendingIds.has(id)
        ? lastStatusesRef.current.get(id)
        : (chainCheck.statuses.get(id) ?? vault.status);
      if (status === undefined) return [];
      statuses.set(id, status);
      return [transformVaultToActivity({ ...vault, status })];
    });
    lastStatusesRef.current = statuses;
    return activities;
  }, [data, chainCheck]);

  /**
   * Lowercased ids of every vault the indexer returned, or null unless that
   * set is known to be complete — a failed or in-flight query is never
   * evidence that a vault is absent, and neither is a successful one that
   * dropped rows it could not transform, or held rows back for the registry.
   */
  const indexedVaultIds: ReadonlySet<string> | null = useMemo(
    () =>
      status === "success" &&
      data?.droppedCount === 0 &&
      confirmedActivities.length === data.vaults.length
        ? new Set(confirmedActivities.map((a) => a.id.toLowerCase()))
        : null,
    [status, data, confirmedActivities],
  );

  // Check if any activity has "Processing" status and update fast polling flag
  useEffect(() => {
    if (!connectedAddress || !confirmedActivities.length) {
      setNeedsFastPolling(false);
      return;
    }

    // Get pending pegins from localStorage to check local status
    let pendingPeginsFromStorage: PendingPeginRequest[] = [];
    try {
      pendingPeginsFromStorage = getPendingPegins(connectedAddress);
    } catch (error) {
      if (!(error instanceof PendingPeginStorageReadError)) throw error;
    }

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
          refundBroadcastAt: pendingPegin?.refundBroadcastAt,
        },
      );

      return (
        state.displayLabel === PEGIN_DISPLAY_LABELS.PROCESSING ||
        state.displayLabel === PEGIN_DISPLAY_LABELS.REFUNDING
      );
    });

    setNeedsFastPolling(hasProcessingActivity);
  }, [connectedAddress, confirmedActivities]);

  // Combine with local pending pegins from localStorage
  const {
    allActivities,
    pendingPegins,
    storageReadError,
    addPendingPegin,
    removePendingPegins,
  } = usePeginStorage({
    ethAddress: connectedAddress || "",
    confirmedPegins: confirmedActivities,
  });

  /**
   * The stored status of each browser-local record, keyed by lowercased vault
   * id. A record that has already broadcast its Pre-PegIn is no longer the
   * browser's to discard, so the dismiss gate reads this rather than inferring
   * the status from the row's display state.
   */
  const localRecordStatuses: ReadonlyMap<string, LocalStorageStatus> = useMemo(
    () => new Map(pendingPegins.map((p) => [p.id.toLowerCase(), p.status])),
    [pendingPegins],
  );

  // Wrap refetch to return Promise<void> for backward compatibility
  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    activities: allActivities,
    pendingPegins,
    storageReadError,
    loading: isLoading,
    error: error as Error | null,
    refetchActivities: wrappedRefetch,
    addPendingPegin,
    removePendingPegins,
    indexedVaultIds,
    localRecordStatuses,
  };
}
