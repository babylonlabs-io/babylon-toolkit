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
import { ERC20, Morpho } from '../clients/eth-contract';
import { CONTRACTS, MORPHO_MARKET_ID } from '../config/contracts';
import { useRepayAndPegout } from './useRepayAndPegout';

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
          console.error('[useRepayTransaction] Failed to fetch USDC address:', error);
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

  // Log errors
  useEffect(() => {
    if (error) {
      console.error('[useRepayTransaction] Transaction error:', error);
    }
  }, [error]);

  const executeTransaction = useCallback(async () => {
    if (!pegInTxHash || !usdcTokenAddress || !repayAmountWei) {
      console.error('[useRepayTransaction] Missing required data:', {
        pegInTxHash,
        usdcTokenAddress,
        repayAmountWei,
      });
      setError('Missing required transaction data');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Add 1% buffer to approval amount to account for interest accrual between approval and repay
      const approvalAmount = (repayAmountWei * 101n) / 100n;

      // Step 1: Approve USDC spending
      console.log('[useRepayTransaction] Step 1: Approving USDC spending', {
        usdcTokenAddress,
        spender: CONTRACTS.VAULT_CONTROLLER,
        exactDebt: repayAmountWei.toString(),
        exactDebtFormatted: (Number(repayAmountWei) / 1_000_000).toFixed(2) + ' USDC',
        approvalAmount: approvalAmount.toString(),
        approvalAmountFormatted: (Number(approvalAmount) / 1_000_000).toFixed(2) + ' USDC',
        buffer: '1% buffer for interest accrual',
      });
      setCurrentStep(1);

      const approvalResult = await ERC20.approveERC20(
        usdcTokenAddress,
        CONTRACTS.VAULT_CONTROLLER,
        approvalAmount
      );

      console.log('[useRepayTransaction] USDC approval successful:', {
        txHash: approvalResult.transactionHash,
      });

      // Step 2: Repay and pegout
      console.log('[useRepayTransaction] Step 2: Repaying and initiating pegout', {
        pegInTxHash,
        vaultController: CONTRACTS.VAULT_CONTROLLER,
      });
      setCurrentStep(2);

      const result = await executeRepayAndPegout({ pegInTxHash });

      if (!result) {
        throw new Error('Repay transaction failed');
      }

      console.log('[useRepayTransaction] Repay successful:', result.transactionHash);
    } catch (error) {
      console.error('[useRepayTransaction] Transaction failed:', error);
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
