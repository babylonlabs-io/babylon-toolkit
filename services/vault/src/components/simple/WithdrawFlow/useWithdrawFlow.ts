import { useCallback, useState } from "react";

export enum WithdrawStep {
  REVIEW = "review",
  PROGRESS = "progress",
}

export function useWithdrawFlow() {
  const [step, setStep] = useState(WithdrawStep.REVIEW);

  const goToReview = useCallback(() => setStep(WithdrawStep.REVIEW), []);
  const goToProgress = useCallback(() => setStep(WithdrawStep.PROGRESS), []);
  const reset = goToReview;

  return { step, goToReview, goToProgress, reset };
}
