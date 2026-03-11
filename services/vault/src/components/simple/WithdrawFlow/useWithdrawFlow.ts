import { useCallback, useState } from "react";

export enum WithdrawStep {
  SELECT = "select",
  REVIEW = "review",
  PROGRESS = "progress",
}

export function useWithdrawFlow() {
  const [step, setStep] = useState(WithdrawStep.SELECT);

  const goToReview = useCallback(() => setStep(WithdrawStep.REVIEW), []);
  const goToProgress = useCallback(() => setStep(WithdrawStep.PROGRESS), []);
  const reset = useCallback(() => setStep(WithdrawStep.SELECT), []);

  return { step, goToReview, goToProgress, reset };
}
