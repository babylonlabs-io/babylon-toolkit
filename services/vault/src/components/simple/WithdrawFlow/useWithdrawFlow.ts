import { useCallback, useState } from "react";

export enum WithdrawStep {
  REVIEW = "review",
  PROGRESS = "progress",
}

export function useWithdrawFlow() {
  const [step, setStep] = useState(WithdrawStep.REVIEW);

  const goToProgress = useCallback(() => setStep(WithdrawStep.PROGRESS), []);
  const reset = useCallback(() => setStep(WithdrawStep.REVIEW), []);

  return { step, goToProgress, reset };
}
