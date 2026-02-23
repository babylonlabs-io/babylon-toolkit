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
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { usePeginStorage } from "@/storage/usePeginStorage";
import type { VaultActivity } from "@/types/activity";

import { useVaultActions } from "./useVaultActions";

/** Stable empty array to avoid re-render cascades in usePeginStorage. */
const EMPTY_CONFIRMED: VaultActivity[] = [];

export interface UseBroadcastStateProps {
  activity: VaultActivity;
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
  const { pendingPegins, updatePendingPeginStatus, addPendingPegin } =
    usePeginStorage({
      ethAddress: depositorEthAddress,
      confirmedPegins: EMPTY_CONFIRMED,
    });

  const handleBroadcast = useCallback(async () => {
    // Resolve pendingPegin at call time to avoid stale closure references
    const pendingPegin = pendingPegins.find((p) => p.id === activity.id);

    setLocalBroadcasting(true);
    try {
      await vaultHandleBroadcast({
        activityId: activity.id,
        activityAmount: activity.collateral.amount,
        activityProviders: activity.providers,
        activityApplicationController: activity.applicationController,
        pendingPegin,
        updatePendingPeginStatus,
        addPendingPegin,
        onRefetchActivities: () => {
          // No-op: onSuccess() unmounts the component before this could run.
          // The polling context handles periodic refetching, and the optimistic
          // status update below provides immediate UI feedback.
        },
        onShowSuccessModal: () => {
          setOptimisticStatus(activity.id, LocalStorageStatus.CONFIRMING);
          setLocalBroadcasting(false);
          onSuccess();
        },
      });
    } catch (err) {
      console.error("Broadcast failed:", err);
      setLocalBroadcasting(false);
    }
  }, [
    activity,
    pendingPegins,
    updatePendingPeginStatus,
    addPendingPegin,
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
