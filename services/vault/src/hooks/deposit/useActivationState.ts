/**
 * Hook for managing vault activation state and logic.
 *
 * Analogous to useBroadcastState for the activation flow.
 * Encapsulates useVaultActions + usePeginStorage + usePeginPolling
 * so the component stays a thin view layer.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useActivatingVaults } from "@/applications/aave/context";
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

  // Track mount: `handleActivation` awaits an on-chain tx, so the consumer
  // can unmount (modal closed) before the success/catch callbacks run.
  // Without this guard, `setLocalActivating`/`setActivated` and the
  // `setOptimisticStatus` context update fire on an unmounted tree.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true; // reset on remount (StrictMode setup→cleanup→setup)
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { setOptimisticStatus } = usePeginPolling();
  const { addActivatingVault } = useActivatingVaults();
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
            if (!mountedRef.current) return;
            setOptimisticStatus(activity.id, LocalStorageStatus.CONFIRMED);
            // Optimistically surface the just-activated vault in the dashboard
            // Collateral section while the Aave indexer catches up (~15s gap).
            // Skip a bogus row if the amount can't be parsed to a positive BTC
            // value — the indexer-driven row will still appear within seconds.
            const amountBtc = parseFloat(
              activity.collateral.amount.replace(/,/g, ""),
            );
            if (Number.isFinite(amountBtc) && amountBtc > 0) {
              addActivatingVault({
                vaultId: activity.id,
                depositorEthAddress,
                amountBtc,
                providerAddress: activity.providers[0]?.id,
              });
            }
            setLocalActivating(false);
            setActivated(true);
          },
        });
      } catch (err) {
        logger.error(err instanceof Error ? err : new Error(String(err)), {
          data: { context: "Vault activation failed" },
        });
        if (mountedRef.current) setLocalActivating(false);
      }
    },
    [
      activity,
      depositorEthAddress,
      pendingPegins,
      updatePendingPeginStatus,
      vaultHandleActivation,
      setOptimisticStatus,
      addActivatingVault,
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
