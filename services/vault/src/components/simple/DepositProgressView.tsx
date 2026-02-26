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

import { DEPOSIT_SUCCESS_MESSAGE } from "@/components/deposit/DepositSignModal/constants";
import { StatusBanner } from "@/components/deposit/DepositSignModal/StatusBanner";
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

/**
 * Strategy-dependent step labels for the multi-vault deposit stepper.
 *
 * Hardcoded for exactly 2 vaults — this is by design. The partial-liquidation
 * feature always splits into 2 vaults so at most half the BTC is exposed to
 * a single liquidation event. The 2-vault cap is enforced in
 * validateVaultAmounts() and utxoAllocationService.
 *
 * With POP reuse, vault 2 skips the separate POP signing step — the POP
 * signature from vault 1 is reused automatically.
 *
 * SPLIT strategy (6 steps):
 *   1. Sign & broadcast split transaction
 *   2. Sign POP & submit pegin 1/2
 *   3. Submit pegin 2/2
 *   4. Sign payout transaction(s)
 *   5. Wait for confirmation
 *   6. Sign & broadcast Bitcoin transaction
 *
 * MULTI_INPUT strategy (5 steps):
 *   1. Sign POP & submit pegin 1/2
 *   2. Submit pegin 2/2
 *   3. Sign payout transaction(s)
 *   4. Wait for confirmation
 *   5. Sign & broadcast Bitcoin transaction
 */
const SPLIT_STEP_LABELS = [
  "Sign & broadcast split transaction",
  "Sign POP & submit pegin 1/2",
  "Submit pegin 2/2",
  "Sign payout transaction(s)",
  "Wait for confirmation",
  "Sign & broadcast Bitcoin transaction",
] as const;

const MULTI_INPUT_STEP_LABELS = [
  "Sign POP & submit pegin 1/2",
  "Submit pegin 2/2",
  "Sign payout transaction(s)",
  "Wait for confirmation",
  "Sign & broadcast Bitcoin transaction",
] as const;

export type MultiVaultStrategy = "SPLIT" | "MULTI_INPUT";

/**
 * Map the hook's (currentStep, currentVaultIndex, strategy) to a 1-indexed
 * visual step position for the multi-vault Stepper.
 *
 * SPLIT mapping (6 steps):
 *   SIGN_SPLIT_TX             -> visual 1
 *   SIGN_POP     + vault 0    -> visual 2
 *   SUBMIT_PEGIN + vault 0    -> visual 2 (same step: "Sign POP & submit")
 *   SUBMIT_PEGIN + vault 1    -> visual 3
 *   SIGN_PAYOUTS              -> visual 4
 *   BROADCAST_BTC (waiting)   -> visual 5
 *   BROADCAST_BTC (signing)   -> visual 6
 *   COMPLETED                 -> visual 7
 *
 * MULTI_INPUT mapping (5 steps):
 *   SIGN_POP     + vault 0    -> visual 1
 *   SUBMIT_PEGIN + vault 0    -> visual 1 (same step: "Sign POP & submit")
 *   SUBMIT_PEGIN + vault 1    -> visual 2
 *   SIGN_PAYOUTS              -> visual 3
 *   BROADCAST_BTC (waiting)   -> visual 4
 *   BROADCAST_BTC (signing)   -> visual 5
 *   COMPLETED                 -> visual 6
 */
function getMultiVaultVisualStep(
  currentStep: DepositFlowStep,
  currentVaultIndex: number | null,
  strategy: MultiVaultStrategy,
): number {
  const offset = strategy === "SPLIT" ? 1 : 0;

  switch (currentStep) {
    case DepositFlowStep.SIGN_SPLIT_TX:
      return 1; // Only for SPLIT
    case DepositFlowStep.SIGN_POP:
      return 1 + offset; // Vault 0 POP
    case DepositFlowStep.SUBMIT_PEGIN:
      // Vault 0 submit is combined with POP step; vault 1 is next step
      return currentVaultIndex === 1 ? 2 + offset : 1 + offset;
    case DepositFlowStep.SIGN_PAYOUTS:
      return 3 + offset;
    case DepositFlowStep.BROADCAST_BTC:
      return 5 + offset;
    case DepositFlowStep.COMPLETED:
      // Total steps + 1 to mark all complete
      return strategy === "SPLIT" ? 7 : 6;
    default:
      return 1;
  }
}

function buildMultiVaultSteps(strategy: MultiVaultStrategy): StepperItem[] {
  const labels =
    strategy === "SPLIT" ? SPLIT_STEP_LABELS : MULTI_INPUT_STEP_LABELS;
  return labels.map((label) => ({ label }));
}

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
  strategy: MultiVaultStrategy;
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

  const multiStrategy = isMulti ? props.strategy : null;

  const visualStep = isMulti
    ? getMultiVaultVisualStep(
        currentStep,
        props.currentVaultIndex,
        props.strategy,
      )
    : getVisualStep(currentStep, props.isWaiting);

  const steps = useMemo(
    () =>
      isMulti && multiStrategy
        ? buildMultiVaultSteps(multiStrategy)
        : buildStepItems(payoutSigningProgress),
    [isMulti, multiStrategy, payoutSigningProgress],
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
