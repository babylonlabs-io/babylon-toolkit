/**
 * ResumeDepositContent
 *
 * Content components for resuming a deposit flow at the payout signing
 * or BTC broadcast step. Renders the same DepositProgressView stepper
 * as the initial deposit flow with earlier steps already completed.
 *
 * Used by SimpleDeposit when opened in resume mode.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  computeWotsBlockPublicKeysHash,
  deriveVaultRoot,
  deriveWotsBlocksFromSeed,
  expandAuthAnchor,
  expandHashlockSecret,
  expandWotsSeed,
  hexToUint8Array,
  isWotsMismatchError,
  parseFundingOutpointsFromTx,
  uint8ArrayToHex,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { primeVpTokenRegistry } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import {
  computeDepositDerivedState,
  DepositFlowStep,
} from "@/components/deposit/DepositSignModal/depositStepHelpers";
import { usePayoutSigningState } from "@/components/deposit/PayoutSignModal/usePayoutSigningState";
import { submitWotsPublicKey } from "@/hooks/deposit/depositFlowSteps/wotsSubmission";
import { useActivationState } from "@/hooks/deposit/useActivationState";
import { useBroadcastState } from "@/hooks/deposit/useBroadcastState";
import { useReleaseVpTokenOnUnmount } from "@/hooks/deposit/useReleaseVpTokenOnUnmount";
import { useRunOnce } from "@/hooks/useRunOnce";
import { logger } from "@/infrastructure";
import type { VaultActivity } from "@/types/activity";
import { stripHexPrefix } from "@/utils/btc";
import { getVpProxyUrl } from "@/utils/rpc";

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
  // `isComplete = !loading && !error`.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Release the primed registry entry on unmount if activation didn't
  // happen (the normal release point in `useVaultActions`). Bounds
  // `authAnchorHex` lifetime when the user abandons the resume flow.
  const trackPrimedTxid = useReleaseVpTokenOnUnmount();

  const handleSubmit = useCallback(async () => {
    if (!btcWalletProvider) {
      setError("BTC wallet is not connected");
      setLoading(false);
      return;
    }
    setLoading(true);
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

      // Read signing-critical inputs (depositor pubkey, htlcVout,
      // depositorWotsPkHash) directly from the registry. Indexer data is
      // untrusted for derivation domain separators and on-chain commitments.
      // Fire the VP pubkey fetch in parallel — it's needed later for
      // registry priming and is independent of the vault data read.
      const reader = getVaultRegistryReader();
      const vaultDataPromise = reader.getVaultData(activity.id as Hex);
      const pinnedServerPubkeyPromise = reader
        .getVaultProviderBtcPubKey(providerAddress as Address)
        .catch((err: unknown) => {
          logger.warn("Failed to fetch VP pubkey for registry priming", {
            peginTxHash,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        });
      const { basic, protocol } = await vaultDataPromise;
      const depositorBtcPubkey = basic.depositorBtcPubKey;
      const htlcVout = protocol.htlcVout;
      const onChainWotsPkHash = protocol.depositorWotsPkHash;
      const onChainPrePeginTxHash = protocol.prePeginTxHash;

      // Indexer-supplied tx is untrusted. Verify against on-chain
      // prePeginTxHash before deriveVaultRoot fires the wallet popup.
      const computedTxHash = calculateBtcTxHash(activity.unsignedPrePeginTx);
      if (
        computedTxHash.toLowerCase() !== onChainPrePeginTxHash.toLowerCase()
      ) {
        throw new Error(
          `Pre-PegIn transaction hash mismatch: computed ${computedTxHash} from indexer tx, ` +
            `but on-chain contract has ${onChainPrePeginTxHash}. ` +
            `Aborting to prevent potential attack.`,
        );
      }

      const fundingOutpoints = parseFundingOutpointsFromTx(
        activity.unsignedPrePeginTx,
      );

      root = await deriveVaultRoot(btcWalletProvider, {
        depositorBtcPubkey: hexToUint8Array(depositorBtcPubkey),
        fundingOutpoints,
      });

      // Reuse the derived root for the auth anchor so submitWotsPublicKey
      // doesn't trigger a second wallet popup.
      const authAnchorBytes = expandAuthAnchor(root);
      let authAnchorHex: string;
      try {
        authAnchorHex = uint8ArrayToHex(authAnchorBytes);
      } finally {
        authAnchorBytes.fill(0);
      }

      const seed = expandWotsSeed(root, htlcVout);
      let wotsPublicKeys;
      try {
        wotsPublicKeys = await deriveWotsBlocksFromSeed(seed);
      } finally {
        seed.fill(0);
      }

      const computedHash = computeWotsBlockPublicKeysHash(wotsPublicKeys);
      if (computedHash.toLowerCase() !== onChainWotsPkHash.toLowerCase()) {
        throw new Error(
          "WOTS public key hash does not match the on-chain commitment — the wrong wallet is connected.",
        );
      }

      // Best-effort: if the parallel pubkey fetch failed, skip
      // priming — submitWotsPublicKey re-derives on cache miss.
      const pinnedServerPubkey = await pinnedServerPubkeyPromise;
      if (pinnedServerPubkey) {
        const primedTxid = stripHexPrefix(peginTxHash);
        primeVpTokenRegistry({
          baseUrl: getVpProxyUrl(providerAddress),
          peginTxid: primedTxid,
          authAnchorHex,
          pinnedServerPubkey,
        });
        trackPrimedTxid(primedTxid);
      }

      await submitWotsPublicKey({
        vaultId: activity.id,
        peginTxHash,
        depositorBtcPubkey,
        providerAddress,
        wotsPublicKeys,
        btcWallet: btcWalletProvider,
        unsignedPrePeginTxHex: activity.unsignedPrePeginTx,
      });

      setLoading(false);
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
      setLoading(false);
    } finally {
      root?.fill(0);
    }
  }, [activity, btcWalletProvider, onSuccess, trackPrimedTxid]);

  useRunOnce(handleSubmit);

  return (
    <DepositProgressView
      currentStep={DepositFlowStep.SIGN_PAYOUTS}
      isWaiting={false}
      error={error}
      isComplete={!loading && !error}
      isProcessing={loading}
      canClose={!loading}
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
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider =
    (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ??
    null;

  // Starts true: useRunOnce auto-fires handleSubmit on mount, so the
  // first render must show processing.
  const [loading, setLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    activating,
    error: activationError,
    handleActivation,
  } = useActivationState({
    activity,
    depositorEthAddress,
    onSuccess,
  });

  const handleSubmit = useCallback(async () => {
    if (!btcWalletProvider) {
      setLocalError("BTC wallet is not connected");
      setLoading(false);
      return;
    }
    if (!activity.unsignedPrePeginTx) {
      setLocalError(
        "Missing pre-pegin transaction; cannot recover HTLC secret",
      );
      setLoading(false);
      return;
    }
    setLoading(true);
    setLocalError(null);

    let root: Uint8Array | null = null;
    let secretBytes: Uint8Array | null = null;
    try {
      // Read signing-critical inputs (depositor pubkey, htlcVout) directly
      // from the registry. Indexer data is untrusted for derivation domain
      // separators.
      const reader = getVaultRegistryReader();
      const { basic, protocol } = await reader.getVaultData(activity.id as Hex);
      const depositorBtcPubkey = basic.depositorBtcPubKey;
      const htlcVout = protocol.htlcVout;
      const onChainPrePeginTxHash = protocol.prePeginTxHash;

      // Indexer-supplied tx is untrusted. Verify against on-chain
      // prePeginTxHash before deriveVaultRoot fires the wallet popup.
      const computedTxHash = calculateBtcTxHash(activity.unsignedPrePeginTx);
      if (
        computedTxHash.toLowerCase() !== onChainPrePeginTxHash.toLowerCase()
      ) {
        throw new Error(
          `Pre-PegIn transaction hash mismatch: computed ${computedTxHash} from indexer tx, ` +
            `but on-chain contract has ${onChainPrePeginTxHash}. ` +
            `Aborting to prevent potential attack.`,
        );
      }

      const fundingOutpoints = parseFundingOutpointsFromTx(
        activity.unsignedPrePeginTx,
      );

      root = await deriveVaultRoot(btcWalletProvider, {
        depositorBtcPubkey: hexToUint8Array(depositorBtcPubkey),
        fundingOutpoints,
      });

      secretBytes = expandHashlockSecret(root, htlcVout);
      const secretHex = uint8ArrayToHex(secretBytes);

      // Hand off to the existing activation state machine. It fetches
      // the canonical hashlock from the on-chain registry and rejects
      // any mismatch — wrong-wallet derivation surfaces as a structured
      // error there, not a silent submission.
      await handleActivation(secretHex);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to activate vault";
      setLocalError(msg);
    } finally {
      root?.fill(0);
      secretBytes?.fill(0);
      setLoading(false);
    }
  }, [activity, btcWalletProvider, handleActivation]);

  useRunOnce(handleSubmit);

  const error = localError ?? activationError;
  const derived = computeDepositDerivedState(
    DepositFlowStep.ACTIVATE_VAULT,
    activating || loading,
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
      onRetry={error ? handleSubmit : undefined}
    />
  );
}
