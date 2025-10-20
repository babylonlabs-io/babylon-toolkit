/**
 * Hook to manage the full repay transaction flow
 *
 * Handles:
 * 1. Managing multi-step state (approving → repaying)
 * 2. Calling service layer for separate approve and repay transactions
 * 3. Error handling and state management
 */

import { useState, useEffect, useCallback } from 'react';
import type { Hex } from 'viem';
import { approveLoanTokenForRepay, withdrawCollateralAndRedeemBTCVault } from '../../../services/vault/vaultTransactionService';
import { Morpho, type MarketParams } from '../../../clients/eth-contract';
import { CONTRACTS } from '../../../config/contracts';

interface UseRepayTransactionParams {
  pegInTxHash?: Hex;
  repayAmountWei?: bigint;
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
  /** Execute the full repay transaction flow */
  executeTransaction: () => Promise<void>;
  /** Reset state (called when modal closes) */
  reset: () => void;
}

export function useRepayTransaction({
  pegInTxHash,
  repayAmountWei,
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
    if (!pegInTxHash || !repayAmountWei || !marketId) {
      setError('Missing required transaction data');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Approve loan token spending
      setCurrentStep(1);
      await approveLoanTokenForRepay(
        CONTRACTS.VAULT_CONTROLLER,
        repayAmountWei,
        marketId
      );

      // Step 2: Fetch market parameters
      const market = await Morpho.getMarketById(marketId);
      const marketParams: MarketParams = {
        loanToken: market.loanToken.address,
        collateralToken: market.collateralToken.address,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
      };

      // Step 3: Withdraw collateral and redeem BTC vault
      setCurrentStep(2);
      await withdrawCollateralAndRedeemBTCVault(
        CONTRACTS.VAULT_CONTROLLER,
        marketParams,
        repayAmountWei
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Transaction failed');
      setCurrentStep(0);
      throw error; // Re-throw so modal can handle success/failure
    } finally {
      setIsLoading(false);
    }
  }, [pegInTxHash, repayAmountWei, marketId]);

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
