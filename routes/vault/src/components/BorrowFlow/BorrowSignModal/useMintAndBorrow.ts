/**
 * Hook for adding collateral to position and borrowing
 */

import { useState, useCallback } from 'react';
import type { Hex } from 'viem';
import { addCollateralWithMarketId } from '../../../services/position/positionTransactionService';
import type { AddCollateralResult } from '../../../services/position/positionTransactionService';
import { getPeginRequest, getProviderBTCKey } from '../../../services/vault';
import { CONTRACTS } from '../../../config/contracts';

export interface UseMintAndBorrowParams {
  /** Array of pegin transaction hashes (vault IDs) to use as collateral */
  pegInTxHashes: Hex[];
  /** Amount to borrow in USDC (with 6 decimals) */
  borrowAmount: bigint;
  /** Market ID for the Morpho market (hex string without 0x prefix) */
  marketId: string;
}

export interface UseMintAndBorrowResult {
  /** Execute the add collateral and borrow transaction */
  executeMintAndBorrow: (params: UseMintAndBorrowParams) => Promise<AddCollateralResult | null>;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Transaction result */
  result: AddCollateralResult | null;
  /** Reset state */
  reset: () => void;
}

/**
 * Hook to add collateral to position and borrow
 *
 * Fetches BTC pubkey from the first pegin request (source of truth from on-chain data)
 * and calls addCollateralWithMarketId service with borrowAmount.
 * Creates position if it doesn't exist, or expands existing position.
 */
export function useMintAndBorrow(): UseMintAndBorrowResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddCollateralResult | null>(null);

  const executeMintAndBorrow = useCallback(
    async ({ pegInTxHashes, borrowAmount, marketId }: UseMintAndBorrowParams) => {
      setIsLoading(true);
      setError(null);
      setResult(null);

      try {
        if (!pegInTxHashes || pegInTxHashes.length === 0) {
          throw new Error('No pegin transaction hashes provided');
        }

        // Fetch the vault provider's BTC pubkey (on-chain source of truth)
        // Step 1: Get the pegin request to find the vault provider address
        // TODO: This is temporary to get 1st pegin request to find the vault provider address
        // There is an design issue which currently being discussed.
        const firstPeginRequest = await getPeginRequest(
          CONTRACTS.BTC_VAULTS_MANAGER,
          pegInTxHashes[0]
        );

        // Step 2: Get the vault provider's BTC public key from the providerBTCKeys mapping
        // This is the key used for the vault's BTC locking script
        const btcPubkey = await getProviderBTCKey(
          CONTRACTS.BTC_VAULTS_MANAGER,
          firstPeginRequest.vaultProvider
        );

        // Convert market ID from hex string (without 0x) to proper format with 0x prefix
        const marketIdWithPrefix = marketId.startsWith('0x') ? marketId : `0x${marketId}`;

        // Call service to execute transaction with multiple vault IDs and borrow
        const txResult = await addCollateralWithMarketId(
          CONTRACTS.VAULT_CONTROLLER,
          pegInTxHashes,
          btcPubkey,
          marketIdWithPrefix,
          borrowAmount
        );

        setResult(txResult);
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
    setResult(null);
  }, []);

  return {
    executeMintAndBorrow,
    isLoading,
    error,
    result,
    reset,
  };
}
