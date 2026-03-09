/**
 * ResumeDepositContent
 *
 * Content components for resuming a deposit flow at the payout signing
 * or BTC broadcast step. Renders the same DepositProgressView stepper
 * as the initial deposit flow with earlier steps already completed.
 *
 * Used by SimpleDeposit when opened in resume mode.
 */

import { useCallback, useMemo, useState } from "react";
import type { Hex } from "viem";

import type { DepositorGraphTransactions } from "@/clients/vault-provider-rpc/types";
import {
  computeDepositDerivedState,
  DepositFlowStep,
} from "@/components/deposit/DepositSignModal/depositStepHelpers";
import { MnemonicModal } from "@/components/deposit/MnemonicModal";
import { usePayoutSigningState } from "@/components/deposit/PayoutSignModal/usePayoutSigningState";
import { useETHWallet } from "@/context/wallet";
import { submitLamportPublicKey } from "@/hooks/deposit/depositFlowSteps/lamportSubmission";
import { useBroadcastState } from "@/hooks/deposit/useBroadcastState";
import { useRunOnce } from "@/hooks/useRunOnce";
import {
  getMnemonicIdForPegin,
  hasMnemonicEntry,
  isLamportMismatchError,
  linkPeginToMnemonic,
} from "@/services/lamport";
import type { VaultActivity } from "@/types/activity";
import type { ClaimerTransactions } from "@/types/rpc";
import type { VaultProvider } from "@/types/vaultProvider";

import { DepositProgressView } from "./DepositProgressView";

// ---------------------------------------------------------------------------
// Sign Payouts Content
// ---------------------------------------------------------------------------

export interface ResumeSignContentProps {
  activity: VaultActivity;
  transactions: ClaimerTransactions[] | null;
  depositorGraph: DepositorGraphTransactions;
  btcPublicKey: string;
  depositorEthAddress: Hex;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResumeSignContent({
  activity,
  transactions,
  depositorGraph,
  btcPublicKey,
  depositorEthAddress,
  onClose,
  onSuccess,
}: ResumeSignContentProps) {
  const { signing, progress, error, isComplete, handleSign } =
    usePayoutSigningState({
      activity,
      transactions,
      depositorGraph,
      btcPublicKey,
      depositorEthAddress,
      onSuccess,
    });

  useRunOnce(handleSign);

  const derived = computeDepositDerivedState(
    isComplete ? DepositFlowStep.COMPLETED : DepositFlowStep.SIGN_PAYOUTS,
    signing,
    false,
    error?.message ?? null,
  );

  return (
    <DepositProgressView
      currentStep={
        isComplete
          ? DepositFlowStep.BROADCAST_BTC
          : DepositFlowStep.SIGN_PAYOUTS
      }
      isWaiting={isComplete}
      error={error?.message ?? null}
      isComplete={derived.isComplete}
      isProcessing={derived.isProcessing}
      canClose={derived.canClose}
      canContinueInBackground={derived.canContinueInBackground}
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

  const derived = computeDepositDerivedState(
    DepositFlowStep.BROADCAST_BTC,
    broadcasting,
    false,
    error,
  );

  return (
    <DepositProgressView
      currentStep={DepositFlowStep.BROADCAST_BTC}
      isWaiting={false}
      error={error}
      isComplete={derived.isComplete}
      isProcessing={derived.isProcessing}
      canClose={derived.canClose}
      canContinueInBackground={derived.canContinueInBackground}
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
  const { address: ethAddress } = useETHWallet();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(true);
  const [storedFailed, setStoredFailed] = useState(false);

  const mappedMnemonicId = useMemo(
    () =>
      activity.txHash && ethAddress
        ? getMnemonicIdForPegin(activity.txHash, ethAddress)
        : null,
    [activity.txHash, ethAddress],
  );

  const canUseStoredMnemonic =
    !storedFailed &&
    !!mappedMnemonicId &&
    !!ethAddress &&
    hasMnemonicEntry(mappedMnemonicId, ethAddress);

  const handleMnemonicComplete = useCallback(
    async (mnemonic?: string, mnemonicId?: string) => {
      if (!mnemonic) return;

      setShowMnemonic(false);
      setSubmitting(true);
      setError(null);

      try {
        const providerUrl = resolveProviderUrl(activity, vaultProviders);
        if (!providerUrl) {
          throw new Error("Could not resolve vault provider URL");
        }

        const btcTxid = activity.txHash ?? null;
        if (!btcTxid) {
          throw new Error("Missing transaction hash");
        }

        if (!activity.depositorBtcPubkey) {
          throw new Error(
            "Missing depositor BTC public key on activity; cannot derive Lamport keypair",
          );
        }
        if (!activity.applicationController) {
          throw new Error(
            "Missing application controller address on activity; cannot derive Lamport keypair",
          );
        }

        await submitLamportPublicKey({
          btcTxid,
          depositorBtcPubkey: activity.depositorBtcPubkey,
          appContractAddress: activity.applicationController,
          providerUrl,
          getMnemonic: () => Promise.resolve(mnemonic),
        });

        if (mnemonicId && ethAddress) {
          linkPeginToMnemonic(btcTxid, mnemonicId, ethAddress);
        }

        setSubmitting(false);
        onSuccess();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to submit lamport key";

        // Only invalidate the stored mnemonic when the VP explicitly
        // reports a Lamport hash mismatch (wrong mnemonic). Network
        // errors, missing fields, etc. should not discard a potentially
        // valid stored mnemonic.
        if (isLamportMismatchError(err)) {
          setStoredFailed(true);
        }

        setSubmitting(false);
        setError(msg);
      }
    },
    [activity, vaultProviders, ethAddress, onSuccess],
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
        // canUseStoredMnemonic doubles as hasExistingVaults here because
        // when it is false, importMode is set to true which overrides
        // the hasExistingVaults behaviour inside MnemonicModal.
        hasExistingVaults={canUseStoredMnemonic}
        scope={ethAddress}
        mnemonicId={canUseStoredMnemonic ? mappedMnemonicId : undefined}
        importMode={!canUseStoredMnemonic}
        allowCreateNewMnemonic={false}
      />
    );
  }

  return (
    <DepositProgressView
      currentStep={DepositFlowStep.SIGN_PAYOUTS}
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
