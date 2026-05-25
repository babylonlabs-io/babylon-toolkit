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

import { Button, Heading, Loader, Text } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { StatusBanner } from "@/components/deposit/DepositSignModal/StatusBanner";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";
import type { PeginSigningProgress } from "@/services/vault/vaultTransactionService";

import { BtcConfirmationDetailContainer } from "./BtcConfirmationDetailContainer";
import { CompletedStepsPill } from "./CompletedStepsPill";
import { GroupedProgress } from "./GroupedProgress";
import { PeginFeeWarning } from "./PeginFeeWarning";
import { ProgressBar } from "./ProgressBar";
import { ProviderWaitDetail } from "./ProviderWaitDetail";
import {
  buildStepItems,
  getStepFillPercent,
  getVisualStep,
  STEP_GROUPS,
  TOTAL_VISUAL_STEPS,
} from "./steps";

export interface BtcConfirmationDetailData {
  /** Date.now() when the AWAIT_BTC_CONFIRMATION step was first entered. */
  startedAt: number;
  /** Pre-PegIn broadcast txid — the tx actually on the Bitcoin network. */
  prePeginTxid: string;
  /** Required confirmation depth, pinned to the deposit's registered version. */
  requiredDepth: number;
}

export interface DepositProgressViewProps {
  currentStep: DepositFlowStep;
  error: string | null;
  isComplete: boolean;
  isProcessing: boolean;
  canClose: boolean;
  canContinueInBackground: boolean;
  payoutSigningProgress: PayoutSigningProgress | null;
  /** Peg-in BTC signing progress; drives the (x of n) sub-counter for splits. */
  peginSigningProgress: PeginSigningProgress | null;
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
  /**
   * Data backing the expanded "Awaiting Bitcoin confirmation" detail panel.
   * Only rendered when the active step is AWAIT_BTC_CONFIRMATION.
   */
  btcConfirmationDetail?: BtcConfirmationDetailData | null;
  waitDetailPersistKey?: string;
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
    onClose,
    successMessage = COPY.deposit.progress.defaultSuccessMessage,
    terminalMessage,
    onRetry,
    btcConfirmationDetail,
    waitDetailPersistKey,
  } = props;

  // A terminal-but-not-final milestone: closeable success without marking the
  // whole flow complete (so the stepper keeps its real position).
  const isTerminalSuccess = !isComplete && !error && Boolean(terminalMessage);

  // On completion, advance past the last row so every circle renders as ✓.
  const visualStep = isComplete
    ? TOTAL_VISUAL_STEPS + 1
    : getVisualStep(currentStep);
  const completedSteps = Math.max(
    0,
    Math.min(TOTAL_VISUAL_STEPS, visualStep - 1),
  );
  const showOverallProgress = completedSteps >= 1;
  const completedGroups = STEP_GROUPS.filter(
    (group) => visualStep > group.endStep,
  ).length;
  const totalGroups = STEP_GROUPS.length;
  const showCompletedGroupsPill = completedGroups >= 1;

  const steps = useMemo(
    () => buildStepItems(payoutSigningProgress, peginSigningProgress),
    [payoutSigningProgress, peginSigningProgress],
  );

  const isProviderWaitStep =
    currentStep === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS ||
    currentStep === DepositFlowStep.AWAIT_VP_VERIFICATION ||
    currentStep === DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION;

  const activeStepDetail =
    currentStep === DepositFlowStep.SIGN_PEGIN_BTC ? (
      <PeginFeeWarning />
    ) : currentStep === DepositFlowStep.AWAIT_BTC_CONFIRMATION &&
      btcConfirmationDetail ? (
      <BtcConfirmationDetailContainer
        startedAt={btcConfirmationDetail.startedAt}
        prePeginTxid={btcConfirmationDetail.prePeginTxid}
        requiredDepth={btcConfirmationDetail.requiredDepth}
      />
    ) : isProviderWaitStep ? (
      <ProviderWaitDetail
        step={currentStep}
        persistKey={waitDetailPersistKey}
      />
    ) : null;

  return (
    <div className="w-full max-w-[520px]">
      <Heading variant="h5" className="text-accent-primary">
        {COPY.deposit.progress.heading}
      </Heading>

      {showOverallProgress && (
        <div className="mt-3">
          <ProgressBar
            percent={isComplete ? 1 : getStepFillPercent(currentStep)}
          />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {showCompletedGroupsPill && (
          <CompletedStepsPill completed={completedGroups} total={totalGroups} />
        )}

        <GroupedProgress
          steps={steps}
          currentStep={visualStep}
          activeStepDetail={activeStepDetail}
        />

        {error && <StatusBanner variant="error">{error}</StatusBanner>}

        {isComplete && (
          <StatusBanner variant="success">{successMessage}</StatusBanner>
        )}

        {isTerminalSuccess && (
          <StatusBanner variant="success">{terminalMessage}</StatusBanner>
        )}

        <Button
          disabled={!canClose && !isTerminalSuccess}
          variant="contained"
          color="secondary"
          className="w-full"
          onClick={error && onRetry ? onRetry : onClose}
        >
          {canContinueInBackground ? (
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
              <Text as="span" variant="body2" className="text-accent-contrast">
                {COPY.deposit.progress.buttons.sign}
              </Text>
            </span>
          ) : (
            COPY.deposit.progress.buttons.sign
          )}
        </Button>

        <Text
          variant="body2"
          className="text-center text-xs text-accent-secondary"
        >
          {COPY.deposit.progress.doNotSpendWarning}
        </Text>
      </div>
    </div>
  );
}
