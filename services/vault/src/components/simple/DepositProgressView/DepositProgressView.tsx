/**
 * DepositProgressView
 *
 * Pure view component for the deposit progress stepper UI.
 * Used by both the initial deposit flow (DepositSignContent) and
 * the resume flows (payout signing / broadcast from the deposits table).
 *
 * Renders: Heading, progress bar (post-sign), grouped step progress, status
 * banners, action button.
 */

import { Button, Callout, Loader, Text } from "@babylonlabs-io/core-ui";
import { type ReactNode, useCallback, useMemo } from "react";

import { NotificationPermissionPrompt } from "@/components/shared/NotificationPermissionPrompt";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";
import type { PeginSigningProgress } from "@/services/vault/vaultTransactionService";
import type { DepositErrorContent } from "@/utils/errors";

import { BtcConfirmationDetailContainer } from "./BtcConfirmationDetailContainer";
import { CompletedStepsPill } from "./CompletedStepsPill";
import { DepositCardShell } from "./DepositCardShell";
import { GroupedProgress } from "./GroupedProgress";
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
   * as one column per vault to reflect the per-vault VP-paced timelines.
   */
  vaultCount?: number;
  /**
   * Which vault is currently being processed for per-vault phases (WOTS,
   * payout signing, artifact download). `null` when not in a per-vault phase
   * or when the deposit isn't split.
   */
  currentVaultIndex?: number | null;
  /**
   * Per-vault raw steps for a split deposit, indexed to match the columns.
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
  /** Stack the panel's rows — used for the narrow split-deposit columns. */
  stacked?: boolean;
}): ReactNode {
  const { currentStep, btcConfirmationDetail, stacked } = params;
  if (currentStep === DepositFlowStep.SIGN_PEGIN_BTC) {
    return <PeginFeeWarning />;
  }
  if (
    currentStep === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS &&
    btcConfirmationDetail
  ) {
    return (
      <BtcConfirmationDetailContainer
        prePeginTxid={btcConfirmationDetail.prePeginTxid}
        requiredDepth={btcConfirmationDetail.requiredDepth}
        depositIds={btcConfirmationDetail.depositIds}
        stacked={stacked}
      />
    );
  }
  const isProviderWait =
    currentStep === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS ||
    currentStep === DepositFlowStep.AWAIT_VP_VERIFICATION ||
    currentStep === DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION;
  return isProviderWait ? (
    <ProviderWaitDetail step={currentStep} stacked={stacked} />
  ) : null;
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
    started = true,
    onSign,
  } = props;

  // A terminal-but-not-final milestone: closeable success without marking the
  // whole flow complete (so the stepper keeps its real position).
  const isTerminalSuccess = !isComplete && !error && Boolean(terminalMessage);

  // On completion, advance past the last row so every circle renders as ✓.
  // Before the flow starts, pin visual step 0 so every group collapses and
  // nothing reads as completed.
  const visualStep = !started
    ? 0
    : isComplete
      ? TOTAL_VISUAL_STEPS + 1
      : getVisualStep(currentStep);
  // `currentStep` is the active action, but split deposits can have each vault
  // lane land on a different step after a recoverable per-vault failure. The
  // aggregate progress bar and completed-group pill must therefore use the
  // slowest lane, while the split columns below keep rendering their own steps.
  const aggregateRawStep =
    vaultCount > 1 && perVaultSteps && perVaultSteps.length > 0
      ? perVaultSteps.reduce((minStep, step) =>
          getVisualStep(step) < getVisualStep(minStep) ? step : minStep,
        )
      : currentStep;
  const aggregateVisualStep = !started
    ? 0
    : isComplete
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

  const steps = useMemo(
    () => buildStepItems(payoutSigningProgress, peginSigningProgress),
    [payoutSigningProgress, peginSigningProgress],
  );

  const activeStepDetail = resolveActiveStepDetail({
    currentStep,
    btcConfirmationDetail,
  });

  // Split columns resolve the detail from each column's OWN step (so two
  // columns parked on the same shared wait both show the panel, and diverged
  // columns each show their own). Rendered stacked because the columns are
  // narrow. The single-column path keeps the inline `activeStepDetail` above.
  const renderStepDetail = useCallback(
    (step: DepositFlowStep, opts: { stacked: boolean }): ReactNode =>
      resolveActiveStepDetail({
        currentStep: step,
        btcConfirmationDetail,
        stacked: opts.stacked,
      }),
    [btcConfirmationDetail],
  );

  return (
    <DepositCardShell
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
          {error && (
            <Callout variant="error" title={error.title}>
              {error.body}
            </Callout>
          )}

          {isComplete && <Callout variant="success">{successMessage}</Callout>}

          {isTerminalSuccess && (
            <Callout variant="success">{terminalMessage}</Callout>
          )}

          <Button
            disabled={started ? !canClose && !isTerminalSuccess : false}
            variant="contained"
            color="secondary"
            className="w-full"
            onClick={!started ? onSign : error && onRetry ? onRetry : onClose}
          >
            {!started ? (
              COPY.deposit.progress.buttons.signTransaction
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
      footnote={
        <Text
          variant="body2"
          className="text-center text-xs text-accent-secondary"
        >
          {COPY.deposit.progress.doNotSpendWarning}
        </Text>
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
          />
        ) : (
          <GroupedProgress
            steps={steps}
            currentStep={visualStep}
            activeStepDetail={activeStepDetail}
            hasError={Boolean(error)}
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
