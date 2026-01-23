import type { DaemonProgressState } from "@/hooks/deposit/useDepositFlow";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

import { SigningProgress } from "../PayoutSignModal/SigningProgress";

import { DepositStep } from "./constants";

interface StepProgressProps {
  currentStep: DepositStep;
  isWaiting: boolean;
  payoutSigningProgress: PayoutSigningProgress | null;
  daemonProgress?: DaemonProgressState | null;
}

/**
 * Renders the appropriate progress indicator based on current step and state.
 * Shows for SIGN_PAYOUTS, AWAIT_ACKS, and BROADCAST_BTC steps.
 */
export function StepProgress({
  currentStep,
  isWaiting,
  payoutSigningProgress,
  daemonProgress,
}: StepProgressProps) {
  const showProgress =
    currentStep === DepositStep.SIGN_PAYOUTS ||
    currentStep === DepositStep.AWAIT_ACKS ||
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
      daemonProgress={daemonProgress}
    />
  );
}
