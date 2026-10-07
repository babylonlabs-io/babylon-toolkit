/**
 * Hook for managing vault activation state and logic.
 *
 * Analogous to useBroadcastState for the activation flow.
 * Encapsulates useVaultActions + usePeginStorage + usePeginPolling
 * so the component stays a thin view layer.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useActivatingVaults } from "@/applications/aave/context";
import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { ACTIVITIES_QUERY_KEY } from "@/services/activity";
import { usePeginStorage } from "@/storage/usePeginStorage";
import type { VaultActivity } from "@/types/activity";
import { invalidateVaultQueries } from "@/utils/queryKeys";

import { useVaultActions } from "./useVaultActions";

/** Stable empty array to avoid re-render cascades in usePeginStorage. */
const EMPTY_CONFIRMED: VaultActivity[] = [];

export interface UseActivationStateProps {
  activity: VaultActivity;
  depositorEthAddress: string;
  /** Construction-ordered IDs sharing this Pre-PegIn. */
  siblingVaultIds?: readonly string[];
  /**
   * Escape hatch mode: reveal the secret via
   * `activateVaultWithSecretAndRedeem` (no application activation). The vault
   * is redeemed rather than turned into collateral, so the receipt carries no
   * `CollateralAdded` log and the optimistic Collateral-section row is
   * skipped — the optimistic CONFIRMED status still
   * applies (the reveal was submitted; the indexer flips to REDEEMED next).
   * The outcome is `returned`, but the vault is not marked returned in the
   * polling context: the escape hatch has its own success screen.
   */
  redeemImmediately?: boolean;
}

/**
 * How a completed activation ended for the depositor's BTC, read from the
 * receipt's positive evidence (see `activationRedeemedForDepositor`).
 * - `activated` — the application took the BTCVault: the receipt shows no
 *                 redemption.
 * - `returned`  — the registry redeemed the BTCVault for the depositor
 *                 instead: the escape hatch, or a normal activation the
 *                 application did not accept (a cap exceeded, or its
 *                 `activateVault` reverted).
 */
export type ActivationOutcome = "activated" | "returned";

export interface UseActivationStateResult {
  /** Whether activation is in progress */
  activating: boolean;
  /** How the activation ended; `null` until it completes. */
  outcome: ActivationOutcome | null;
  /** Error message if activation failed */
  error: string | null;
  /** True when the error is terminal (activation deadline passed) — no Retry. */
  errorTerminal: boolean;
  /** Handler to initiate activation with the user-entered secret */
  handleActivation: (secretHex: string) => Promise<void>;
}

export function useActivationState({
  activity,
  depositorEthAddress,
  siblingVaultIds,
  redeemImmediately,
}: UseActivationStateProps): UseActivationStateResult {
  const {
    activating: vaultActivating,
    activationError,
    activationErrorTerminal,
    handleActivation: vaultHandleActivation,
  } = useVaultActions();
  const [localActivating, setLocalActivating] = useState(false);
  const [outcome, setOutcome] = useState<ActivationOutcome | null>(null);

  // Track mount: `handleActivation` awaits an on-chain tx, so the consumer
  // can unmount (modal closed) before the success/catch callbacks run.
  // Without this guard, `setLocalActivating`/`setOutcome` fire on an
  // unmounted tree. Only this hook's own state sits behind it: the success
  // callback's app-scoped writes describe the vault and must land regardless.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true; // reset on remount (StrictMode setup→cleanup→setup)
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { setOptimisticStatus, markActivationReturned } = usePeginPolling();
  const { addActivatingVault } = useActivatingVaults();
  const queryClient = useQueryClient();
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
          redeemImmediately,
          siblingVaultIds: siblingVaultIds as
            | readonly `0x${string}`[]
            | undefined,
          pendingPegin,
          updatePendingPeginStatus,
          onRefetchActivities: () => {
            void invalidateVaultQueries(queryClient);
            void queryClient.invalidateQueries({
              queryKey: [ACTIVITIES_QUERY_KEY],
            });
          },
          onShowSuccessModal: ({ collateralAdded, redeemed }) => {
            // Ahead of the mount guard, for both outcomes. The mark and the
            // optimistic CONFIRMED live in the app-scoped store and describe
            // the vault, not this consumer, which may have unmounted
            // mid-flight. A cross-device resume holds no deposit record, so
            // the store is the only place the reveal is recorded: behind the
            // guard, an unmounted consumer would leave the vault VERIFIED with
            // nothing local, and the continuation view would offer Activate
            // again for a reveal that already landed. Mark first, in the
            // same synchronous block as CONFIRMED (and as the record write
            // `vaultHandleActivation` just made), so no render sees CONFIRMED
            // without the mark — which reads as activated.
            if (redeemed && !redeemImmediately) {
              markActivationReturned(activity.id);
            }
            setOptimisticStatus(activity.id, LocalStorageStatus.CONFIRMED);
            // Optimistically surface the just-activated vault in the dashboard
            // Collateral section while the Aave indexer catches up (~15s gap).
            // Skip a bogus row if the amount can't be parsed to a positive BTC
            // value — the indexer-driven row will still appear within seconds.
            // Only when the receipt shows the adapter added the vault as
            // collateral: the registry can confirm an activation and redeem the
            // vault instead (a cap exceeded, or escape-hatch mode), and the
            // indexer then never lists it to clear the row. Also ahead of the
            // guard: the row lives in the app-level provider in RootLayout,
            // not in this consumer.
            const amountBtc = parseFloat(
              activity.collateral.amount.replace(/,/g, ""),
            );
            if (
              collateralAdded &&
              Number.isFinite(amountBtc) &&
              amountBtc > 0
            ) {
              addActivatingVault({
                vaultId: activity.id,
                depositorEthAddress,
                amountBtc,
                providerAddress: activity.providers[0]?.id,
              });
            }
            if (!mountedRef.current) return;
            setLocalActivating(false);
            setOutcome(redeemed ? "returned" : "activated");
          },
        });
      } catch {
        // Defensive. `vaultHandleActivation` reports its own failures (including
        // the activation.reveal capture) and resolves rather than rethrowing, so
        // this cannot fire today — it only resets local state if that contract
        // ever changes. Capturing here instead would be dead code.
        if (mountedRef.current) setLocalActivating(false);
      }
    },
    [
      activity,
      depositorEthAddress,
      redeemImmediately,
      siblingVaultIds,
      pendingPegins,
      updatePendingPeginStatus,
      vaultHandleActivation,
      setOptimisticStatus,
      markActivationReturned,
      addActivatingVault,
      queryClient,
    ],
  );

  const isActivating = (vaultActivating || localActivating) && !activationError;

  return {
    activating: isActivating,
    outcome,
    error: activationError,
    errorTerminal: activationErrorTerminal,
    handleActivation,
  };
}
