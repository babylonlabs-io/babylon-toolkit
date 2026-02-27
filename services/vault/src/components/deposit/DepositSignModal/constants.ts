import FeatureFlags from "@/config/featureFlags";
import { DepositStep } from "@/hooks/deposit/depositFlowSteps";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

// Re-export for convenience
export { DepositStep };

/**
 * Step descriptions for deposit flow
 */
export const STEP_DESCRIPTIONS: Record<
  DepositStep,
  { active: string; waiting?: string }
> = {
  [DepositStep.SIGN_POP]: {
    active: "Please sign the proof of possession in your BTC wallet.",
  },
  [DepositStep.SUBMIT_PEGIN]: {
    active: "Please sign and submit the peg-in request in your ETH wallet.",
  },
  [DepositStep.SIGN_PAYOUTS]: {
    active: "Please sign the payout transaction(s) in your BTC wallet.",
    waiting: "Waiting for Vault Provider to prepare payout transaction(s)...",
  },
  [DepositStep.ARTIFACT_DOWNLOAD]: {
    active: "Download your vault artifacts before continuing.",
  },
  [DepositStep.BROADCAST_BTC]: {
    active:
      "Please sign and broadcast the Bitcoin transaction in your BTC wallet.",
    waiting: "Waiting for on-chain verification...",
  },
  [DepositStep.COMPLETED]: {
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
  const labels = [
    "Sign proof of possession",
    "Sign & submit peg-in request to Ethereum",
    "Sign payout transaction(s)",
  ];
  if (FeatureFlags.isDepositorAsClaimerEnabled) {
    labels.push("Download vault artifacts");
  }
  labels.push("Sign & broadcast Bitcoin transaction");
  return labels;
}

export function getTotalSteps(): number {
  return FeatureFlags.isDepositorAsClaimerEnabled ? 5 : 4;
}

/**
 * Get the description text for the current step
 */
export function getStepDescription(
  step: DepositStep,
  isWaiting: boolean,
  payoutProgress: PayoutSigningProgress | null,
): string {
  const desc = STEP_DESCRIPTIONS[step];
  if (!desc) return "";

  // Show detailed progress for payout signing step
  if (step === DepositStep.SIGN_PAYOUTS && payoutProgress?.currentStep) {
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
  currentStep: DepositStep,
  error: string | null,
  isWaiting: boolean = false,
): boolean {
  if (error) return true;
  if (currentStep === DepositStep.COMPLETED) return true;
  if (
    FeatureFlags.isDepositorAsClaimerEnabled &&
    currentStep === DepositStep.ARTIFACT_DOWNLOAD
  )
    return true;
  if (isWaiting && currentStep >= DepositStep.SIGN_PAYOUTS) return true;
  return false;
}
