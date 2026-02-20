/**
 * ResumeDepositContent
 *
 * Content components for resuming a deposit flow at the payout signing
 * or BTC broadcast step. Renders the same DepositProgressView stepper
 * as the initial deposit flow with earlier steps already completed.
 *
 * Used by SimpleDeposit when opened in resume mode.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";

import { DepositStep } from "@/components/deposit/DepositSignModal/constants";
import { usePayoutSigningState } from "@/components/deposit/PayoutSignModal/usePayoutSigningState";
import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { useVaultActions } from "@/hooks/deposit/useVaultActions";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { usePeginStorage } from "@/storage/usePeginStorage";
import type { VaultActivity } from "@/types/activity";

import { DepositProgressView } from "./DepositProgressView";

// ---------------------------------------------------------------------------
// Sign Payouts Content
// ---------------------------------------------------------------------------

export interface ResumeSignContentProps {
  activity: VaultActivity;
  transactions: any[] | null;
  btcPublicKey: string;
  depositorEthAddress: Hex;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResumeSignContent({
  activity,
  transactions,
  btcPublicKey,
  depositorEthAddress,
  onClose,
  onSuccess,
}: ResumeSignContentProps) {
  const { signing, progress, error, isComplete, handleSign } =
    usePayoutSigningState({
      activity,
      transactions,
      btcPublicKey,
      depositorEthAddress,
      onSuccess,
      onClose,
    });

  // Auto-trigger signing on mount
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    handleSign();
  }, [handleSign]);

  const isProcessing = signing && !error && !isComplete;
  const canClose = !!error || isComplete || !signing;

  return (
    <DepositProgressView
      currentStep={
        isComplete ? DepositStep.BROADCAST_BTC : DepositStep.SIGN_PAYOUTS
      }
      isWaiting={isComplete}
      error={error?.message ?? null}
      isComplete={isComplete}
      isProcessing={isProcessing}
      canClose={canClose}
      canContinueInBackground={false}
      payoutSigningProgress={signing ? progress : null}
      onClose={onClose}
      successMessage="Your payout transactions have been signed and submitted successfully. Your deposit is now being processed."
      onRetry={error ? handleSign : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// Broadcast BTC Content
// ---------------------------------------------------------------------------

export interface ResumeBroadcastContentProps {
  activity: VaultActivity;
  depositorEthAddress: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResumeBroadcastContent({
  activity,
  depositorEthAddress,
  onClose,
  onSuccess,
}: ResumeBroadcastContentProps) {
  const { broadcasting, broadcastError, handleBroadcast } = useVaultActions();
  const [localBroadcasting, setLocalBroadcasting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const { setOptimisticStatus } = usePeginPolling();
  const { pendingPegins, updatePendingPeginStatus, addPendingPegin } =
    usePeginStorage({
      ethAddress: depositorEthAddress,
      confirmedPegins: [],
    });

  const pendingPegin = pendingPegins.find((p) => p.id === activity.id);

  const handleSign = useCallback(async () => {
    setLocalBroadcasting(true);
    try {
      await handleBroadcast({
        activityId: activity.id,
        activityAmount: activity.collateral.amount,
        activityProviders: activity.providers,
        activityApplicationController: activity.applicationController,
        pendingPegin,
        updatePendingPeginStatus,
        addPendingPegin,
        onRefetchActivities: () => {},
        onShowSuccessModal: () => {
          setOptimisticStatus(activity.id, LocalStorageStatus.CONFIRMING);
          setLocalBroadcasting(false);
          setIsComplete(true);
          onSuccess();
        },
      });
    } catch {
      setLocalBroadcasting(false);
    }
  }, [
    activity,
    pendingPegin,
    updatePendingPeginStatus,
    addPendingPegin,
    handleBroadcast,
    setOptimisticStatus,
    onSuccess,
  ]);

  // Auto-trigger broadcast on mount
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    handleSign();
  }, [handleSign]);

  const isBroadcasting =
    (broadcasting || localBroadcasting) && !broadcastError;
  const canClose = !!broadcastError || isComplete || !isBroadcasting;

  return (
    <DepositProgressView
      currentStep={
        isComplete ? DepositStep.COMPLETED : DepositStep.BROADCAST_BTC
      }
      isWaiting={false}
      error={broadcastError}
      isComplete={isComplete}
      isProcessing={isBroadcasting}
      canClose={canClose}
      canContinueInBackground={false}
      payoutSigningProgress={null}
      onClose={onClose}
      successMessage="Your Bitcoin transaction has been broadcast to the network. It will be confirmed after receiving the required number of Bitcoin confirmations."
      onRetry={broadcastError ? handleSign : undefined}
    />
  );
}
