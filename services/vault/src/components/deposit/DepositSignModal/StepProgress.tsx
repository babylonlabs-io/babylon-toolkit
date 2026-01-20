import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

import { SigningProgress } from "../PayoutSignModal/SigningProgress";

import { DepositStep } from "./constants";

interface StepProgressProps {
  currentStep: DepositStep;
  isWaiting: boolean;
  payoutSigningProgress: PayoutSigningProgress | null;
}

/**
 * Renders the appropriate progress indicator based on current step and state.
 * Only shows for SIGN_PAYOUTS and BROADCAST_BTC steps.
 */
export function StepProgress({
  currentStep,
  isWaiting,
  payoutSigningProgress,
}: StepProgressProps) {
  const showProgress =
    currentStep === DepositStep.SIGN_PAYOUTS ||
    currentStep === DepositStep.BROADCAST_BTC;

  if (!showProgress) {
    return null;
  }

  return (
    <SigningProgress
      step={currentStep}
      isWaiting={isWaiting}
      completed={payoutSigningProgress?.completed ?? 0}
      total={payoutSigningProgress?.total ?? 0}
      currentStep={payoutSigningProgress?.currentStep ?? null}
      currentClaimer={payoutSigningProgress?.currentClaimer ?? 0}
      totalClaimers={payoutSigningProgress?.totalClaimers ?? 0}
    />
  );
}
