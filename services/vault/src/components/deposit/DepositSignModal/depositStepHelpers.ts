import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

// Re-export for convenience
export { DepositFlowStep };

/**
 * Step descriptions for deposit flow
 */
export const STEP_DESCRIPTIONS: Partial<
  Record<DepositFlowStep, { active: string; waiting?: string }>
> = {
  [DepositFlowStep.SIGN_SPLIT_TX]: {
    active: "Please sign the split transaction in your BTC wallet.",
  },
  [DepositFlowStep.SIGN_POP]: {
    active: "Please sign the proof of possession in your BTC wallet.",
  },
  [DepositFlowStep.SUBMIT_PEGIN]: {
    active: "Please sign and submit the peg-in request in your ETH wallet.",
  },
  [DepositFlowStep.SIGN_PAYOUTS]: {
    active: "Please sign the payout transaction(s) in your BTC wallet.",
    waiting: "Waiting for Vault Provider to prepare payout transaction(s)...",
  },
  [DepositFlowStep.ARTIFACT_DOWNLOAD]: {
    active: "Download your vault artifacts before continuing.",
  },
  [DepositFlowStep.BROADCAST_BTC]: {
    active:
      "Please sign and broadcast the Bitcoin transaction in your BTC wallet.",
    waiting: "Waiting for on-chain verification...",
  },
  [DepositFlowStep.COMPLETED]: {
    active: "Deposit successfully submitted!",
  },
};

/**
 * Labels for signing step types
 */
export const SIGNING_STEP_LABELS: Record<string, string> = {
  payout_optimistic: "PayoutOptimistic",
  payout: "Payout",
};

/**
 * Step labels for the progress indicator
 */
export function getStepLabels(): string[] {
  return [
    "Sign proof of possession",
    "Sign & submit peg-in request to Ethereum",
    "Sign payout transaction(s)",
    "Download vault artifacts",
    "Sign & broadcast Bitcoin transaction",
  ];
}

export function getTotalSteps(): number {
  return 5;
}

/**
 * Get the description text for the current step
 */
export function getStepDescription(
  step: DepositFlowStep,
  isWaiting: boolean,
  payoutProgress: PayoutSigningProgress | null,
): string {
  const desc = STEP_DESCRIPTIONS[step];
  if (!desc) return "";

  // Show detailed progress for payout signing step
  if (step === DepositFlowStep.SIGN_PAYOUTS && payoutProgress?.currentStep) {
    const stepLabel = SIGNING_STEP_LABELS[payoutProgress.currentStep];
    const claimerInfo =
      payoutProgress.totalClaimers > 1
        ? ` (Claimer ${payoutProgress.currentClaimer}/${payoutProgress.totalClaimers})`
        : "";
    return `Signing ${stepLabel}${claimerInfo} — Step ${payoutProgress.completed + 1} of ${payoutProgress.total}`;
  }

  return isWaiting && desc.waiting ? desc.waiting : desc.active;
}

/**
 * Determine if the modal can be closed
 */
export function canCloseModal(
  currentStep: DepositFlowStep,
  error: string | null,
  isWaiting: boolean = false,
): boolean {
  if (error) return true;
  if (currentStep === DepositFlowStep.COMPLETED) return true;
  if (currentStep === DepositFlowStep.ARTIFACT_DOWNLOAD) return true;
  if (
    isWaiting &&
    (currentStep === DepositFlowStep.SIGN_PAYOUTS ||
      currentStep === DepositFlowStep.BROADCAST_BTC)
  )
    return true;
  return false;
}

/**
 * Default success message for deposit completion
 */
export const DEPOSIT_SUCCESS_MESSAGE =
  "Your Bitcoin transaction has been broadcast to the network. It will be confirmed after receiving the required number of Bitcoin confirmations.";

/**
 * Compute derived UI state from flow state.
 * Used by DepositSignContent and MultiVaultDepositSignContent.
 */
export function computeDepositDerivedState(
  currentStep: DepositFlowStep,
  processing: boolean,
  isWaiting: boolean,
  error: string | null,
) {
  const isComplete = currentStep === DepositFlowStep.COMPLETED;
  return {
    isComplete,
    canClose: canCloseModal(currentStep, error, isWaiting),
    isProcessing: (processing || isWaiting) && !error && !isComplete,
    canContinueInBackground:
      isWaiting && currentStep >= DepositFlowStep.SIGN_PAYOUTS && !error,
  };
}
