/**
 * Hook to manage the borrow more transaction flow
 *
 * Handles:
 * 1. Calling service layer for borrow more transaction
 * 2. Error handling and state management
 *
 * This borrows additional funds from an existing position without adding collateral.
 */

import { useState, useEffect, useCallback } from 'react';
import { borrowMoreFromPosition } from '../../../services/position/positionTransactionService';
import { CONTRACTS } from '../../../config/contracts';

interface UseBorrowMoreTransactionParams {
  marketId?: string;
  borrowAmount?: bigint;
  isOpen: boolean;
}

interface UseBorrowMoreTransactionResult {
  /** Whether transaction is in progress */
  isLoading: boolean;
  /** Error message if transaction failed */
  error: string | null;
  /** Execute the borrow more transaction */
  executeTransaction: () => Promise<void>;
  /** Reset state (called when modal closes) */
  reset: () => void;
}

export function useBorrowMoreTransaction({
  marketId,
  borrowAmount,
  isOpen,
}: UseBorrowMoreTransactionParams): UseBorrowMoreTransactionResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsLoading(false);
      setError(null);
    }
  }, [isOpen]);

  const executeTransaction = useCallback(async () => {
    if (!marketId) {
      const errorMsg = 'Missing market ID';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    if (!borrowAmount || borrowAmount === 0n) {
      const errorMsg = 'Missing or invalid borrow amount';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    setIsLoading(true);
    setError(null);

    try {
      // Execute borrow more transaction
      await borrowMoreFromPosition(
        CONTRACTS.VAULT_CONTROLLER,
        marketId,
        borrowAmount
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Transaction failed';
      setError(errorMsg);
      throw error; // Re-throw so modal can handle success/failure
    } finally {
      setIsLoading(false);
    }
  }, [marketId, borrowAmount]);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    executeTransaction,
    reset,
  };
}
