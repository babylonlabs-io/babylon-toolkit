/**
 * DepositProgressView
 *
 * Pure view component for the deposit progress stepper UI.
 * Supports both single-vault and multi-vault flows via a `variant` prop.
 *
 * Used by DepositSignContent (single), ResumeDepositContent (single),
 * and MultiVaultDepositSignContent (multi).
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

import {
  DEPOSIT_SUCCESS_MESSAGE,
} from "@/components/deposit/DepositSignModal/constants";
import { StatusBanner } from "@/components/deposit/DepositSignModal/StatusBanner";
import {
  getMultiVaultVisualStep,
  MULTI_VAULT_STEP_LABELS,
} from "@/components/deposit/MultiVaultDepositSignModal/constants";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

/**
 * Map the internal DepositFlowStep + isWaiting to a 1-indexed visual step (1-6).
 *
 * Visual steps:
 * 1. Sign proof of possession
 * 2. Submit peg-in requests
 * 3. Wait (~ 15 min)
 * 4. Sign payout transactions
 * 5. Wait (~ 12 mins)
 * 6. Submit peg-in transactions
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
    case DepositFlowStep.SIGN_PAYOUTS:
      return isWaiting ? 3 : 4;
    case DepositFlowStep.BROADCAST_BTC:
      return isWaiting ? 5 : 6;
    case DepositFlowStep.COMPLETED:
      return 7; // All 6 steps completed
    default:
      return 1;
  }
}

export function buildStepItems(
  progress: PayoutSigningProgress | null,
): StepperItem[] {
  const payoutTotal = progress?.total ?? 0;
  const payoutCompleted = progress?.completed ?? 0;

  return [
    { label: "Sign proof of possession" },
    { label: "Submit peg-in requests" },
    { label: "Wait", description: "(~ 15 min)" },
    {
      label: "Sign payout transactions",
      description:
        payoutTotal > 0 ? `(${payoutCompleted} of ${payoutTotal})` : undefined,
    },
    { label: "Wait", description: "(~ 12 mins)" },
    { label: "Submit peg-in transactions" },
  ];
}

const multiVaultSteps: StepperItem[] = MULTI_VAULT_STEP_LABELS.map((label) => ({
  label,
}));

// ---------------------------------------------------------------------------
// Props — discriminated union on `variant`
// ---------------------------------------------------------------------------

type SharedProps = {
  currentStep: DepositFlowStep;
  error: string | null;
  isComplete: boolean;
  isProcessing: boolean;
  canClose: boolean;
  canContinueInBackground: boolean;
  onClose: () => void;
  successMessage?: string;
};

type SingleVaultProps = SharedProps & {
  variant?: "single";
  isWaiting: boolean;
  payoutSigningProgress: PayoutSigningProgress | null;
  onRetry?: () => void;
};

type MultiVaultProps = SharedProps & {
  variant: "multi";
  currentVaultIndex: number | null;
};

export type DepositProgressViewProps = SingleVaultProps | MultiVaultProps;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DepositProgressView(props: DepositProgressViewProps) {
  const {
    currentStep,
    error,
    isComplete,
    isProcessing,
    canClose,
    canContinueInBackground,
    onClose,
    successMessage = DEPOSIT_SUCCESS_MESSAGE,
  } = props;

  const isMulti = props.variant === "multi";
  const payoutSigningProgress = isMulti ? null : props.payoutSigningProgress;

  const visualStep = isMulti
    ? getMultiVaultVisualStep(currentStep, props.currentVaultIndex)
    : getVisualStep(currentStep, props.isWaiting);

  const steps = useMemo(
    () => (isMulti ? multiVaultSteps : buildStepItems(payoutSigningProgress)),
    [isMulti, payoutSigningProgress],
  );

  const onRetry = !isMulti ? props.onRetry : undefined;
  const handleClick = error && onRetry ? onRetry : onClose;

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
          onClick={handleClick}
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
      </div>
    </div>
  );
}
