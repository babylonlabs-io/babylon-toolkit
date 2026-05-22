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
import { ProgressBar } from "./ProgressBar";
import { ProviderWaitDetail } from "./ProviderWaitDetail";
import {
  buildStepItems,
  getStepFillPercent,
  getVisualStep,
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
    onRetry,
    btcConfirmationDetail,
    waitDetailPersistKey,
  } = props;

  // On completion, advance past the last row so every circle renders as ✓.
  const visualStep = isComplete
    ? TOTAL_VISUAL_STEPS + 1
    : getVisualStep(currentStep);
  const completedSteps = Math.max(
    0,
    Math.min(TOTAL_VISUAL_STEPS, visualStep - 1),
  );
  const showOverallProgress = completedSteps >= 1;

  const steps = useMemo(
    () => buildStepItems(payoutSigningProgress, peginSigningProgress),
    [payoutSigningProgress, peginSigningProgress],
  );

  const isProviderWaitStep =
    currentStep === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS ||
    currentStep === DepositFlowStep.AWAIT_VP_VERIFICATION ||
    currentStep === DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION;

  const activeStepDetail =
    currentStep === DepositFlowStep.AWAIT_BTC_CONFIRMATION &&
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
        {COPY.deposit.progress.heading}{" "}
        <Text as="span" variant="body1" className="text-accent-secondary">
          {COPY.deposit.progress.durationEstimate}
        </Text>
      </Heading>

      {showOverallProgress && (
        <div className="mt-3">
          <ProgressBar
            percent={isComplete ? 1 : getStepFillPercent(currentStep)}
          />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {showOverallProgress && (
          <CompletedStepsPill
            completed={completedSteps}
            total={TOTAL_VISUAL_STEPS}
          />
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

        <Button
          disabled={!canClose}
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
          ) : isComplete ? (
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
