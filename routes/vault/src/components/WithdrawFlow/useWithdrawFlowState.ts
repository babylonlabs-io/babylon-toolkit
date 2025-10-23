/**
 * Hook to manage withdraw flow modal states
 */

import { useState, useCallback, useEffect } from 'react';

export type WithdrawFlowStep = 'sign' | 'success';

interface UseWithdrawFlowStateResult {
  currentStep: WithdrawFlowStep;
  goToSign: () => void;
  goToSuccess: () => void;
  reset: () => void;
}

export function useWithdrawFlowState(isOpen: boolean): UseWithdrawFlowStateResult {
  const [currentStep, setCurrentStep] = useState<WithdrawFlowStep>('sign');

  // Reset to initial step when modal is opened
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('sign');
    }
  }, [isOpen]);

  const goToSign = useCallback(() => {
    setCurrentStep('sign');
  }, []);

  const goToSuccess = useCallback(() => {
    setCurrentStep('success');
  }, []);

  const reset = useCallback(() => {
    setCurrentStep('sign');
  }, []);

  return {
    currentStep,
    goToSign,
    goToSuccess,
    reset,
  };
}
