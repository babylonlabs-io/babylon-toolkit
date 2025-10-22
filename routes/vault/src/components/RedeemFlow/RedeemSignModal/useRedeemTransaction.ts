/**
 * Hook to manage the redeem transaction flow
 *
 * Handles:
 * 1. Calling service layer for redeem transaction
 * 2. Error handling and state management
 *
 * This redeems an available vault back to BTC (not for positions with debt).
 */

import { useState, useEffect, useCallback } from 'react';
import { redeemVault } from '../../../services/vault/vaultTransactionService';
import { CONTRACTS } from '../../../config/contracts';
import type { Hex } from 'viem';

interface UseRedeemTransactionParams {
  pegInTxHash?: Hex;
  isOpen: boolean;
}

interface UseRedeemTransactionResult {
  /** Whether transaction is in progress */
  isLoading: boolean;
  /** Error message if transaction failed */
  error: string | null;
  /** Execute the redeem transaction */
  executeTransaction: () => Promise<void>;
  /** Reset state (called when modal closes) */
  reset: () => void;
}

export function useRedeemTransaction({
  pegInTxHash,
  isOpen,
}: UseRedeemTransactionParams): UseRedeemTransactionResult {
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
    if (!pegInTxHash) {
      const errorMsg = 'Missing vault transaction hash';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    setIsLoading(true);
    setError(null);

    try {
      // Execute redeem transaction
      // The service layer will fetch vault provider's BTC key internally
      await redeemVault(
        CONTRACTS.VAULT_CONTROLLER,
        pegInTxHash
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Transaction failed';
      setError(errorMsg);
      throw error; // Re-throw so modal can handle success/failure
    } finally {
      setIsLoading(false);
    }
  }, [pegInTxHash]);

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
