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
import { submitWotsPublicKey } from "@/hooks/deposit/depositFlowSteps/wotsSubmission";
import { useActivationState } from "@/hooks/deposit/useActivationState";
import { useBroadcastState } from "@/hooks/deposit/useBroadcastState";
import { useRefundState } from "@/hooks/deposit/useRefundState";
import { useRunOnce } from "@/hooks/useRunOnce";
import { fetchVaultById } from "@/services/vault/fetchVaults";
import {
  getMnemonicIdForPegin,
  hasMnemonicEntry,
  isWotsMismatchError,
  linkPeginToMnemonic,
} from "@/services/wots";
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
// Submit WOTS Key Content
// ---------------------------------------------------------------------------

export interface ResumeWotsContentProps {
  activity: VaultActivity;
  onClose: () => void;
  onSuccess: () => void;
}

function resolveProviderAddress(activity: VaultActivity): string | null {
  return activity.providers[0]?.id ?? null;
}

export function ResumeWotsContent({
  activity,
  onClose,
  onSuccess,
}: ResumeWotsContentProps) {
  const { address: ethAddress } = useETHWallet();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(true);
  const [storedFailed, setStoredFailed] = useState(false);

  const mappedMnemonicId = useMemo(
    () =>
      activity.peginTxHash && ethAddress
        ? getMnemonicIdForPegin(activity.peginTxHash, ethAddress)
        : null,
    [activity.peginTxHash, ethAddress],
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

        const peginTxHash = activity.peginTxHash ?? null;
        if (!peginTxHash) {
          throw new Error("Missing pegin transaction hash");
        }

        // Resolve depositorBtcPubkey — available on confirmed vaults from indexer,
        // but may be missing on pending (localStorage-only) activities.
        let depositorBtcPubkey = activity.depositorBtcPubkey;
        if (!depositorBtcPubkey) {
          const vault = await fetchVaultById(activity.id);
          depositorBtcPubkey = vault?.depositorBtcPubkey;
        }
        if (!depositorBtcPubkey) {
          throw new Error(
            "Missing depositor BTC public key; vault may not be indexed yet. Please try again shortly.",
          );
        }
        if (!activity.applicationEntryPoint) {
          throw new Error(
            "Missing application controller address on activity; cannot derive WOTS keypair",
          );
        }

        await submitWotsPublicKey({
          peginTxHash,
          depositorBtcPubkey,
          appContractAddress: activity.applicationEntryPoint,
          providerAddress,
          getMnemonic: () => Promise.resolve(mnemonic),
        });

        if (mnemonicId && ethAddress) {
          linkPeginToMnemonic(peginTxHash, mnemonicId, ethAddress);
        }

        setSubmitting(false);
        onSuccess();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to submit WOTS key";

        // Only invalidate the stored mnemonic when the VP explicitly
        // reports a WOTS hash mismatch (wrong mnemonic). Network
        // errors, missing fields, etc. should not discard a potentially
        // valid stored mnemonic.
        if (isWotsMismatchError(err)) {
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
      successMessage="Your WOTS public key has been submitted. The deposit will continue processing."
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
    <div className="flex flex-col gap-6 rounded-2xl bg-surface p-6">
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

// ---------------------------------------------------------------------------
// Refund HTLC Content
// ---------------------------------------------------------------------------

export interface ResumeRefundContentProps {
  activity: VaultActivity;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResumeRefundContent({
  activity,
  onClose,
  onSuccess,
}: ResumeRefundContentProps) {
  const { refunding, refundTxId, error, handleRefund } = useRefundState({
    activity,
  });

  useRunOnce(handleRefund);

  const hasSucceeded = !!refundTxId && !refunding;
  const isComplete = hasSucceeded;
  const canClose = hasSucceeded || !!error;
  const isProcessing = refunding && !error;

  // When the refund succeeds, the user closes the dialog themselves after
  // seeing the confirmation. We call onSuccess() at that point so the parent
  // refetches activities only after the user has acknowledged the result.
  const handleClose = () => {
    if (isComplete) {
      onSuccess();
    }
    onClose();
  };

  return (
    <DepositProgressView
      currentStep={DepositFlowStep.BROADCAST_PRE_PEGIN}
      isWaiting={false}
      error={error}
      isComplete={isComplete}
      isProcessing={isProcessing}
      canClose={canClose}
      canContinueInBackground={false}
      payoutSigningProgress={null}
      onClose={handleClose}
      successMessage={
        refundTxId
          ? `Refund transaction broadcast successfully. Transaction ID: ${refundTxId}`
          : "Your refund transaction has been broadcast to Bitcoin."
      }
      onRetry={error ? handleRefund : undefined}
    />
  );
}
