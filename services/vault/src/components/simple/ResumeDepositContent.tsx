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
  stripHexPrefix,
  uint8ArrayToHex,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { primeVpTokenRegistry } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { computeDepositDerivedState } from "@/components/deposit/DepositSignModal/depositStepHelpers";
import { usePayoutSigningState } from "@/components/deposit/PayoutSignModal/usePayoutSigningState";
import { COPY } from "@/copy";
import {
  DepositFlowStep,
  payoutSigningStep,
} from "@/hooks/deposit/depositFlowSteps";
import { submitWotsPublicKey } from "@/hooks/deposit/depositFlowSteps/wotsSubmission";
import { useActivationState } from "@/hooks/deposit/useActivationState";
import { useBroadcastState } from "@/hooks/deposit/useBroadcastState";
import { useReleaseVpTokenOnUnmount } from "@/hooks/deposit/useReleaseVpTokenOnUnmount";
import { useRunOnce } from "@/hooks/useRunOnce";
import { logger } from "@/infrastructure";
import type { VaultActivity } from "@/types/activity";
import {
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "@/utils/btc";
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

  const renderStep = isComplete
    ? DepositFlowStep.AWAIT_VP_VERIFICATION
    : payoutSigningStep(progress.phase);
  const renderIsWaiting = isComplete;
  const derived = computeDepositDerivedState(
    renderStep,
    signing,
    renderIsWaiting,
    error?.message ?? null,
  );

  return (
    <DepositProgressView
      currentStep={renderStep}
      error={error?.message ?? null}
      isComplete={derived.isComplete}
      isProcessing={derived.isProcessing}
      canClose={derived.canClose}
      canContinueInBackground={derived.canContinueInBackground}
      payoutSigningProgress={signing ? progress : null}
      peginSigningProgress={null}
      onClose={onClose}
      onRetry={error ? handleSign : undefined}
      waitDetailPersistKey={activity.id}
    />
  );
}

// ---------------------------------------------------------------------------
// Broadcast Pre-PegIn Content
// ---------------------------------------------------------------------------

export interface ResumeBroadcastContentProps {
  activity: VaultActivity;
  /**
   * Every vault ID sharing this Pre-PegIn transaction (batched pegin).
   * Includes `activity.id`. The broadcast confirms all of them.
   */
  batchVaultIds: string[];
  depositorEthAddress: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResumeBroadcastContent({
  activity,
  batchVaultIds,
  depositorEthAddress,
  onClose,
  onSuccess,
}: ResumeBroadcastContentProps) {
  const { broadcasting, error, handleBroadcast } = useBroadcastState({
    activity,
    batchVaultIds,
    depositorEthAddress,
    onSuccess,
  });

  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider = btcConnector?.connectedWallet?.provider;
  const connectedBtcAddress = btcConnector?.connectedWallet?.account?.address;

  // Defensive auto-run gate (effectively always-enabled today) — see the note
  // in ResumeWotsContent. Fires when no provider is present so the genuine
  // "not connected" error surfaces (handleBroadcast throws it).
  useRunOnce(
    handleBroadcast,
    !btcWalletProvider || Boolean(connectedBtcAddress),
  );

  const derived = computeDepositDerivedState(
    DepositFlowStep.BROADCAST_PRE_PEGIN,
    broadcasting,
    false,
    error,
  );

  return (
    <DepositProgressView
      currentStep={DepositFlowStep.BROADCAST_PRE_PEGIN}
      error={error}
      isComplete={derived.isComplete}
      isProcessing={derived.isProcessing}
      canClose={derived.canClose}
      canContinueInBackground={derived.canContinueInBackground}
      payoutSigningProgress={null}
      peginSigningProgress={null}
      onClose={onClose}
      successMessage={COPY.deposit.resume.broadcastSuccessMessage}
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

export function ResumeWotsContent({
  activity,
  onClose,
  onSuccess,
}: ResumeWotsContentProps) {
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider =
    (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ??
    null;
  const connectedBtcAddress = btcConnector?.connectedWallet?.account?.address;

  // Starts true: useRunOnce auto-fires handleSubmit on mount, so the
  // first render must show processing — not a false-success banner from
  // `isComplete = !loading && !error`.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track mount for setState guards after the long async chain below.
  // The hosting modal can be closed mid-flight (PostDepositContinuationView
  // unmounts on user close), so the post-await setLoading/setError below
  // would otherwise warn about updates on an unmounted component.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Release the primed registry entry on unmount if activation didn't
  // happen (the normal release point in `useVaultActions`). Bounds
  // `authAnchorHex` lifetime when the user abandons the resume flow.
  const trackPrimedTxid = useReleaseVpTokenOnUnmount();

  const handleSubmit = useCallback(async () => {
    if (!btcWalletProvider || !connectedBtcAddress) {
      setError("BTC wallet is not connected");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    let root: Uint8Array | null = null;
    try {
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
      // depositorWotsPkHash, vault provider address) directly from the
      // registry. The activity row's providers[]/depositorBtcPubkey are
      // localStorage-backed and untrusted for routing decisions.
      const reader = getVaultRegistryReader();
      const { basic, protocol } = await reader.getVaultData(activity.id as Hex);
      const providerAddress = basic.vaultProvider;
      const depositorBtcPubkey = basic.depositorBtcPubKey;
      const htlcVout = protocol.htlcVout;
      const onChainWotsPkHash = protocol.depositorWotsPkHash;
      const onChainPrePeginTxHash = protocol.prePeginTxHash;

      // Best-effort priming: VP pubkey fetch can fail without blocking the
      // resume flow because submitWotsPublicKey re-derives on cache miss.
      const pinnedServerPubkeyPromise = reader
        .getVaultProviderBtcPubKey(providerAddress as Address)
        .catch((err: unknown) => {
          logger.warn("Failed to fetch VP pubkey for registry priming", {
            peginTxHash,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        });

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

      // Probe the wallet before deriveVaultRoot fires the signing popup. A
      // wallet that locked since the modal opened fails fast here with an
      // actionable error instead of a silent no-op (no popup appears).
      await verifyBtcWalletLiveness(btcWalletProvider, connectedBtcAddress, {
        probeConnection: shouldProbeWalletLiveness(
          btcConnector?.connectedWallet?.id,
        ),
      });

      root = await deriveVaultRoot(btcWalletProvider, {
        depositorBtcPubkey: hexToUint8Array(depositorBtcPubkey),
        fundingOutpoints,
      });

      // Reuse the derived root for the auth anchor so submitWotsPublicKey
      // doesn't trigger a second wallet popup.
      const authAnchorBytes = await expandAuthAnchor(root);
      const authAnchorHex = uint8ArrayToHex(authAnchorBytes);
      authAnchorBytes.fill(0);

      const seed = await expandWotsSeed(root, htlcVout);
      // Root is no longer needed; zero it before any unrelated awaits below
      // so a long-lived `root` doesn't sit in memory through the VP pubkey
      // fetch and submitWotsPublicKey call.
      root.fill(0);
      root = null;
      let wotsPublicKeys;
      try {
        wotsPublicKeys = await deriveWotsBlocksFromSeed(seed);
      } finally {
        seed.fill(0);
      }

      const computedHash = computeWotsBlockPublicKeysHash(wotsPublicKeys);
      if (computedHash.toLowerCase() !== onChainWotsPkHash.toLowerCase()) {
        throw new Error(COPY.deposit.resume.wotsMismatchError);
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

      if (mountedRef.current) {
        setLoading(false);
        // Refetch dashboard activities so the next action surfaces while
        // the modal stays parked on "Close & continue later".
        onSuccess();
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg =
          err instanceof Error ? err.message : "Failed to submit WOTS key";
        // VP-side mismatch gets the same wording as the local pre-flight
        // so the user can act on either path.
        if (isWotsMismatchError(err)) {
          setError(COPY.deposit.resume.wotsMismatchError);
        } else {
          setError(msg);
        }
        setLoading(false);
      }
    } finally {
      root?.fill(0);
    }
  }, [
    activity,
    btcWalletProvider,
    connectedBtcAddress,
    btcConnector?.connectedWallet?.id,
    trackPrimedTxid,
    onSuccess,
  ]);

  // Defensive auto-run gate. Today this is effectively always-enabled: the
  // connector exposes `connectedWallet` only after connect() completes, so
  // `provider` and `account.address` are set together — there is no
  // "provider present, address still hydrating" window. The gate is
  // belt-and-suspenders for a future connector that surfaces a still-connecting
  // wallet before its account hydrates: in that case useRunOnce (one-shot)
  // would defer rather than fire into the "not connected" guard. When there is
  // genuinely no provider it fires, so the real "not connected" error surfaces.
  useRunOnce(handleSubmit, !btcWalletProvider || Boolean(connectedBtcAddress));

  const isSuccess = !loading && !error;
  const renderStep = isSuccess
    ? DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS
    : DepositFlowStep.SUBMIT_WOTS_KEYS;
  const renderIsWaiting = isSuccess;
  const derived = computeDepositDerivedState(
    renderStep,
    loading,
    renderIsWaiting,
    error,
  );

  return (
    <DepositProgressView
      currentStep={renderStep}
      error={error}
      isComplete={derived.isComplete}
      isProcessing={derived.isProcessing}
      canClose={derived.canClose}
      canContinueInBackground={derived.canContinueInBackground}
      payoutSigningProgress={null}
      peginSigningProgress={null}
      onClose={onClose}
      onRetry={error ? handleSubmit : undefined}
      waitDetailPersistKey={activity.id}
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
  const connectedBtcAddress = btcConnector?.connectedWallet?.account?.address;

  // Starts true: useRunOnce auto-fires handleSubmit on mount, so the
  // first render must show processing.
  const [loading, setLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  // Track mount for setState guards after the long async chain below.
  // The hosting modal can be closed mid-flight, so the post-await
  // setLoading/setLocalError below would otherwise warn about updates on
  // an unmounted component.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const {
    activating,
    activated,
    error: activationError,
    handleActivation,
  } = useActivationState({
    activity,
    depositorEthAddress,
  });

  const handleSubmit = useCallback(async () => {
    if (!btcWalletProvider || !connectedBtcAddress) {
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

      // Probe the wallet before deriveVaultRoot fires the signing popup. A
      // wallet that locked since the modal opened fails fast here with an
      // actionable error instead of a silent no-op (no popup appears).
      await verifyBtcWalletLiveness(btcWalletProvider, connectedBtcAddress, {
        probeConnection: shouldProbeWalletLiveness(
          btcConnector?.connectedWallet?.id,
        ),
      });

      root = await deriveVaultRoot(btcWalletProvider, {
        depositorBtcPubkey: hexToUint8Array(depositorBtcPubkey),
        fundingOutpoints,
      });

      secretBytes = await expandHashlockSecret(root, htlcVout);
      const secretHex = uint8ArrayToHex(secretBytes);

      // Wipe before the unrelated `handleActivation` await — neither buffer
      // is needed past secretHex extraction. Keeps live secret material out
      // of memory while the activation state machine runs its on-chain calls.
      secretBytes.fill(0);
      secretBytes = null;
      root.fill(0);
      root = null;

      // Hand off to the existing activation state machine. It fetches
      // the canonical hashlock from the on-chain registry and rejects
      // any mismatch — wrong-wallet derivation surfaces as a structured
      // error there, not a silent submission.
      await handleActivation(secretHex);
    } catch (err) {
      if (mountedRef.current) {
        const msg =
          err instanceof Error ? err.message : "Failed to activate BTC Vault";
        setLocalError(msg);
      }
    } finally {
      // Memory wipes run regardless of mount: secret material must not
      // linger if the user closed the modal mid-flight.
      root?.fill(0);
      secretBytes?.fill(0);
      if (mountedRef.current) setLoading(false);
    }
  }, [
    activity,
    btcWalletProvider,
    connectedBtcAddress,
    btcConnector?.connectedWallet?.id,
    handleActivation,
  ]);

  // Defensive auto-run gate (effectively always-enabled today) — see the note
  // in ResumeWotsContent. Fires when no provider is present so the genuine
  // "not connected" error surfaces.
  useRunOnce(handleSubmit, !btcWalletProvider || Boolean(connectedBtcAddress));

  const error = localError ?? activationError;
  const renderStep = activated
    ? DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION
    : activating
      ? DepositFlowStep.ACTIVATE_VAULT
      : DepositFlowStep.RETRIEVE_SECRET;
  const derived = computeDepositDerivedState(
    renderStep,
    activating || loading,
    activated,
    error,
  );

  const handleDone = useCallback(() => {
    if (activated) {
      onSuccess();
    } else {
      onClose();
    }
  }, [activated, onSuccess, onClose]);

  return (
    <DepositProgressView
      currentStep={renderStep}
      error={error}
      isComplete={derived.isComplete}
      isProcessing={derived.isProcessing}
      canClose={derived.canClose}
      canContinueInBackground={derived.canContinueInBackground}
      payoutSigningProgress={null}
      peginSigningProgress={null}
      onClose={handleDone}
      successMessage={COPY.deposit.resume.activationSuccessMessage}
      onRetry={error ? handleSubmit : undefined}
      waitDetailPersistKey={activity.id}
    />
  );
}
