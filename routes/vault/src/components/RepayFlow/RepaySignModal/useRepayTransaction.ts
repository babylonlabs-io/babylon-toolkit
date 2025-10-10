/**
 * Hook to manage the full repay transaction flow
 *
 * Handles:
 * 1. Fetching USDC token address from Morpho market
 * 2. Approving USDC spending with 1% buffer
 * 3. Executing repayAndPegout transaction
 * 4. Managing multi-step state and errors
 */

import { useState, useEffect, useCallback } from 'react';
import type { Hex } from 'viem';
import { ERC20, Morpho } from '../../../clients/eth-contract';
import { CONTRACTS, MORPHO_MARKET_ID } from '../../../config/contracts';
import { useRepayAndPegout } from '../../../hooks/useRepayAndPegout';

interface UseRepayTransactionParams {
  pegInTxHash?: Hex;
  repayAmountWei?: bigint;
  isOpen: boolean;
}

interface UseRepayTransactionResult {
  /** Current step: 0 = not started, 1 = approving, 2 = repaying */
  currentStep: 0 | 1 | 2;
  /** Whether transaction is in progress */
  isLoading: boolean;
  /** Error message if transaction failed */
  error: string | null;
  /** USDC token address (loaded from Morpho market) */
  usdcTokenAddress: Hex | null;
  /** Execute the full repay transaction flow */
  executeTransaction: () => Promise<void>;
  /** Reset state (called when modal closes) */
  reset: () => void;
}

export function useRepayTransaction({
  pegInTxHash,
  repayAmountWei,
  isOpen,
}: UseRepayTransactionParams): UseRepayTransactionResult {
  const [currentStep, setCurrentStep] = useState<0 | 1 | 2>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usdcTokenAddress, setUsdcTokenAddress] = useState<Hex | null>(null);

  const { executeRepayAndPegout } = useRepayAndPegout();

  // Fetch USDC token address when modal opens
  useEffect(() => {
    if (isOpen && pegInTxHash && !usdcTokenAddress) {
      const fetchUsdcAddress = async () => {
        try {
          const market = await Morpho.getMarketById(MORPHO_MARKET_ID);
          setUsdcTokenAddress(market.loanToken.address);
        } catch (error) {
          setError('Failed to load token information');
        }
      };
      fetchUsdcAddress();
    }
  }, [isOpen, pegInTxHash, usdcTokenAddress]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      setIsLoading(false);
      setError(null);
      setUsdcTokenAddress(null);
    }
  }, [isOpen]);

  const executeTransaction = useCallback(async () => {
    if (!pegInTxHash || !usdcTokenAddress || !repayAmountWei) {
      setError('Missing required transaction data');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Add 1% buffer to approval amount to account for interest accrual between approval and repay
      const approvalAmount = (repayAmountWei * 101n) / 100n;

      // Step 1: Approve USDC spending
      setCurrentStep(1);

      await ERC20.approveERC20(
        usdcTokenAddress,
        CONTRACTS.VAULT_CONTROLLER,
        approvalAmount
      );

      // Step 2: Repay and pegout
      setCurrentStep(2);

      const result = await executeRepayAndPegout({ pegInTxHash });

      if (!result) {
        throw new Error('Repay transaction failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Transaction failed');
      setCurrentStep(0);
      throw error; // Re-throw so modal can handle success/failure
    } finally {
      setIsLoading(false);
    }
  }, [pegInTxHash, usdcTokenAddress, repayAmountWei, executeRepayAndPegout]);

  const reset = useCallback(() => {
    setCurrentStep(0);
    setIsLoading(false);
    setError(null);
    setUsdcTokenAddress(null);
  }, []);

  return {
    currentStep,
    isLoading,
    error,
    usdcTokenAddress,
    executeTransaction,
    reset,
  };
}
