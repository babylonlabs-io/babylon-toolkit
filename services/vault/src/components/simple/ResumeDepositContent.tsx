/**
 * ResumeDepositContent
 *
 * Content components for resuming a deposit flow at the payout signing
 * or BTC broadcast step. Renders the same DepositProgressView stepper
 * as the initial deposit flow with earlier steps already completed.
 *
 * Used by SimpleDeposit when opened in resume mode.
 */

import { Button, Input } from "@babylonlabs-io/core-ui";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useActivationState } from "@/hooks/deposit/useActivationState";
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
import {
  buildHtlcSecretContext,
  walletSupportsDeriveContextHash,
} from "@/utils/secretUtils";

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
        isComplete ? DepositFlowStep.COMPLETED : DepositFlowStep.SIGN_PAYOUTS
      }
      isWaiting={false}
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
    DepositFlowStep.BROADCAST_PRE_PEGIN,
    broadcasting,
    false,
    error,
  );

  return (
    <DepositProgressView
      currentStep={DepositFlowStep.BROADCAST_PRE_PEGIN}
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
  onClose: () => void;
  onSuccess: () => void;
}

function resolveProviderAddress(activity: VaultActivity): string | null {
  return activity.providers[0]?.id ?? null;
}

export function ResumeLamportContent({
  activity,
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
        const providerAddress = resolveProviderAddress(activity);
        if (!providerAddress) {
          throw new Error("Could not resolve vault provider address");
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
        if (!activity.applicationEntryPoint) {
          throw new Error(
            "Missing application controller address on activity; cannot derive Lamport keypair",
          );
        }

        await submitLamportPublicKey({
          btcTxid,
          depositorBtcPubkey: activity.depositorBtcPubkey,
          appContractAddress: activity.applicationEntryPoint,
          providerAddress,
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
    [activity, ethAddress, onSuccess],
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

// ---------------------------------------------------------------------------
// Activate Vault Content
// ---------------------------------------------------------------------------

export interface ResumeActivationContentProps {
  activity: VaultActivity;
  depositorEthAddress: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResumeActivationContent({
  activity,
  depositorEthAddress,
  onClose,
  onSuccess,
}: ResumeActivationContentProps) {
  const [secretHex, setSecretHex] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [deriving, setDeriving] = useState(false);

  const btcConnector = useChainConnector("BTC");
  const btcWallet = (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ?? null;

  const { activating, error, handleActivation } = useActivationState({
    activity,
    depositorEthAddress,
    onSuccess,
  });

  // When the wallet supports deriveContextHash, auto-derive and submit the secret.
  // The context is reconstructed from the same parameters used at deposit time.
  const canDerive = walletSupportsDeriveContextHash(btcWallet);

  useEffect(() => {
    if (!canDerive || submitted || deriving) return;

    const derive = async () => {
      setDeriving(true);
      try {
        // Reconstruct the same context used at deposit time.
        // vaultIndex=0 for single deposits; split deposits would need
        // the index stored in localStorage (out of scope for this spike).
        const context = buildHtlcSecretContext({
          depositorEthAddress,
          vaultProviderAddress: activity.providers[0]?.id ?? "",
          applicationEntryPoint: activity.applicationEntryPoint ?? "",
          vaultIndex: 0,
        });
        const derived = await btcWallet!.deriveContextHash!(context);
        setSecretHex(derived);
        setSubmitted(true);
        await handleActivation(derived);
      } catch {
        // Derivation failed — fall back to manual entry
        setDeriving(false);
      }
    };

    derive();
  }, [canDerive, submitted, deriving, btcWallet, depositorEthAddress, activity, handleActivation]);

  const cleanSecret = secretHex.trim().replace(/^0x/, "");
  const isValidFormat = /^[0-9a-fA-F]{64}$/.test(cleanSecret);

  const handleSubmit = useCallback(async () => {
    setSubmitted(true);
    await handleActivation(cleanSecret);
  }, [cleanSecret, handleActivation]);

  const handleRetry = useCallback(() => {
    setSubmitted(false);
    setDeriving(false);
    setSecretHex("");
  }, []);

  // After submission, show progress view
  if (submitted) {
    const derived = computeDepositDerivedState(
      DepositFlowStep.ACTIVATE_VAULT,
      activating,
      false,
      error,
    );

    return (
      <DepositProgressView
        currentStep={DepositFlowStep.ACTIVATE_VAULT}
        isWaiting={false}
        error={error}
        isComplete={derived.isComplete}
        isProcessing={derived.isProcessing}
        canClose={derived.canClose}
        canContinueInBackground={false}
        payoutSigningProgress={null}
        onClose={onClose}
        successMessage="Your vault has been activated. The vault provider can now claim the HTLC on Bitcoin."
        onRetry={error ? handleRetry : undefined}
      />
    );
  }

  // When wallet is deriving, show a loading state
  if (deriving) {
    return (
      <div className="flex flex-col gap-6 rounded-2xl bg-secondary-contrast p-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-accent-primary">
            Activate Vault
          </h3>
          <p className="text-tertiary text-sm">
            Deriving secret from your wallet... Please approve the request in
            your wallet.
          </p>
        </div>
      </div>
    );
  }

  // Secret input form (fallback for wallets without deriveContextHash)
  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-secondary-contrast p-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-accent-primary">
          Activate Vault
        </h3>
        <p className="text-tertiary text-sm">
          Enter the HTLC secret you saved during the deposit to activate this
          vault on Ethereum.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Input
          placeholder="Enter secret (64 hex characters)"
          value={secretHex}
          onChange={(e) => setSecretHex(e.target.value)}
          className="font-mono text-sm"
        />
        {secretHex.length > 0 && !isValidFormat && (
          <p className="text-xs text-error-main">
            Secret must be exactly 64 hex characters (32 bytes)
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <Button
          variant="outlined"
          color="primary"
          className="flex-1"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          className="flex-1"
          disabled={!isValidFormat}
          onClick={handleSubmit}
        >
          Activate
        </Button>
      </div>
    </div>
  );
}
