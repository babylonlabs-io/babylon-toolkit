/**
 * Hook for managing broadcast state and logic.
 *
 * Analogous to usePayoutSigningState for the broadcast flow.
 * Encapsulates useVaultActions + usePeginStorage + usePeginPolling
 * so the component stays a thin view layer.
 *
 * Note: onSuccess() triggers parent unmount (setBroadcastingActivity(null))
 * so there is no isComplete state — the BroadcastSuccessModal takes over.
 */

import { useCallback, useState } from "react";

import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { logger } from "@/infrastructure";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { usePeginStorage } from "@/storage/usePeginStorage";
import type { VaultActivity } from "@/types/activity";

import { useVaultActions } from "./useVaultActions";

/** Stable empty array to avoid re-render cascades in usePeginStorage. */
const EMPTY_CONFIRMED: VaultActivity[] = [];

export interface UseBroadcastStateProps {
  activity: VaultActivity;
  /**
   * Every vault ID sharing this Pre-PegIn transaction (batched pegin).
   * Includes `activity.id`. A single broadcast confirms all of them, so
   * all are marked CONFIRMING on success.
   */
  batchVaultIds: string[];
  depositorEthAddress: string;
  onSuccess: () => void;
}

export interface UseBroadcastStateResult {
  /** Whether a broadcast is in progress */
  broadcasting: boolean;
  /** Error message if broadcast failed */
  error: string | null;
  /** Handler to initiate broadcast */
  handleBroadcast: () => Promise<void>;
}

export function useBroadcastState({
  activity,
  batchVaultIds,
  depositorEthAddress,
  onSuccess,
}: UseBroadcastStateProps): UseBroadcastStateResult {
  const {
    broadcasting: vaultBroadcasting,
    broadcastError,
    handleBroadcast: vaultHandleBroadcast,
  } = useVaultActions();
  const [localBroadcasting, setLocalBroadcasting] = useState(false);

  const { setOptimisticStatus } = usePeginPolling();
  const { pendingPegins, updatePendingPeginStatus } = usePeginStorage({
    ethAddress: depositorEthAddress,
    confirmedPegins: EMPTY_CONFIRMED,
  });

  const handleBroadcast = useCallback(async () => {
    // Resolve pendingPegin at call time to avoid stale closure references
    const pendingPegin = pendingPegins.find((p) => p.id === activity.id);

    setLocalBroadcasting(true);
    try {
      await vaultHandleBroadcast({
        vaultId: activity.id,
        pendingPegin,
        updatePendingPeginStatus,
        onRefetchActivities: () => {
          // No-op: onSuccess() unmounts the component before this could run.
          // The polling context handles periodic refetching, and the optimistic
          // status update below provides immediate UI feedback.
        },
        onShowSuccessModal: () => {
          // A batched pegin shares one Pre-PegIn tx — this single broadcast
          // confirms every sibling. Mark them all CONFIRMING (localStorage +
          // optimistic) so no sibling keeps showing a stale broadcast action.
          for (const id of batchVaultIds) {
            updatePendingPeginStatus(id, LocalStorageStatus.CONFIRMING);
            setOptimisticStatus(id, LocalStorageStatus.CONFIRMING);
          }
          setLocalBroadcasting(false);
          onSuccess();
        },
      });
    } catch (err) {
      logger.error(err instanceof Error ? err : new Error(String(err)), {
        data: { context: "Broadcast failed" },
      });
      setLocalBroadcasting(false);
    }
  }, [
    activity,
    batchVaultIds,
    pendingPegins,
    updatePendingPeginStatus,
    vaultHandleBroadcast,
    setOptimisticStatus,
    onSuccess,
  ]);

  const isBroadcasting =
    (vaultBroadcasting || localBroadcasting) && !broadcastError;

  return {
    broadcasting: isBroadcasting,
    error: broadcastError,
    handleBroadcast,
  };
}
