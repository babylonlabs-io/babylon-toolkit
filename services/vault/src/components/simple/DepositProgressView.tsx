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
 * 1. Sign proof of possession          (SIGN_POP)
 * 2. Submit peg-in to Ethereum         (SUBMIT_PEGIN)
 * 3. Broadcast to Bitcoin              (BROADCAST_PRE_PEGIN)
 * 4. Wait (~ 15 min)                   (SIGN_PAYOUTS when isWaiting)
 * 5. Sign payout transactions          (SIGN_PAYOUTS when !isWaiting)
 * 6. Download vault artifacts           (ARTIFACT_DOWNLOAD)
 * 7. Wait (~ 12 mins)                  (ACTIVATE_VAULT when isWaiting)
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
    { label: "Sign peg-in input & proof of possession" },
    { label: "Submit peg-in to Ethereum" },
    { label: "Broadcast to Bitcoin" },
    { label: "Wait", description: "(~ 15 min)" },
    {
      label: "Sign payout transactions",
      description:
        payoutTotal > 0 ? `(${payoutCompleted} of ${payoutTotal})` : undefined,
    },
    { label: "Download vault artifacts" },
    { label: "Wait", description: "(~ 12 mins)" },
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
  strategy: "MULTI_INPUT" | "SPLIT";
}

export type DepositProgressViewProps = SingleVaultProps | MultiVaultProps;

const SPLIT_STEPS = {
  SIGN_SPLIT_TX: 1,
  SIGN_POP_SUBMIT_1: 2,
  SIGN_POP_SUBMIT_2: 3,
  BROADCAST: 4,
  WAIT_CONFIRMATION: 5,
  SIGN_PAYOUTS: 6,
  DOWNLOAD_ARTIFACTS: 7,
  WAIT_ACTIVATION: 8,
  ACTIVATE: 9,
};

const MULTI_INPUT_STEPS = {
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
 * Map DepositFlowStep + vault index + strategy to a 1-indexed visual step for multi-vault.
 *
 * SPLIT (9 steps):       Sign split TX → Sign PoP + Submit 1/2 → Submit 2/2 → Broadcast → Wait → Sign payouts → Download artifacts → Wait → Activate vault
 * MULTI_INPUT (8 steps): Sign PoP + Submit 1/2 → Submit 2/2 → Broadcast → Wait → Sign payouts → Download artifacts → Wait → Activate vault
 */
export function getMultiVaultVisualStep(
  currentStep: DepositFlowStep,
  isWaiting: boolean,
  currentVaultIndex: number | null,
  strategy: "MULTI_INPUT" | "SPLIT",
): number {
  const s = strategy === "SPLIT" ? SPLIT_STEPS : MULTI_INPUT_STEPS;

  switch (currentStep) {
    case DepositFlowStep.SIGN_SPLIT_TX:
      return SPLIT_STEPS.SIGN_SPLIT_TX;
    case DepositFlowStep.SIGN_POP:
    case DepositFlowStep.SUBMIT_PEGIN:
      return (currentVaultIndex ?? 0) === 0
        ? s.SIGN_POP_SUBMIT_1
        : s.SIGN_POP_SUBMIT_2;
    case DepositFlowStep.BROADCAST_PRE_PEGIN:
      return s.BROADCAST;
    case DepositFlowStep.SIGN_PAYOUTS:
      return isWaiting ? s.WAIT_CONFIRMATION : s.SIGN_PAYOUTS;
    case DepositFlowStep.ARTIFACT_DOWNLOAD:
      return s.DOWNLOAD_ARTIFACTS;
    case DepositFlowStep.ACTIVATE_VAULT:
      return isWaiting ? s.WAIT_ACTIVATION : s.ACTIVATE;
    case DepositFlowStep.COMPLETED:
      return s.ACTIVATE + 1;
    default:
      return 1;
  }
}

export function buildMultiVaultStepItems(
  strategy: "MULTI_INPUT" | "SPLIT",
  progress: PayoutSigningProgress | null,
): StepperItem[] {
  const payoutTotal = progress?.totalClaimers ?? 0;
  const payoutCompleted = progress?.completed ?? 0;

  const steps: StepperItem[] = [];

  if (strategy === "SPLIT") {
    steps.push({ label: "Sign split transaction" });
  }

  steps.push(
    { label: "Sign peg-in input, PoP + Submit 1/2" },
    { label: "Submit peg-in 2/2" },
    { label: "Broadcast to Bitcoin" },
    { label: "Wait", description: "(~ 15 min)" },
    {
      label: "Sign payout transactions",
      description:
        payoutTotal > 0 ? `(${payoutCompleted} of ${payoutTotal})` : undefined,
    },
    { label: "Download vault artifacts" },
    { label: "Wait", description: "(~ 12 mins)" },
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
  const strategy = isMulti ? props.strategy : null;

  const visualStep = isMulti
    ? getMultiVaultVisualStep(
        currentStep,
        isWaiting,
        props.currentVaultIndex,
        props.strategy,
      )
    : getVisualStep(currentStep, isWaiting);

  const steps = useMemo(
    () =>
      isMulti && strategy
        ? buildMultiVaultStepItems(strategy, payoutSigningProgress)
        : buildStepItems(payoutSigningProgress),
    [isMulti, strategy, payoutSigningProgress],
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
            "You can close and come back later"
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
