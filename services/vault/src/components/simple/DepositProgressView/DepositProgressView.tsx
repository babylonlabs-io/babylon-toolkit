/**
 * DepositProgressView
 *
 * View component for the deposit progress stepper UI. Used by every BTC-signing
 * flow: the initial deposit (DepositSignContent), the resume/broadcast and
 * payout-signing flows, and the post-deposit continuation. Because all of these
 * require the BTC wallet, it self-sources the wallet-lock state and surfaces an
 * unlock notice — the page-level affordances sit behind the full-screen dialog
 * this view always renders inside.
 *
 * Renders: Heading, progress bar (post-sign), grouped step progress, status
 * banners (including a silent-lock notice), action button.
 */

import {
  Button,
  Callout,
  Loader,
  LockIcon,
  Text,
} from "@babylonlabs-io/core-ui";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { NotificationPermissionPrompt } from "@/components/shared/NotificationPermissionPrompt";
import { useBTCWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";
import { useBtcWalletUnlock } from "@/hooks/useBtcWalletUnlock";
import { useLedgerVaultDevice } from "@/hooks/useLedgerVaultDevice";
import { logger } from "@/infrastructure";
import type { RegistrationDepthProgress } from "@/services/vault/ethConfirmationGate";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";
import type { PeginSigningProgress } from "@/services/vault/vaultTransactionService";
import {
  type DepositErrorContent,
  isDeviceDisconnectedContent,
} from "@/utils/errors";

import { BtcConfirmationDetailContainer } from "./BtcConfirmationDetailContainer";
import { CompletedStepsPill } from "./CompletedStepsPill";
import { DepositCardShell } from "./DepositCardShell";
import { DeviceAppWaitDetail } from "./DeviceAppWaitDetail";
import { EthConfirmationDetail } from "./EthConfirmationDetail";
import { GroupedProgress } from "./GroupedProgress";
import { LedgerHint } from "./LedgerHint";
import { PeginFeeWarning } from "./PeginFeeWarning";
import { ProgressBar } from "./ProgressBar";
import { ProviderWaitDetail } from "./ProviderWaitDetail";
import { SplitGroupedProgress } from "./SplitGroupedProgress";
import {
  buildStepItems,
  getStepFillPercent,
  getVisualStep,
  STEP_GROUPS,
  TOTAL_VISUAL_STEPS,
} from "./steps";

/** How long the copy button reports its outcome before reverting. */
const COPY_RESET_MS = 2000;

const DIAGNOSTICS_COPY_LABELS = {
  idle: COPY.deposit.errors.copyDiagnostics,
  copied: COPY.deposit.errors.diagnosticsCopied,
  failed: COPY.deposit.errors.diagnosticsCopyFailed,
} as const;

export interface BtcConfirmationDetailData {
  /** Pre-PegIn broadcast txid — the tx actually on the Bitcoin network. */
  prePeginTxid: string;
  /** Required confirmation depth, pinned to the deposit's registered version. */
  requiredDepth: number;
  /**
   * Candidate deposit ids that share this Pre-PegIn broadcast. The
   * confirmation panel reads coalesced counts from the dashboard's polling
   * cache using any indexed id; multi-vault siblings can index out of order
   * so we pass the whole batch instead of a single id.
   */
  depositIds: readonly string[];
}

export interface DepositProgressViewProps {
  currentStep: DepositFlowStep;
  error: DepositErrorContent | null;
  isComplete: boolean;
  isProcessing: boolean;
  canClose: boolean;
  canContinueInBackground: boolean;
  payoutSigningProgress: PayoutSigningProgress | null;
  /** Peg-in BTC signing progress; drives the (x of n) sub-counter for splits. */
  peginSigningProgress: PeginSigningProgress | null;
  /**
   * Number of vaults in this deposit. When > 1, the post-trunk groups render
   * as one stacked lane per vault to reflect the per-vault VP-paced
   * timelines.
   */
  vaultCount?: number;
  /**
   * Which vault is currently being processed for per-vault phases (WOTS,
   * payout signing, artifact download). `null` when not in a per-vault phase
   * or when the deposit isn't split.
   */
  currentVaultIndex?: number | null;
  /**
   * Per-vault raw steps for a split deposit, indexed to match the lanes.
   * Supplied when the caller has a stronger per-lane source of truth: the
   * initial live flow tracks explicit per-vault outcomes, and resume flows use
   * polling. Omit only for strictly sequential happy-path inference.
   */
  perVaultSteps?: DepositFlowStep[];
  onClose: () => void;
  /** Override the default success message */
  successMessage?: string;
  /**
   * Terminal success message shown at the *current* (non-final) step — used
   * when the deposit has reached a stable, closeable milestone that is not the
   * end of the whole flow (e.g. "ready to activate" after payout signing).
   * Unlike `isComplete`, this does not advance the stepper to 100%; it renders
   * a success banner and a "Done" button while keeping the step position.
   */
  terminalMessage?: string | null;
  /** Override the default error retry handler (defaults to onClose) */
  onRetry?: () => void;
  /** False while the flow has not been started yet (pre-sign entry state). Defaults to true so existing callers are unaffected. */
  started?: boolean;
  /** Begins the deposit flow. Required only when `started` can be false. */
  onSign?: () => void;
  /**
   * Data backing the expanded "Awaiting Bitcoin tx confirmations" detail
   * panel. Rendered while the active step is AWAIT_PAYOUT_TRANSACTIONS —
   * that is where the `minPrepeginDepth` (e.g. 12) wait actually happens,
   * gating the VP's PendingPrePegInConfirmations → PendingDepositorSignatures
   * transition. Step AWAIT_BTC_CONFIRMATION only requires 1 confirmation
   * (hardcoded VP requirement, not a protocol param) so no counter is shown
   * there.
   */
  btcConfirmationDetail?: BtcConfirmationDetailData | null;
  /**
   * Live Ethereum confirmation depth, rendered under the active SUBMIT_PEGIN
   * step while the finality gate holds the flow between the ETH registration
   * receipt and the Pre-PegIn broadcast. `null`/omitted outside that window —
   * without it, step 4 would sit on a bare spinner for ~1.6 min with no
   * explanation.
   */
  ethConfirmationDetail?: RegistrationDepthProgress | null;
  /**
   * Hint rendered under the active SUBMIT_WOTS_KEYS step. Resume passes it
   * because its cold path fires a wallet approval the step copy doesn't
   * mention — and some extensions queue that approval without a popup.
   */
  wotsApprovalHint?: string | null;
  /**
   * The deposit's registered offchain-params version. Keeps the header's
   * total-duration estimate on the same pinned confirmation depth the flow
   * gates on. Omit pre-sign (no registered version yet) → latest params.
   */
  offchainParamsVersion?: number;
  /**
   * True while an in-flight device signing ceremony can be cancelled
   * (capability-probed by the caller; only the Ledger provider supports it).
   * Defaults false so every other flow renders exactly as before.
   */
  canCancelSigning?: boolean;
  /**
   * True after the user requested a cancel and the sign has not settled yet —
   * the device settles the in-flight signature only once the user acts on it,
   * so the UI parks on a disabled button plus a finish-on-device notice.
   */
  cancelSigningRequested?: boolean;
  /** Requests cancellation of the in-flight device signing ceremony. */
  onCancelSigning?: () => void;
  /**
   * Inline fee-rate panel for the pre-sign entry state (`!started`). Rendered
   * inside the "Register deposit" card, under the Pre-PegIn step whose
   * transaction the rate pays for.
   */
  preSignFeeSelector?: ReactNode;
  /** Disables the pre-sign entry CTA (e.g. an invalid custom fee rate). */
  signDisabled?: boolean;
  /**
   * A pause the depositor ends with a click — the Ledger activation split
   *: the secret is retrieved on the Babylon Vault app, then the flow
   * waits here for the depositor to open the Ethereum app. `hint` renders
   * under the active step and `ctaLabel` becomes the enabled footer action.
   */
  continuePrompt?: {
    hint: string;
    ctaLabel: string;
    onContinue: () => void;
  } | null;
  /**
   * Called when the depositor cancels a held device-app wait from this view,
   * alongside ending the wait on the provider, so the owning flow can treat
   * the resulting rejection as a stop.
   */
  onAppWaitCanceled?: () => void;
}

/** Wallet-specific inputs to the active-step panel; `null` for non-Ledger wallets. */
interface LedgerStepContext {
  /** The app a held device operation waits for, or `null` when none is held. */
  awaitingAppName: string | null;
}

/** Identity of an error's content, for state that must follow the error, not its object. */
function errorContentKey(error: DepositErrorContent): string {
  const body = typeof error.body === "string" ? error.body : "";
  return [error.title, body, error.diagnostics ?? ""].join("\u0000");
}

/**
 * Resolves the panel shown under the active step. `AWAIT_PAYOUT_TRANSACTIONS`
 * gets the live confirmation-depth counter when the inputs are plumbed
 * (active flow always; resume paths once they reach step 8). When they're
 * absent, falls back to the generic provider-wait panel so the user still
 * sees something under the step.
 */
function resolveActiveStepDetail(params: {
  currentStep: DepositFlowStep;
  btcConfirmationDetail: BtcConfirmationDetailData | null | undefined;
  ethConfirmationDetail?: RegistrationDepthProgress | null;
  wotsApprovalHint?: string | null;
  /**
   * In split layouts, whether this lane is the vault the flow is currently
   * driving. The WOTS hint only belongs under that vault — sibling lanes
   * parked on the same step are not awaiting this modal's wallet approval.
   */
  isActiveVault?: boolean;
  /** Ledger device context; `null` for every other wallet. */
  ledger: LedgerStepContext | null;
  /** Hint of an active {@link DepositProgressViewProps.continuePrompt}. */
  continueHint?: string | null;
}): ReactNode {
  const {
    currentStep,
    btcConfirmationDetail,
    ethConfirmationDetail,
    wotsApprovalHint,
    isActiveVault,
    ledger,
    continueHint,
  } = params;
  // A held device operation belongs to the lane the flow is driving, and
  // outranks every other panel: nothing else moves until the app is open.
  if (ledger?.awaitingAppName && isActiveVault !== false) {
    return (
      <DeviceAppWaitDetail
        appName={ledger.awaitingAppName}
        showReapproveNotice={
          currentStep === DepositFlowStep.BROADCAST_PRE_PEGIN
        }
      />
    );
  }
  if (continueHint && isActiveVault !== false) {
    return <LedgerHint>{continueHint}</LedgerHint>;
  }
  if (currentStep === DepositFlowStep.SIGN_PEGIN_BTC) {
    return <PeginFeeWarning />;
  }
  // Only while the gate is actually holding. Step 4 also covers the wallet
  // popup and the receipt wait, which have nothing to count yet.
  if (currentStep === DepositFlowStep.SUBMIT_PEGIN && ethConfirmationDetail) {
    return (
      <>
        <EthConfirmationDetail
          confirmations={ethConfirmationDetail.confirmations}
          required={ethConfirmationDetail.required}
        />
        {ledger && (
          <LedgerHint>{COPY.deposit.ledger.switchBackHint}</LedgerHint>
        )}
      </>
    );
  }
  // The registration's wallet popup: on a shared Ledger it needs the
  // Ethereum app, which the dApp cannot see, so the hint is conditional.
  if (currentStep === DepositFlowStep.SUBMIT_PEGIN && ledger) {
    return <LedgerHint>{COPY.deposit.ledger.ethAppHint}</LedgerHint>;
  }
  // The Pre-PegIn sign may need the deposit approved again: switching apps
  // clears it, and the broadcast then re-runs the approval on the device.
  if (currentStep === DepositFlowStep.BROADCAST_PRE_PEGIN && ledger) {
    return <LedgerHint>{COPY.deposit.ledger.reapproveNotice}</LedgerHint>;
  }
  if (currentStep === DepositFlowStep.AWAIT_BTC_CONFIRMATION && ledger) {
    return <LedgerHint>{COPY.deposit.ledger.longWait}</LedgerHint>;
  }
  if (
    currentStep === DepositFlowStep.SUBMIT_WOTS_KEYS &&
    wotsApprovalHint &&
    isActiveVault !== false
  ) {
    return (
      <Text as="p" variant="body2" className="mt-3 text-accent-secondary">
        {wotsApprovalHint}
      </Text>
    );
  }
  if (
    currentStep === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS &&
    btcConfirmationDetail
  ) {
    return (
      <>
        <BtcConfirmationDetailContainer
          prePeginTxid={btcConfirmationDetail.prePeginTxid}
          requiredDepth={btcConfirmationDetail.requiredDepth}
          depositIds={btcConfirmationDetail.depositIds}
        />
        {ledger && <LedgerHint>{COPY.deposit.ledger.longWait}</LedgerHint>}
      </>
    );
  }
  const isProviderWait =
    currentStep === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS ||
    currentStep === DepositFlowStep.AWAIT_VP_VERIFICATION ||
    currentStep === DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION;
  if (!isProviderWait) return null;
  // The long provider waits come back to a Bitcoin signature (or, for the
  // activation confirmation, to nothing) — only those two need the note.
  const showLongWaitHint =
    ledger !== null &&
    currentStep !== DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION;
  return (
    <>
      <ProviderWaitDetail step={currentStep} />
      {showLongWaitHint && (
        <LedgerHint>{COPY.deposit.ledger.longWait}</LedgerHint>
      )}
    </>
  );
}

export function DepositProgressView(props: DepositProgressViewProps) {
  const {
    currentStep,
    error,
    isComplete,
    isProcessing,
    canClose,
    canContinueInBackground,
    payoutSigningProgress,
    peginSigningProgress,
    vaultCount = 1,
    currentVaultIndex = null,
    perVaultSteps,
    onClose,
    successMessage = COPY.deposit.progress.defaultSuccessMessage,
    terminalMessage,
    onRetry,
    btcConfirmationDetail,
    ethConfirmationDetail,
    wotsApprovalHint,
    offchainParamsVersion,
    started = true,
    onSign,
    canCancelSigning = false,
    cancelSigningRequested = false,
    onCancelSigning,
    preSignFeeSelector,
    signDisabled = false,
    continuePrompt = null,
    onAppWaitCanceled,
  } = props;

  // Every flow that renders this view requires the BTC wallet, so surface a
  // silent lock here (as a Callout) regardless of which flow —
  // deposit, resume/broadcast, payout signing, or continuation — mounted it.
  const { locked: walletLocked } = useBTCWallet();
  const { unlock, isUnlocking } = useBtcWalletUnlock(
    "Wallet unlock from deposit progress",
  );
  const ledgerDevice = useLedgerVaultDevice();
  const [isReconnecting, setIsReconnecting] = useState(false);
  // The error a failed reconnect was attempted against, by content: the
  // notice belongs to that error only, so a later, different error opens
  // without it. Content, not identity — the payout view rebuilds its error
  // object on every render.
  const [reconnectFailedFor, setReconnectFailedFor] = useState<string | null>(
    null,
  );
  const errorKey = error ? errorContentKey(error) : null;

  // Copy state is local rather than core-ui's `useCopy`, which flips to
  // "copied" optimistically and swallows a rejected write. This button exists
  // so a reporter can paste the error — telling them it copied when the
  // clipboard refused (denied permission, insecure context) is the one failure
  // that would defeat it.
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  const handleCopyDiagnostics = useCallback((diagnostics: string) => {
    const settle = (state: "copied" | "failed") => {
      setCopyState(state);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(
        () => setCopyState("idle"),
        COPY_RESET_MS,
      );
    };
    try {
      // Called synchronously so the write stays inside the click's user
      // activation; `navigator.clipboard` is undefined outside a secure
      // context, which throws here rather than rejecting.
      void navigator.clipboard.writeText(diagnostics).then(
        () => settle("copied"),
        () => settle("failed"),
      );
    } catch {
      settle("failed");
    }
  }, []);

  // A terminal-but-not-final milestone: closeable success without marking the
  // whole flow complete (so the stepper keeps its real position).
  const isTerminalSuccess = !isComplete && !error && Boolean(terminalMessage);

  // At the pre-sign entry (`!started`) a silently locked wallet can't sign, so
  // the primary CTA becomes an unlock action (matching the navbar and deposit
  // form) instead of starting a flow that would only stall at the signing call.
  const showUnlockCta = !started && walletLocked;

  // A device operation held for the user to open the vault app. The provider
  // reports it for every wallet that implements the affordance, so it needs no
  // Ledger check of its own.
  const awaitingAppName =
    started &&
    !error &&
    !isComplete &&
    !isTerminalSuccess &&
    ledgerDevice.appWait.status === "awaiting-app"
      ? ledgerDevice.appWait.expectedAppName
      : null;
  const showCancelAppWait = awaitingAppName !== null && !showUnlockCta;

  // Cancel affordance only while a device sign is actually in flight; when
  // false (every non-Ledger flow) the button behaves exactly as before.
  const showCancelSigning =
    started &&
    !showUnlockCta &&
    !showCancelAppWait &&
    isProcessing &&
    canCancelSigning &&
    !error &&
    !isComplete &&
    !isTerminalSuccess &&
    onCancelSigning !== undefined;

  const showContinuePrompt =
    started &&
    !showUnlockCta &&
    !showCancelAppWait &&
    continuePrompt !== null &&
    !error &&
    !isComplete &&
    !isTerminalSuccess;

  // A lost device session recovers through a reconnect: the WebHID picker
  // needs this click's user gesture, so the reconnect runs here rather than
  // inside the retried flow. Offered with or without a retry — before the
  // registration there is nothing to resume, so the reconnect closes the
  // modal and the depositor starts again with a live device.
  const showReconnect =
    started && error !== null && isDeviceDisconnectedContent(error);

  const handleReconnect = useCallback(async () => {
    setIsReconnecting(true);
    setReconnectFailedFor(null);
    try {
      await ledgerDevice.reconnect();
    } catch (reconnectError) {
      // The button stays available: a dismissed picker or a device showing
      // the wrong app is an ordinary outcome the depositor can fix and retry.
      logger.warn("Ledger reconnect from the deposit progress failed", {
        reason:
          reconnectError instanceof Error
            ? reconnectError.message
            : String(reconnectError),
      });
      setReconnectFailedFor(errorKey);
      return;
    } finally {
      setIsReconnecting(false);
    }
    (onRetry ?? onClose)();
  }, [ledgerDevice, errorKey, onRetry, onClose]);

  const handleCancelAppWait = useCallback(() => {
    onAppWaitCanceled?.();
    ledgerDevice.cancelAppWait();
  }, [onAppWaitCanceled, ledgerDevice]);

  // On completion, advance past the last row so every circle renders as ✓.
  // The pre-entry state (`!started`) keeps the REAL step: work already done
  // must still read as done — a WOTS re-offer enters here with the whole
  // "Register deposit" group genuinely complete, and pinning 0 would show a
  // confirmed deposit as zero progress. What pre-entry suppresses is how the
  // CURRENT step reads (see buildStepGroups): no group expands — per-lane
  // on the split path, where sibling lanes keep their polled expansion — and
  // a current group with none of its own work done reads not-started, so
  // nothing spins or announces progress while the flow idles awaiting the
  // click. Flows entering at step 1 have nothing completed, so they render
  // as no bar and no pill — just the group owning the Pre-PegIn step, opened
  // to carry the fee selector on its one relevant row (see GroupBlock).
  const visualStep = isComplete
    ? TOTAL_VISUAL_STEPS + 1
    : getVisualStep(currentStep);
  // `currentStep` is the active action, but split deposits can have each vault
  // lane land on a different step after a recoverable per-vault failure. The
  // aggregate progress bar and completed-group pill must therefore use the
  // slowest lane, while the split lanes below keep rendering their own steps.
  const aggregateRawStep =
    vaultCount > 1 && perVaultSteps && perVaultSteps.length > 0
      ? perVaultSteps.reduce((minStep, step) =>
          getVisualStep(step) < getVisualStep(minStep) ? step : minStep,
        )
      : currentStep;
  const aggregateVisualStep = isComplete
    ? TOTAL_VISUAL_STEPS + 1
    : getVisualStep(aggregateRawStep);
  const completedSteps = Math.max(
    0,
    Math.min(TOTAL_VISUAL_STEPS, aggregateVisualStep - 1),
  );
  const showOverallProgress = completedSteps >= 1;
  const completedGroups = STEP_GROUPS.filter(
    (group) => aggregateVisualStep > group.endStep,
  ).length;
  const totalGroups = STEP_GROUPS.length;
  const showCompletedGroupsPill = completedGroups >= 1;

  const isLedgerVault = ledgerDevice.isLedgerVault;
  const steps = useMemo(
    () =>
      buildStepItems(payoutSigningProgress, peginSigningProgress, {
        isLedgerVault,
      }),
    [payoutSigningProgress, peginSigningProgress, isLedgerVault],
  );

  const ledgerStepContext = useMemo<LedgerStepContext | null>(
    () =>
      isLedgerVault || awaitingAppName !== null ? { awaitingAppName } : null,
    [isLedgerVault, awaitingAppName],
  );
  const continueHint = showContinuePrompt ? continuePrompt?.hint : null;

  const activeStepDetail = resolveActiveStepDetail({
    currentStep,
    btcConfirmationDetail,
    ethConfirmationDetail,
    wotsApprovalHint,
    ledger: ledgerStepContext,
    continueHint,
  });

  // Split lanes resolve the detail from each lane's OWN step (so two
  // lanes parked on the same shared wait both show the panel, and diverged
  // lanes each show their own). The single-vault path uses the
  // `activeStepDetail` resolved above.
  const renderStepDetail = useCallback(
    (step: DepositFlowStep, opts?: { isActiveVault?: boolean }): ReactNode =>
      resolveActiveStepDetail({
        currentStep: step,
        btcConfirmationDetail,
        ethConfirmationDetail,
        wotsApprovalHint,
        isActiveVault: opts?.isActiveVault,
        ledger: ledgerStepContext,
        continueHint,
      }),
    [
      btcConfirmationDetail,
      ethConfirmationDetail,
      wotsApprovalHint,
      ledgerStepContext,
      continueHint,
    ],
  );

  return (
    <DepositCardShell
      offchainParamsVersion={offchainParamsVersion}
      progressBar={
        showOverallProgress ? (
          <ProgressBar
            percent={isComplete ? 1 : getStepFillPercent(aggregateRawStep)}
            color="rgb(var(--success-bright))"
          />
        ) : undefined
      }
      footer={
        // Callouts live here (not in the scrollable body) so error/success
        // banners stay pinned above the CTA, always visible.
        <div className="flex flex-col gap-4">
          {walletLocked && !isComplete && !isTerminalSuccess && (
            <Callout
              variant="accent"
              role="alert"
              icon={<LockIcon size={24} color="text-accent-contrast" />}
              title={COPY.wallet.locked.title}
            >
              {COPY.wallet.locked.description}
            </Callout>
          )}

          {error && (
            <Callout
              variant="error"
              title={error.title}
              actions={
                error.diagnostics
                  ? [
                      {
                        label: DIAGNOSTICS_COPY_LABELS[copyState],
                        onClick: () =>
                          handleCopyDiagnostics(error.diagnostics ?? ""),
                        emphasis: "secondary",
                      },
                    ]
                  : undefined
              }
            >
              {error.body}
              {copyState === "failed" && error.diagnostics && (
                // Last resort when the clipboard is unavailable: the text has
                // to be on screen for "copy manually" to mean anything. Only
                // here, never in the default view.
                <pre className="mt-2 max-h-32 select-all overflow-auto whitespace-pre-wrap break-all rounded bg-primary-main/5 p-2 text-xs">
                  {error.diagnostics}
                </pre>
              )}
            </Callout>
          )}

          {showReconnect &&
            errorKey !== null &&
            reconnectFailedFor === errorKey && (
              <Callout variant="warning">
                {COPY.deposit.ledger.reconnectFailed}
              </Callout>
            )}

          {isComplete && <Callout variant="success">{successMessage}</Callout>}

          {isTerminalSuccess && (
            <Callout variant="success">{terminalMessage}</Callout>
          )}

          {showCancelSigning && cancelSigningRequested && (
            <Callout variant="info">
              {COPY.deposit.progress.cancelRequestedNotice}
            </Callout>
          )}

          <Button
            disabled={
              showUnlockCta
                ? isUnlocking
                : showCancelAppWait || showContinuePrompt
                  ? false
                  : showReconnect
                    ? isReconnecting
                    : showCancelSigning
                      ? cancelSigningRequested
                      : started
                        ? !canClose && !isTerminalSuccess
                        : signDisabled
            }
            variant="contained"
            color="secondary"
            className="w-full"
            onClick={
              showUnlockCta
                ? unlock
                : showCancelAppWait
                  ? handleCancelAppWait
                  : showContinuePrompt
                    ? continuePrompt?.onContinue
                    : showReconnect
                      ? handleReconnect
                      : showCancelSigning
                        ? onCancelSigning
                        : !started
                          ? onSign
                          : error && onRetry
                            ? onRetry
                            : onClose
            }
          >
            {showUnlockCta ? (
              isUnlocking ? (
                COPY.wallet.locked.unlocking
              ) : (
                COPY.wallet.locked.unlockButton
              )
            ) : !started ? (
              COPY.deposit.progress.buttons.signTransaction
            ) : showCancelAppWait ? (
              COPY.deposit.ledger.waitingForApp.cancel
            ) : showContinuePrompt ? (
              continuePrompt?.ctaLabel
            ) : showReconnect ? (
              COPY.deposit.ledger.reconnectButton
            ) : showCancelSigning ? (
              COPY.deposit.progress.buttons.cancelSigning
            ) : canContinueInBackground ? (
              COPY.deposit.progress.buttons.closeContinueLater
            ) : error ? (
              onRetry ? (
                COPY.deposit.progress.buttons.retry
              ) : (
                COPY.deposit.progress.buttons.close
              )
            ) : isComplete || isTerminalSuccess ? (
              COPY.deposit.progress.buttons.done
            ) : isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader size={16} className="text-accent-contrast" />
                <Text
                  as="span"
                  variant="body2"
                  className="text-accent-contrast"
                >
                  {COPY.deposit.progress.buttons.sign}
                </Text>
              </span>
            ) : (
              COPY.deposit.progress.buttons.sign
            )}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {showCompletedGroupsPill && (
          <CompletedStepsPill completed={completedGroups} total={totalGroups} />
        )}

        {vaultCount > 1 ? (
          <SplitGroupedProgress
            steps={steps}
            currentStep={visualStep}
            vaultCount={vaultCount}
            currentVaultIndex={currentVaultIndex}
            rawStep={currentStep}
            hasError={Boolean(error)}
            renderStepDetail={renderStepDetail}
            perVaultSteps={perVaultSteps}
            started={started}
            preSignDetail={started ? undefined : preSignFeeSelector}
          />
        ) : (
          <GroupedProgress
            steps={steps}
            currentStep={visualStep}
            activeStepDetail={activeStepDetail}
            hasError={Boolean(error)}
            started={started}
            preSignDetail={started ? undefined : preSignFeeSelector}
          />
        )}

        {/* Persist through errors: a retry still needs signing, so the nudge
            stays useful. Only a finished deposit (complete / terminal success)
            has no further signing to notify about. */}
        {!isComplete && !isTerminalSuccess && <NotificationPermissionPrompt />}
      </div>
    </DepositCardShell>
  );
}
