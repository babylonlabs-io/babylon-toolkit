/**
 * Hook for managing vault activation state and logic.
 *
 * Analogous to useBroadcastState for the activation flow.
 * Encapsulates useVaultActions + usePeginStorage + usePeginPolling
 * so the component stays a thin view layer.
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

export interface UseActivationStateProps {
  activity: VaultActivity;
  depositorEthAddress: string;
}

export interface UseActivationStateResult {
  /** Whether activation is in progress */
  activating: boolean;
  /** Whether activation has completed successfully */
  activated: boolean;
  /** Error message if activation failed */
  error: string | null;
  /** Handler to initiate activation with the user-entered secret */
  handleActivation: (secretHex: string) => Promise<void>;
}

export function useActivationState({
  activity,
  depositorEthAddress,
}: UseActivationStateProps): UseActivationStateResult {
  const {
    activating: vaultActivating,
    activationError,
    handleActivation: vaultHandleActivation,
  } = useVaultActions();
  const [localActivating, setLocalActivating] = useState(false);
  const [activated, setActivated] = useState(false);

  const { setOptimisticStatus } = usePeginPolling();
  const { pendingPegins, updatePendingPeginStatus } = usePeginStorage({
    ethAddress: depositorEthAddress,
    confirmedPegins: EMPTY_CONFIRMED,
  });

  const handleActivation = useCallback(
    async (secretHex: string) => {
      const pendingPegin = pendingPegins.find((p) => p.id === activity.id);

      setLocalActivating(true);
      try {
        await vaultHandleActivation({
          vaultId: activity.id,
          secretHex,
          depositorEthAddress,
          pendingPegin,
          updatePendingPeginStatus,
          onRefetchActivities: () => {
            // No-op: dashboard refetches after the user clicks Done.
          },
          onShowSuccessModal: () => {
            setOptimisticStatus(activity.id, LocalStorageStatus.CONFIRMED);
            setLocalActivating(false);
            setActivated(true);
          },
        });
      } catch (err) {
        logger.error(err instanceof Error ? err : new Error(String(err)), {
          data: { context: "Vault activation failed" },
        });
        setLocalActivating(false);
      }
    },
    [
      activity,
      depositorEthAddress,
      pendingPegins,
      updatePendingPeginStatus,
      vaultHandleActivation,
      setOptimisticStatus,
    ],
  );

  const isActivating = (vaultActivating || localActivating) && !activationError;

  return {
    activating: isActivating,
    activated,
    error: activationError,
    handleActivation,
  };
}
