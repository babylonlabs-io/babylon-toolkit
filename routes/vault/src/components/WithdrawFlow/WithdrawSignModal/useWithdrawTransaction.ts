/**
 * Hook to manage the withdraw transaction flow
 *
 * Handles:
 * 1. Calling service layer for withdraw transaction
 * 2. Error handling and state management
 *
 * Note: Withdraws ALL collateral from position.
 * Position must have NO DEBT or this will revert.
 */

import { useState, useEffect, useCallback } from 'react';
import { getWalletClient } from '@wagmi/core';
import { getSharedWagmiConfig } from '@babylonlabs-io/wallet-connector';
import { getETHChain } from '@babylonlabs-io/config';
import { withdrawCollateralFromPosition } from '../../../services/position/positionTransactionService';
import { CONTRACTS } from '../../../config/contracts';

interface UseWithdrawTransactionParams {
  marketId?: string;
  isOpen: boolean;
}

interface UseWithdrawTransactionResult {
  /** Current step: 0 = not started, 1 = withdrawing */
  currentStep: 0 | 1;
  /** Whether transaction is in progress */
  isLoading: boolean;
  /** Error message if transaction failed */
  error: string | null;
  /** Execute the withdraw transaction */
  executeTransaction: () => Promise<void>;
  /** Reset state (called when modal closes) */
  reset: () => void;
}

export function useWithdrawTransaction({
  marketId,
  isOpen,
}: UseWithdrawTransactionParams): UseWithdrawTransactionResult {
  const [currentStep, setCurrentStep] = useState<0 | 1>(0);
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
    if (!marketId) {
      setError('Missing required transaction data');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get wallet client for signing
      const wagmiConfig = getSharedWagmiConfig();
      const chain = getETHChain();
      const walletClient = await getWalletClient(wagmiConfig, { chainId: chain.id });

      if (!walletClient) {
        throw new Error('Ethereum wallet not connected');
      }

      // Withdraw all collateral from position
      setCurrentStep(1);
      await withdrawCollateralFromPosition(
        walletClient,
        chain,
        CONTRACTS.VAULT_CONTROLLER,
        marketId
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Transaction failed');
      setCurrentStep(0);
      throw error; // Re-throw so modal can handle success/failure
    } finally {
      setIsLoading(false);
    }
  }, [marketId]);

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
