/**
 * DepositProgressView
 *
 * Pure view component for the deposit progress stepper UI.
 * Used by both the initial deposit flow (DepositSignContent) and
 * the resume flows (payout signing / broadcast from the deposits table).
 *
 * Renders: Heading, 6-step Stepper, status banners, action button.
 */

import {
  Button,
  Heading,
  Loader,
  Stepper,
  Text,
  type StepperItem,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { StatusBanner } from "@/components/deposit/DepositSignModal/StatusBanner";
import { DepositFlowStep } from "@/components/deposit/DepositSignModal/depositStepHelpers";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

/**
 * Map the internal DepositFlowStep + isWaiting to a 1-indexed visual step (1-9).
 *
 * Visual steps (must match buildStepItems order):
 * 1. Sign PoP                          (SIGN_POP)
 * 2. Sign peg-in tx                    (SUBMIT_PEGIN)
 * 3. Sign & broadcast to Bitcoin       (BROADCAST_PRE_PEGIN)
 * 4. Awaiting Bitcoin confirmation      (SIGN_PAYOUTS when isWaiting)
 * 5. Sign payout transactions          (SIGN_PAYOUTS when !isWaiting)
 * 6. Download vault artifacts           (ARTIFACT_DOWNLOAD)
 * 7. Awaiting vault verification       (ACTIVATE_VAULT when isWaiting)
 * 8. Activate vault on Ethereum        (ACTIVATE_VAULT when !isWaiting)
 * 9. (completed)                       (COMPLETED)
 */
export function getVisualStep(
  currentStep: DepositFlowStep,
  isWaiting: boolean,
): number {
  switch (currentStep) {
    case DepositFlowStep.SIGN_POP:
      return 1;
    case DepositFlowStep.SUBMIT_PEGIN:
      return 2;
    case DepositFlowStep.BROADCAST_PRE_PEGIN:
      return 3;
    case DepositFlowStep.SIGN_PAYOUTS:
      return isWaiting ? 4 : 5;
    case DepositFlowStep.ARTIFACT_DOWNLOAD:
      return 6;
    case DepositFlowStep.ACTIVATE_VAULT:
      return isWaiting ? 7 : 8;
    case DepositFlowStep.COMPLETED:
      return 9;
    default:
      return 1;
  }
}

export function buildStepItems(
  progress: PayoutSigningProgress | null,
): StepperItem[] {
  const payoutTotal = progress?.totalClaimers ?? 0;
  const payoutCompleted = progress?.completed ?? 0;

  return [
    { label: "Sign PoP" },
    { label: "Sign peg-in tx" },
    { label: "Sign & broadcast to Bitcoin" },
    { label: "Awaiting Bitcoin confirmation", description: "(~ 15 min)" },
    {
      label: "Sign payout transactions",
      description:
        payoutTotal > 0 ? `(${payoutCompleted} of ${payoutTotal})` : undefined,
    },
    { label: "Download vault artifacts" },
    { label: "Awaiting vault verification", description: "(~ 12 mins)" },
    { label: "Activate vault on Ethereum" },
  ];
}

interface BaseProgressViewProps {
  currentStep: DepositFlowStep;
  isWaiting: boolean;
  error: string | null;
  isComplete: boolean;
  isProcessing: boolean;
  canClose: boolean;
  canContinueInBackground: boolean;
  payoutSigningProgress: PayoutSigningProgress | null;
  onClose: () => void;
  /** Override the default success message */
  successMessage?: string;
  /** Override the default error retry handler (defaults to onClose) */
  onRetry?: () => void;
}

interface SingleVaultProps extends BaseProgressViewProps {
  variant?: "single";
}

interface MultiVaultProps extends BaseProgressViewProps {
  variant: "multi";
  currentVaultIndex: number | null;
}

export type DepositProgressViewProps = SingleVaultProps | MultiVaultProps;

const BATCH_STEPS = {
  SIGN_POP_SUBMIT_1: 1,
  SIGN_POP_SUBMIT_2: 2,
  BROADCAST: 3,
  WAIT_CONFIRMATION: 4,
  SIGN_PAYOUTS: 5,
  DOWNLOAD_ARTIFACTS: 6,
  WAIT_ACTIVATION: 7,
  ACTIVATE: 8,
};

/**
 * Map DepositFlowStep + vault index to a 1-indexed visual step for multi-vault.
 *
 * BATCH (8 steps): Sign PoP + Register 1/2 → Register 2/2 → Broadcast → Wait → Sign payouts → Download artifacts → Wait → Activate vault
 */
export function getMultiVaultVisualStep(
  currentStep: DepositFlowStep,
  isWaiting: boolean,
  currentVaultIndex: number | null,
): number {
  switch (currentStep) {
    case DepositFlowStep.SIGN_POP:
    case DepositFlowStep.SUBMIT_PEGIN:
      return (currentVaultIndex ?? 0) === 0
        ? BATCH_STEPS.SIGN_POP_SUBMIT_1
        : BATCH_STEPS.SIGN_POP_SUBMIT_2;
    case DepositFlowStep.BROADCAST_PRE_PEGIN:
      return BATCH_STEPS.BROADCAST;
    case DepositFlowStep.SIGN_PAYOUTS:
      return isWaiting
        ? BATCH_STEPS.WAIT_CONFIRMATION
        : BATCH_STEPS.SIGN_PAYOUTS;
    case DepositFlowStep.ARTIFACT_DOWNLOAD:
      return BATCH_STEPS.DOWNLOAD_ARTIFACTS;
    case DepositFlowStep.ACTIVATE_VAULT:
      return isWaiting ? BATCH_STEPS.WAIT_ACTIVATION : BATCH_STEPS.ACTIVATE;
    case DepositFlowStep.COMPLETED:
      return BATCH_STEPS.ACTIVATE + 1;
    default:
      return 1;
  }
}

export function buildMultiVaultStepItems(
  progress: PayoutSigningProgress | null,
): StepperItem[] {
  const payoutTotal = progress?.totalClaimers ?? 0;
  const payoutCompleted = progress?.completed ?? 0;

  const steps: StepperItem[] = [];

  steps.push(
    { label: "Sign PoP + Register 1/2" },
    { label: "Register 2/2" },
    { label: "Sign & broadcast to Bitcoin" },
    { label: "Awaiting Bitcoin confirmation", description: "(~ 15 min)" },
    {
      label: "Sign payout transactions",
      description:
        payoutTotal > 0 ? `(${payoutCompleted} of ${payoutTotal})` : undefined,
    },
    { label: "Download vault artifacts" },
    { label: "Awaiting vault verification", description: "(~ 12 mins)" },
    { label: "Activate vault on Ethereum" },
  );

  return steps;
}

export function DepositProgressView(props: DepositProgressViewProps) {
  const {
    currentStep,
    isWaiting,
    error,
    isComplete,
    isProcessing,
    canClose,
    canContinueInBackground,
    payoutSigningProgress,
    onClose,
    successMessage = "Your Bitcoin transaction has been broadcast to the network. It will be confirmed after receiving the required number of Bitcoin confirmations.",
    onRetry,
  } = props;

  const isMulti = props.variant === "multi";

  const visualStep = isMulti
    ? getMultiVaultVisualStep(currentStep, isWaiting, props.currentVaultIndex)
    : getVisualStep(currentStep, isWaiting);

  const steps = useMemo(
    () =>
      isMulti
        ? buildMultiVaultStepItems(payoutSigningProgress)
        : buildStepItems(payoutSigningProgress),
    [isMulti, payoutSigningProgress],
  );

  return (
    <div className="w-full max-w-[520px]">
      <Heading variant="h5" className="text-accent-primary">
        Deposit Progress
      </Heading>

      <div className="mt-6 flex flex-col gap-6">
        <Stepper steps={steps} currentStep={visualStep} />

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
            "Close & continue later"
          ) : error ? (
            onRetry ? (
              "Retry"
            ) : (
              "Close"
            )
          ) : isComplete ? (
            "Done"
          ) : isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader size={16} className="text-accent-contrast" />
              <Text as="span" variant="body2" className="text-accent-contrast">
                Sign
              </Text>
            </span>
          ) : (
            "Sign"
          )}
        </Button>

        <Text
          variant="body2"
          className="text-center text-xs text-accent-secondary"
        >
          Do not spend the Bitcoin used for this deposit until the transaction
          is confirmed on the network.
        </Text>
      </div>
    </div>
  );
}
