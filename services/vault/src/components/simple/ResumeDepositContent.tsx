/**
 * ResumeDepositContent
 *
 * Content components for resuming a deposit flow at the payout signing
 * or BTC broadcast step. Renders the same DepositProgressView stepper
 * as the initial deposit flow with earlier steps already completed.
 *
 * Used by SimpleDeposit when opened in resume mode.
 */

import { useCallback, useState } from "react";
import type { Hex } from "viem";

import { DepositStep } from "@/components/deposit/DepositSignModal/constants";
import { MnemonicModal } from "@/components/deposit/MnemonicModal";
import { usePayoutSigningState } from "@/components/deposit/PayoutSignModal/usePayoutSigningState";
import { submitLamportPublicKey } from "@/hooks/deposit/depositFlowSteps/lamportSubmission";
import { useBroadcastState } from "@/hooks/deposit/useBroadcastState";
import { useRunOnce } from "@/hooks/useRunOnce";
import type { VaultActivity } from "@/types/activity";
import type { ClaimerTransactions } from "@/types/rpc";
import type { VaultProvider } from "@/types/vaultProvider";
import { stripHexPrefix } from "@/utils/btc";

import { DepositProgressView } from "./DepositProgressView";

// ---------------------------------------------------------------------------
// Sign Payouts Content
// ---------------------------------------------------------------------------

export interface ResumeSignContentProps {
  activity: VaultActivity;
  transactions: ClaimerTransactions[] | null;
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
    });

  useRunOnce(handleSign);

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
  const { broadcasting, error, handleBroadcast } = useBroadcastState({
    activity,
    depositorEthAddress,
    onSuccess,
  });

  useRunOnce(handleBroadcast);

  const canClose = !!error || !broadcasting;

  return (
    <DepositProgressView
      currentStep={DepositStep.BROADCAST_BTC}
      isWaiting={false}
      error={error}
      isComplete={false}
      isProcessing={broadcasting}
      canClose={canClose}
      canContinueInBackground={false}
      payoutSigningProgress={null}
      onClose={onClose}
      successMessage="Your Bitcoin transaction has been broadcast to the network. It will be confirmed after receiving the required number of Bitcoin confirmations."
      onRetry={error ? handleBroadcast : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// Submit Lamport Key Content
// ---------------------------------------------------------------------------

export interface ResumeLamportContentProps {
  activity: VaultActivity;
  vaultProviders: VaultProvider[];
  onClose: () => void;
  onSuccess: () => void;
}

function resolveProviderUrl(
  activity: VaultActivity,
  vaultProviders: VaultProvider[],
): string | null {
  const providerAddress = activity.providers[0]?.id;
  if (!providerAddress) return null;
  const provider = vaultProviders.find(
    (p) => p.id.toLowerCase() === providerAddress.toLowerCase(),
  );
  return provider?.url ?? null;
}

export function ResumeLamportContent({
  activity,
  vaultProviders,
  onClose,
  onSuccess,
}: ResumeLamportContentProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(true);

  const handleMnemonicComplete = useCallback(
    async (mnemonic?: string) => {
      if (!mnemonic) return;

      setShowMnemonic(false);
      setSubmitting(true);
      setError(null);

      try {
        const providerUrl = resolveProviderUrl(activity, vaultProviders);
        if (!providerUrl) {
          throw new Error("Could not resolve vault provider URL");
        }

        const btcTxid = activity.txHash
          ? stripHexPrefix(activity.txHash)
          : null;
        if (!btcTxid) {
          throw new Error("Missing transaction hash");
        }

        await submitLamportPublicKey({
          btcTxid,
          depositorBtcPubkey: activity.depositorBtcPubkey ?? "",
          appContractAddress: activity.applicationController ?? "",
          providerUrl,
          getMnemonic: () => Promise.resolve(mnemonic),
        });

        setSubmitting(false);
        onSuccess();
      } catch (err) {
        setSubmitting(false);
        setError(
          err instanceof Error ? err.message : "Failed to submit lamport key",
        );
      }
    },
    [activity, vaultProviders, onSuccess],
  );

  const handleRetry = useCallback(() => {
    setError(null);
    setShowMnemonic(true);
  }, []);

  if (showMnemonic) {
    return (
      <MnemonicModal
        open
        onClose={onClose}
        onComplete={handleMnemonicComplete}
        hasExistingVaults
      />
    );
  }

  return (
    <DepositProgressView
      currentStep={DepositStep.SIGN_PAYOUTS}
      isWaiting={false}
      error={error}
      isComplete={!submitting && !error}
      isProcessing={submitting}
      canClose={!submitting}
      canContinueInBackground={false}
      payoutSigningProgress={null}
      onClose={onClose}
      successMessage="Your Lamport public key has been submitted. The deposit will continue processing."
      onRetry={error ? handleRetry : undefined}
    />
  );
}
