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
import { BtcActionGate } from "@/components/Wallet/BtcActionGate";
import { computeDepositDerivedState } from "@/components/deposit/DepositSignModal/depositStepHelpers";
import { usePayoutSigningState } from "@/components/deposit/PayoutSignModal/usePayoutSigningState";
import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";
import {
  hasPayoutSignCancelRecord,
  hasWotsSubmissionRecord,
  markWotsSubmitted,
} from "@/context/deposit/optimisticDepositState";
import { COPY } from "@/copy";
import {
  DepositFlowStep,
  payoutSigningStep,
} from "@/hooks/deposit/depositFlowSteps";
import { submitWotsPublicKey } from "@/hooks/deposit/depositFlowSteps/wotsSubmission";
import { useActivationState } from "@/hooks/deposit/useActivationState";
import { useBroadcastState } from "@/hooks/deposit/useBroadcastState";
import { useReleaseVpTokenOnUnmount } from "@/hooks/deposit/useReleaseVpTokenOnUnmount";
import { useRequiredPrePeginDepth } from "@/hooks/deposit/useRequiredPrePeginDepth";
import { useSplitVaultProgress } from "@/hooks/deposit/useSplitVaultProgress";
import { useBtcAction } from "@/hooks/useBtcAction";
import { useRunOnce } from "@/hooks/useRunOnce";
import { logger } from "@/infrastructure";
import {
  captureFunnelFailure,
  TELEMETRY_STAGE,
} from "@/infrastructure/telemetryEvents";
import {
  ContractStatus,
  getPeginDisplayStep,
} from "@/models/peginStateMachine";
import { deriveHtlcSecretHex } from "@/services/vault/htlcSecretDerivation";
import { resolveVpAuthPinnedPubkey } from "@/services/vault/vpAuthPinnedPubkey";
import type { VaultActivity } from "@/types/activity";
import {
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "@/utils/btc";
import { mapDepositError } from "@/utils/errors";
import { getVpProxyUrl } from "@/utils/rpc";

import { DepositProgressView } from "./DepositProgressView";
import { VaultActivatedView } from "./VaultActivatedView";

/**
 * Caught-error state wrapper: keeps the typed error intact for the render-seam
 * `mapDepositError` call (flattening to `.message` loses wallet codes and
 * `cause` chains) while giving `unknown` well-defined truthiness in state.
 */
interface CaughtError {
  raw: unknown;
}

// ---------------------------------------------------------------------------
// Sign Payouts Content
// ---------------------------------------------------------------------------

export interface ResumeSignContentProps {
  activity: VaultActivity;
  btcPublicKey: string | undefined;
  autoStart?: boolean;
  depositorEthAddress: Hex;
  /** Vaults that share this Pre-PegIn. Defaults to the current vault. */
  siblingVaultIds?: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export function ResumeSignContent(props: ResumeSignContentProps) {
  const [lastWalletKey, setLastWalletKey] = useState(props.btcPublicKey);
  useEffect(() => {
    if (props.btcPublicKey) setLastWalletKey(props.btcPublicKey);
  }, [props.btcPublicKey]);
  // Keep the active flow and its cancel control mounted during a key read.
  // A new signing attempt still needs the current wallet key.
  const btcPublicKey = props.btcPublicKey ?? lastWalletKey;
  return (
    <BtcActionGate
      onClose={props.onClose}
      ready={!!props.btcPublicKey}
      autoStart={props.autoStart}
    >
      {btcPublicKey && (
        <ResumeSignContentConnected
          {...props}
          btcPublicKey={btcPublicKey}
          walletKeyReady={!!props.btcPublicKey}
        />
      )}
    </BtcActionGate>
  );
}

function ResumeSignContentConnected({
  activity,
  btcPublicKey,
  walletKeyReady,
  depositorEthAddress,
  siblingVaultIds,
  onClose,
  onSuccess,
}: ResumeSignContentProps & { btcPublicKey: string; walletKeyReady: boolean }) {
  const {
    signing,
    progress,
    error: signingError,
    errorTerminal,
    isComplete,
    handleSign,
    canCancel,
    cancelRequested,
    handleCancel,
  } = usePayoutSigningState({
    activity,
    btcPublicKey,
    walletKeyReady,
    depositorEthAddress,
    onSuccess,
  });
  const error = signing ? null : signingError;

  // Read once. A recorded cancel requires a new click before signing.
  const [wasCanceled] = useState(() => hasPayoutSignCancelRecord(activity.id));

  useRunOnce(handleSign, !wasCanceled && walletKeyReady);

  // A settled cancel has no error. Show Sign again so the user can retry.
  const [reofferAfterCancel, setReofferAfterCancel] = useState(wasCanceled);
  const sawCancelRequestRef = useRef(false);
  useEffect(() => {
    if (cancelRequested) {
      sawCancelRequestRef.current = true;
      return;
    }
    if (!sawCancelRequestRef.current || signing) return;
    // Offer Sign again only when cancel settles without an error or completion.
    sawCancelRequestRef.current = false;
    if (!error && !isComplete) setReofferAfterCancel(true);
  }, [cancelRequested, signing, error, isComplete]);

  const handleResign = useCallback(() => {
    if (!walletKeyReady) return;
    setReofferAfterCancel(false);
    void handleSign();
  }, [handleSign, walletKeyReady]);

  // Polling distinguishes a verified vault from an already active vault.
  const pollingResult = useDepositPollingResult(activity.id);
  const contractStatus = pollingResult?.peginState?.contractStatus;
  const verified = contractStatus === ContractStatus.VERIFIED;
  const active = contractStatus === ContractStatus.ACTIVE;
  const pastSigning = verified || active;
  // "Ready to activate" is a VERIFIED-only milestone; once ACTIVE the flow is
  // already complete and that message would be wrong.
  const readyToActivate = isComplete && verified;

  const renderStep = !isComplete
    ? payoutSigningStep(progress.phase)
    : active
      ? DepositFlowStep.COMPLETED
      : verified
        ? DepositFlowStep.RETRIEVE_SECRET
        : DepositFlowStep.AWAIT_VP_VERIFICATION;
  // Only "waiting" while the VP is still verifying; VERIFIED and ACTIVE are both
  // closeable terminals, not background waits.
  const renderIsWaiting = isComplete && !pastSigning;
  const derived = computeDepositDerivedState(
    renderStep,
    signing,
    renderIsWaiting,
    error != null,
  );

  const { vaultCount, currentVaultIndex, perVaultSteps } =
    useSplitVaultProgress(siblingVaultIds, activity.id, renderStep);

  return (
    <DepositProgressView
      currentStep={renderStep}
      offchainParamsVersion={activity.offchainParamsVersion}
      error={
        error
          ? {
              title: error.title,
              body: error.message,
              diagnostics: error.diagnostics,
            }
          : null
      }
      isComplete={derived.isComplete}
      isProcessing={derived.isProcessing}
      canClose={derived.canClose}
      canContinueInBackground={derived.canContinueInBackground}
      terminalMessage={
        readyToActivate ? COPY.deposit.resume.readyToActivateMessage : undefined
      }
      payoutSigningProgress={signing ? progress : null}
      peginSigningProgress={null}
      vaultCount={vaultCount}
      currentVaultIndex={currentVaultIndex}
      perVaultSteps={perVaultSteps}
      onClose={onClose}
      // A terminal refusal cannot succeed on Retry.
      onRetry={
        error && !errorTerminal && walletKeyReady ? handleSign : undefined
      }
      started={!reofferAfterCancel}
      onSign={walletKeyReady ? handleResign : undefined}
      canCancelSigning={canCancel}
      cancelSigningRequested={cancelRequested}
      onCancelSigning={handleCancel}
    />
  );
}

// ---------------------------------------------------------------------------
// Broadcast Pre-PegIn Content
// ---------------------------------------------------------------------------

export interface ResumeBroadcastContentProps {
  activity: VaultActivity;
  autoStart?: boolean;
  /**
   * Every vault ID sharing this Pre-PegIn transaction (batched pegin).
   * Includes `activity.id`. The broadcast confirms all of them.
   */
  batchVaultIds: string[];
  depositorEthAddress: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResumeBroadcastContent(props: ResumeBroadcastContentProps) {
  return (
    <BtcActionGate onClose={props.onClose} autoStart={props.autoStart}>
      <ResumeBroadcastContentConnected {...props} />
    </BtcActionGate>
  );
}

function ResumeBroadcastContentConnected({
  activity,
  batchVaultIds,
  depositorEthAddress,
  onClose,
  onSuccess,
}: ResumeBroadcastContentProps) {
  const { broadcasting, error, ethConfirmationDetail, handleBroadcast } =
    useBroadcastState({
      activity,
      batchVaultIds,
      depositorEthAddress,
      onSuccess,
    });

  // While the Ethereum finality gate holds, the honest step is the ETH
  // registration — it genuinely is not final yet — not the BTC broadcast the
  // user has not been asked to sign. Only ever true for a deposit registered
  // in the last ~1.6 min; every older resume renders the broadcast step
  // exactly as before.
  const step = ethConfirmationDetail
    ? DepositFlowStep.SUBMIT_PEGIN
    : DepositFlowStep.BROADCAST_PRE_PEGIN;

  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider = btcConnector?.connectedWallet?.provider;
  const connectedBtcAddress = btcConnector?.connectedWallet?.account?.address;

  // Wait for the address, or let the handler report a missing provider.
  useRunOnce(
    handleBroadcast,
    !btcWalletProvider || Boolean(connectedBtcAddress),
  );

  const derived = computeDepositDerivedState(
    step,
    broadcasting,
    false,
    error != null,
  );

  // During the trunk (broadcast) phase every sibling is at the same shared
  // step, so the active-vault index is irrelevant — what matters is that the
  // per-vault split UI lights up when the deposit is a split.
  const { vaultCount, currentVaultIndex, perVaultSteps } =
    useSplitVaultProgress(batchVaultIds, activity.id, step);

  return (
    <DepositProgressView
      currentStep={step}
      offchainParamsVersion={activity.offchainParamsVersion}
      error={error}
      isComplete={derived.isComplete}
      isProcessing={derived.isProcessing}
      canClose={derived.canClose}
      canContinueInBackground={derived.canContinueInBackground}
      payoutSigningProgress={null}
      peginSigningProgress={null}
      ethConfirmationDetail={ethConfirmationDetail}
      vaultCount={vaultCount}
      currentVaultIndex={currentVaultIndex}
      perVaultSteps={perVaultSteps}
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
  autoStart?: boolean;
  /** Sibling vault IDs sharing this Pre-PegIn (see ResumeSignContentProps). */
  siblingVaultIds?: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export function ResumeWotsContent(props: ResumeWotsContentProps) {
  return (
    <BtcActionGate onClose={props.onClose} autoStart={props.autoStart}>
      <ResumeWotsContentConnected {...props} />
    </BtcActionGate>
  );
}

function ResumeWotsContentConnected({
  activity,
  siblingVaultIds,
  onClose,
  onSuccess,
}: ResumeWotsContentProps) {
  const { requireBtcWallet } = useBtcAction();
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider =
    (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ??
    null;
  const connectedBtcAddress = btcConnector?.connectedWallet?.account?.address;

  // Read once. A prior submission requires a new click, even after its
  // suppression period ends or the user opens the action again.
  const [isReoffer] = useState(() => hasWotsSubmissionRecord(activity.id));

  // A repeat submission starts at the Sign button.
  const [started, setStarted] = useState(!isReoffer);

  // Show processing before the first automatic submission starts.
  const [loading, setLoading] = useState(!isReoffer);
  const [error, setError] = useState<CaughtError | null>(null);

  // Track mount for setState guards after the long async chain below.
  // The hosting modal can be closed mid-flight (PostDepositContinuationView
  // unmounts on user close), so the post-await setLoading/setError below
  // would otherwise warn about updates on an unmounted component.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true; // reset on remount (StrictMode setup→cleanup→setup)
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Release the primed registry entry on unmount if activation didn't
  // happen (the normal release point in `useVaultActions`). Bounds
  // `authAnchorHex` lifetime when the user abandons the resume flow.
  const trackPrimedTxid = useReleaseVpTokenOnUnmount();

  const handleSubmit = useCallback(async () => {
    if (!requireBtcWallet() || !btcWalletProvider || !connectedBtcAddress) {
      setError({ raw: COPY.deposit.resume.walletNotConnected });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    let root: Uint8Array | null = null;
    try {
      const peginTxHash = activity.peginTxHash ?? null;
      if (!peginTxHash) {
        throw new Error("Missing peg-in transaction hash");
      }
      if (!activity.unsignedPrePeginTx) {
        throw new Error(
          "Missing Pre-Pegin transaction; cannot recover WOTS seed inputs",
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
      const pinnedServerPubkeyPromise = resolveVpAuthPinnedPubkey(
        providerAddress as Address,
      ).catch((err: unknown) => {
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
          COPY.deposit.errors.hashMismatch(
            computedTxHash,
            onChainPrePeginTxHash,
          ),
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
          depositorBtcPubkey,
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

      // Recorded regardless of mount: the submission landed, so the dashboard
      // row must stop offering "Submit WOTS Key" even if the user already
      // closed this modal. The store is app-scoped, not tied to this tree.
      markWotsSubmitted(activity.id);

      if (mountedRef.current) {
        setLoading(false);
        // Refetch dashboard activities so the next action surfaces while
        // the modal stays parked on "You can close and come back later".
        onSuccess();
      }
    } catch (err) {
      // Capture regardless of mount — these resume flows have no abort signal,
      // so a real WOTS-submission / derivation-drift failure is worth knowing
      // even if the user has already closed the modal. Only the UI update below
      // is mount-gated. A mismatch is flagged for faceting.
      captureFunnelFailure(TELEMETRY_STAGE.ACTIVATION_WOTS, err, activity.id, {
        extra: { wotsMismatch: isWotsMismatchError(err) },
      });
      if (mountedRef.current) {
        // VP-side mismatch gets the same wording as the local pre-flight
        // so the user can act on either path.
        setError({
          raw: isWotsMismatchError(err)
            ? COPY.deposit.resume.wotsMismatchError
            : err,
        });
        setLoading(false);
      }
    } finally {
      root?.fill(0);
    }
  }, [
    activity,
    requireBtcWallet,
    btcWalletProvider,
    connectedBtcAddress,
    btcConnector?.connectedWallet?.id,
    trackPrimedTxid,
    onSuccess,
  ]);

  // Wait for the address, or let the handler report a missing provider.
  // A repeat submission requires handleStart.
  useRunOnce(
    handleSubmit,
    !isReoffer && (!btcWalletProvider || Boolean(connectedBtcAddress)),
  );

  const handleStart = useCallback(() => {
    setStarted(true);
    void handleSubmit();
  }, [handleSubmit]);

  // Reconcile the displayed step with the polled VP status instead of trusting
  // local `loading`/`error` alone. Without this the modal computes its step
  // purely from local state, so after the user signs the WOTS submission it
  // spins forever on SUBMIT_WOTS_KEYS (the local "waiting" has no terminal
  // condition) — disagreeing with the dashboard's reactive pending card.
  //
  // `pastWots` is the polled discriminator: the VP has provably accepted the
  // WOTS key and advanced once its display step moves past SUBMIT_WOTS_KEYS.
  // This is safe by construction — the VP can only be past WOTS once the
  // submission landed — so it never aborts a still-needed submit, and a re-run
  // `handleSubmit` is a no-op the VP ignores. It also overrides a hung local
  // submit so the modal never stalls on the WOTS spinner.
  const pollingResult = useDepositPollingResult(activity.id);
  const polledPeginState = pollingResult?.peginState;
  const polledStep = polledPeginState
    ? getPeginDisplayStep(polledPeginState)
    : null;
  const pastWots =
    polledStep !== null && polledStep > DepositFlowStep.SUBMIT_WOTS_KEYS;

  // Advance off the WOTS step once the local submit resolves OR the polled VP
  // status confirms acceptance. Then the modal sits on the next step as a
  // closeable background wait ("You can close and come back later"),
  // matching the other resume waits — no separate success banner needed.
  //
  // `started` gates the local half: a re-offer sits idle (not loading, no
  // error) until the user clicks, and without this that idle state would read
  // as "submit resolved" and skip the step entirely. `pastWots` is unguarded
  // — the VP confirming acceptance advances regardless of what this instance
  // did.
  const advanced = pastWots || (started && !loading && !error);
  const renderStep = advanced
    ? DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS
    : DepositFlowStep.SUBMIT_WOTS_KEYS;
  const derived = computeDepositDerivedState(
    renderStep,
    loading && !advanced,
    advanced,
    error != null,
  );

  const requiredDepth = useRequiredPrePeginDepth(
    activity.offchainParamsVersion,
  );
  const showBtcDepthPanel =
    renderStep === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS &&
    Boolean(activity.prePeginTxHash);
  const btcConfirmationDetail =
    showBtcDepthPanel && activity.prePeginTxHash
      ? {
          prePeginTxid: activity.prePeginTxHash,
          requiredDepth,
          depositIds: [activity.id],
        }
      : null;

  const { vaultCount, currentVaultIndex, perVaultSteps } =
    useSplitVaultProgress(siblingVaultIds, activity.id, renderStep);

  return (
    <DepositProgressView
      currentStep={renderStep}
      error={error ? mapDepositError(error.raw) : null}
      isComplete={derived.isComplete}
      isProcessing={derived.isProcessing}
      canClose={derived.canClose}
      canContinueInBackground={derived.canContinueInBackground}
      payoutSigningProgress={null}
      peginSigningProgress={null}
      vaultCount={vaultCount}
      currentVaultIndex={currentVaultIndex}
      perVaultSteps={perVaultSteps}
      onClose={onClose}
      onRetry={error ? handleSubmit : undefined}
      started={started}
      onSign={handleStart}
      btcConfirmationDetail={btcConfirmationDetail}
      wotsApprovalHint={COPY.deposit.resume.wotsWalletApprovalHint}
      offchainParamsVersion={activity.offchainParamsVersion}
    />
  );
}

// ---------------------------------------------------------------------------
// Activate Vault Content
// ---------------------------------------------------------------------------

export interface ResumeActivationContentProps {
  activity: VaultActivity;
  depositorEthAddress: string;
  /** Sibling vault IDs sharing this Pre-PegIn (see ResumeSignContentProps). */
  siblingVaultIds?: string[];
  onClose: () => void;
  /** Navigates to the dashboard; drives the activated success screen's CTA. */
  onGoToDashboard: () => void;
}

export function ResumeActivationContent(props: ResumeActivationContentProps) {
  return (
    <BtcActionGate onClose={props.onClose}>
      <ResumeActivationContentConnected {...props} />
    </BtcActionGate>
  );
}

function ResumeActivationContentConnected({
  activity,
  depositorEthAddress,
  siblingVaultIds,
  onClose,
  onGoToDashboard,
}: ResumeActivationContentProps) {
  const { requireBtcWallet } = useBtcAction();
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider =
    (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ??
    null;
  const connectedBtcAddress = btcConnector?.connectedWallet?.account?.address;

  // Starts true: useRunOnce auto-fires handleSubmit on mount, so the
  // first render must show processing.
  const [loading, setLoading] = useState(true);
  const [localError, setLocalError] = useState<CaughtError | null>(null);

  // Track mount for setState guards after the long async chain below.
  // The hosting modal can be closed mid-flight, so the post-await
  // setLoading/setLocalError below would otherwise warn about updates on
  // an unmounted component.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true; // reset on remount (StrictMode setup→cleanup→setup)
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const {
    activating,
    activated,
    error: activationError,
    errorTerminal,
    handleActivation,
  } = useActivationState({
    activity,
    depositorEthAddress,
  });

  const handleSubmit = useCallback(async () => {
    if (!requireBtcWallet() || !btcWalletProvider || !connectedBtcAddress) {
      setLocalError({
        raw: COPY.deposit.resume.walletNotConnected,
      });
      setLoading(false);
      return;
    }
    if (!activity.unsignedPrePeginTx) {
      setLocalError({
        raw: COPY.deposit.resume.secretRecoveryMissingPrePegin,
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    setLocalError(null);

    try {
      const secretHex = await deriveHtlcSecretHex({
        activity,
        btcWalletProvider,
        connectedBtcAddress,
        walletId: btcConnector?.connectedWallet?.id,
      });

      // Hand off to the existing activation state machine. It fetches
      // the canonical hashlock from the on-chain registry and rejects
      // any mismatch — wrong-wallet derivation surfaces as a structured
      // error there, not a silent submission.
      await handleActivation(secretHex);
    } catch (err) {
      // Capture regardless of mount (no abort signal on this flow). The error
      // message carries only tx hashes (regex-scrubbed) and derivation errors,
      // never secret bytes. Only the UI update below is mount-gated.
      captureFunnelFailure(TELEMETRY_STAGE.ACTIVATION_SECRET, err, activity.id);
      if (mountedRef.current) {
        setLocalError({ raw: err });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [
    activity,
    requireBtcWallet,
    btcWalletProvider,
    connectedBtcAddress,
    btcConnector?.connectedWallet?.id,
    handleActivation,
  ]);

  // Wait for the address, or let the handler report a missing provider.
  useRunOnce(handleSubmit, !btcWalletProvider || Boolean(connectedBtcAddress));

  const error: CaughtError | null =
    localError ?? (activationError != null ? { raw: activationError } : null);
  // Terminal only applies to the activation failure (deadline passed), never a
  // local pre-flight error — which localError would override via `??` above.
  const isTerminal = localError == null && errorTerminal;

  // Track the live contract status so an activation completed elsewhere
  // (another tab, a previous session) still lands on the success terminal
  // while this branch is mounted.
  const pollingResult = useDepositPollingResult(activity.id);
  const active =
    pollingResult?.peginState?.contractStatus === ContractStatus.ACTIVE;

  const renderStep = activating
    ? DepositFlowStep.ACTIVATE_VAULT
    : DepositFlowStep.RETRIEVE_SECRET;
  const derived = computeDepositDerivedState(
    renderStep,
    activating || loading,
    false,
    error != null,
  );

  const { vaultCount, currentVaultIndex, perVaultSteps } =
    useSplitVaultProgress(siblingVaultIds, activity.id, renderStep);

  // Terminal: once activation is submitted (optimistic CONFIRMED) or the
  // contract reports ACTIVE, show the activated success screen — never the
  // completed stepper. PostDepositContinuationView swaps to the same screen
  // when it re-selects on the polling update; this covers any window where
  // this branch is still mounted.
  if (activated || active) {
    return <VaultActivatedView onGoToDashboard={onGoToDashboard} />;
  }

  return (
    <DepositProgressView
      currentStep={renderStep}
      error={
        error
          ? isTerminal
            ? COPY.deposit.errors.activationDeadlinePassed
            : mapDepositError(error.raw)
          : null
      }
      isComplete={derived.isComplete}
      isProcessing={derived.isProcessing}
      canClose={derived.canClose}
      canContinueInBackground={derived.canContinueInBackground}
      payoutSigningProgress={null}
      peginSigningProgress={null}
      vaultCount={vaultCount}
      currentVaultIndex={currentVaultIndex}
      perVaultSteps={perVaultSteps}
      onClose={onClose}
      onRetry={error && !isTerminal ? handleSubmit : undefined}
      offchainParamsVersion={activity.offchainParamsVersion}
    />
  );
}
