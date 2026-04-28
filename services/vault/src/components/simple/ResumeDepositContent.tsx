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
import {
  computeWotsBlockPublicKeysHash,
  deriveVaultRoot,
  deriveWotsBlocksFromSeed,
  expandWotsSeed,
  hexToUint8Array,
  isWotsMismatchError,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";
import type { Hex } from "viem";

import {
  computeDepositDerivedState,
  DepositFlowStep,
} from "@/components/deposit/DepositSignModal/depositStepHelpers";
import { usePayoutSigningState } from "@/components/deposit/PayoutSignModal/usePayoutSigningState";
import { submitWotsPublicKey } from "@/hooks/deposit/depositFlowSteps/wotsSubmission";
import { useActivationState } from "@/hooks/deposit/useActivationState";
import { useBroadcastState } from "@/hooks/deposit/useBroadcastState";
import { useRefundState } from "@/hooks/deposit/useRefundState";
import { useRunOnce } from "@/hooks/useRunOnce";
import { fetchVaultById } from "@/services/vault/fetchVaults";
import type { VaultActivity } from "@/types/activity";
import { parseFundingOutpointsFromTx } from "@/utils/parseFundingOutpoints";

import { DepositProgressView } from "./DepositProgressView";

// ---------------------------------------------------------------------------
// Sign Payouts Content
// ---------------------------------------------------------------------------

export interface ResumeSignContentProps {
  activity: VaultActivity;
  btcPublicKey: string;
  depositorEthAddress: Hex;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResumeSignContent({
  activity,
  btcPublicKey,
  depositorEthAddress,
  onClose,
  onSuccess,
}: ResumeSignContentProps) {
  const { signing, progress, error, isComplete, handleSign } =
    usePayoutSigningState({
      activity,
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
// Broadcast Pre-PegIn Content
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
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider =
    (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ??
    null;

  // Starts true: useRunOnce auto-fires handleSubmit on mount, so the
  // first render must show processing — not a false-success banner from
  // `isComplete = !submitting && !error`.
  const [submitting, setSubmitting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    // useRunOnce fires on mount before the depositorWotsPkHash guard
    // returns; bail to avoid a wallet popup the UI is telling the user
    // to wait on.
    if (!activity.depositorWotsPkHash) {
      setSubmitting(false);
      return;
    }
    if (!btcWalletProvider) {
      setError("BTC wallet is not connected");
      setSubmitting(false);
      return;
    }
    setSubmitting(true);
    setError(null);

    let root: Uint8Array | null = null;
    try {
      const providerAddress = resolveProviderAddress(activity);
      if (!providerAddress) {
        throw new Error("Could not resolve vault provider address");
      }
      const peginTxHash = activity.peginTxHash ?? null;
      if (!peginTxHash) {
        throw new Error("Missing pegin transaction hash");
      }
      if (!activity.unsignedPrePeginTx) {
        throw new Error(
          "Missing pre-pegin transaction; cannot recover WOTS seed inputs",
        );
      }

      // Indexer carries htlcVout (per-vault domain separator) and the
      // canonical depositor pubkey.
      const vault = await fetchVaultById(activity.id);
      const depositorBtcPubkey =
        activity.depositorBtcPubkey ?? vault?.depositorBtcPubkey;
      if (!depositorBtcPubkey) {
        throw new Error(
          "Missing depositor BTC public key; vault may not be indexed yet. Please try again shortly.",
        );
      }
      if (vault?.htlcVout === undefined) {
        throw new Error(
          "Missing htlcVout from vault details; vault may not be indexed yet. Please try again shortly.",
        );
      }

      const fundingOutpoints = parseFundingOutpointsFromTx(
        activity.unsignedPrePeginTx,
      );

      root = await deriveVaultRoot(btcWalletProvider, {
        depositorBtcPubkey: hexToUint8Array(depositorBtcPubkey),
        fundingOutpoints,
      });
      const seed = expandWotsSeed(root, vault.htlcVout);
      const wotsPublicKeys = await deriveWotsBlocksFromSeed(seed);

      const computedHash = computeWotsBlockPublicKeysHash(wotsPublicKeys);
      if (computedHash !== activity.depositorWotsPkHash) {
        throw new Error(
          "WOTS public key hash does not match the on-chain commitment — the wrong wallet is connected.",
        );
      }

      await submitWotsPublicKey({
        peginTxHash,
        depositorBtcPubkey,
        providerAddress,
        wotsPublicKeys,
      });

      setSubmitting(false);
      onSuccess();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to submit WOTS key";
      // VP-side mismatch gets the same wording as the local pre-flight
      // so the user can act on either path.
      if (isWotsMismatchError(err)) {
        setError(
          "WOTS public key hash does not match the on-chain commitment — the wrong wallet is connected.",
        );
      } else {
        setError(msg);
      }
      setSubmitting(false);
    } finally {
      root?.fill(0);
    }
  }, [activity, btcWalletProvider, onSuccess]);

  useRunOnce(handleSubmit);

  if (!activity.depositorWotsPkHash) {
    return (
      <DepositProgressView
        currentStep={DepositFlowStep.SIGN_PAYOUTS}
        isWaiting={false}
        error="Vault is not fully indexed yet — WOTS key verification is not available. Please try again shortly."
        isComplete={false}
        isProcessing={false}
        canClose={true}
        canContinueInBackground={false}
        payoutSigningProgress={null}
        onClose={onClose}
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
      onRetry={error ? handleSubmit : undefined}
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

  const { activating, error, handleActivation } = useActivationState({
    activity,
    depositorEthAddress,
    onSuccess,
  });

  const cleanSecret = secretHex.trim().replace(/^0x/, "");
  const isValidFormat = /^[0-9a-fA-F]{64}$/.test(cleanSecret);

  const handleSubmit = useCallback(async () => {
    setSubmitted(true);
    await handleActivation(cleanSecret);
  }, [cleanSecret, handleActivation]);

  const handleRetry = useCallback(() => {
    setSubmitted(false);
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

  // Secret input form
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
