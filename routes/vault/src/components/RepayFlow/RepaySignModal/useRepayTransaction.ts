/**
 * Hook to manage the repay transaction flow
 *
 * Handles:
 * 1. Managing multi-step state (approving → repaying)
 * 2. Calling service layer for approve and repay transactions
 * 3. Error handling and state management
 *
 * Note: This only repays debt, it does NOT withdraw collateral.
 * After repaying, collateral remains in position and user can:
 * - Borrow again if needed
 * - Withdraw collateral separately (only when debt = 0)
 */

import { useState, useEffect, useCallback } from 'react';
import { approveLoanTokenForRepay, repayDebt } from '../../../services/position/positionTransactionService';
import { CONTRACTS } from '../../../config/contracts';

interface UseRepayTransactionParams {
  positionId?: string;
  marketId?: string;
  isOpen: boolean;
}

interface UseRepayTransactionResult {
  /** Current step: 0 = not started, 1 = approving, 2 = repaying */
  currentStep: 0 | 1 | 2;
  /** Whether transaction is in progress */
  isLoading: boolean;
  /** Error message if transaction failed */
  error: string | null;
  /** Execute the repay transaction flow */
  executeTransaction: () => Promise<void>;
  /** Reset state (called when modal closes) */
  reset: () => void;
}

export function useRepayTransaction({
  positionId,
  marketId,
  isOpen,
}: UseRepayTransactionParams): UseRepayTransactionResult {
  const [currentStep, setCurrentStep] = useState<0 | 1 | 2>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      setIsLoading(false);
      setError(null);
    }
  }, [isOpen]);

  const executeTransaction = useCallback(async () => {
    if (!positionId || !marketId) {
      setError('Missing required transaction data');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Approve loan token spending
      setCurrentStep(1);
      await approveLoanTokenForRepay(marketId);

      // Step 2: Repay all debt
      // This repays ALL debt including fees and interest
      setCurrentStep(2);
      await repayDebt(
        CONTRACTS.VAULT_CONTROLLER,
        positionId,
        marketId
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Transaction failed');
      setCurrentStep(0);
      throw error; // Re-throw so modal can handle success/failure
    } finally {
      setIsLoading(false);
    }
  }, [positionId, marketId]);

  const reset = useCallback(() => {
    setCurrentStep(0);
    setIsLoading(false);
    setError(null);
  }, []);

  return {
    currentStep,
    isLoading,
    error,
    executeTransaction,
    reset,
  };
}
