/**
 * Hook for repaying loan and initiating pegout
 */

import { useState, useCallback } from 'react';
import type { Hex, Hash, TransactionReceipt } from 'viem';
import { repayAndPegout } from '../services/vault/vaultTransactionService';
import { CONTRACTS } from '../config/contracts';

export interface UseRepayAndPegoutParams {
  /** Pegin transaction hash (vault ID) */
  pegInTxHash: Hex;
}

export interface UseRepayAndPegoutResult {
  /** Execute the repay and pegout transaction */
  executeRepayAndPegout: (params: UseRepayAndPegoutParams) => Promise<{ transactionHash: Hash; receipt: TransactionReceipt } | null>;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Transaction hash */
  transactionHash: Hash | null;
  /** Reset state */
  reset: () => void;
}

/**
 * Hook to repay loan and initiate pegout
 *
 * IMPORTANT: This performs FULL repayment only.
 * Before calling, ensure USDC approval is done for the exact borrowAssets amount.
 */
export function useRepayAndPegout(): UseRepayAndPegoutResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<Hash | null>(null);

  const executeRepayAndPegout = useCallback(
    async ({ pegInTxHash }: UseRepayAndPegoutParams) => {
      setIsLoading(true);
      setError(null);
      setTransactionHash(null);

      try {
        // Call service to execute transaction
        const txResult = await repayAndPegout(
          CONTRACTS.VAULT_CONTROLLER,
          pegInTxHash
        );

        setTransactionHash(txResult.transactionHash);
        return txResult;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setTransactionHash(null);
  }, []);

  return {
    executeRepayAndPegout,
    isLoading,
    error,
    transactionHash,
    reset,
  };
}
