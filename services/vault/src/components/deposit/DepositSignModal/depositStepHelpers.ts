import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";

/**
 * Determine if the modal can be closed
 */
function canCloseModal(
  currentStep: DepositFlowStep,
  error: string | null,
  isWaiting: boolean = false,
): boolean {
  if (error) return true;
  if (currentStep === DepositFlowStep.COMPLETED) return true;
  // Artifact download is closeable when the user is actively reviewing
  // (no current wait) or while we're waiting for VP verification.
  if (currentStep === DepositFlowStep.ARTIFACT_DOWNLOAD) return true;
  if (
    isWaiting &&
    (currentStep === DepositFlowStep.AWAIT_BTC_CONFIRMATION ||
      currentStep === DepositFlowStep.SUBMIT_WOTS_KEYS ||
      currentStep === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS ||
      currentStep === DepositFlowStep.SIGN_AUTH_ANCHOR ||
      currentStep === DepositFlowStep.SIGN_PAYOUTS ||
      currentStep === DepositFlowStep.AWAIT_VP_VERIFICATION ||
      currentStep === DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION ||
      currentStep === DepositFlowStep.ACTIVATE_VAULT)
  )
    return true;
  return false;
}

/**
 * Compute derived UI state from flow state.
 * Used by DepositSignContent.
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
      isWaiting &&
      currentStep >= DepositFlowStep.AWAIT_BTC_CONFIRMATION &&
      !error,
  };
}
