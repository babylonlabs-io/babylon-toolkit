/**
 * Hook for adding collateral to position and borrowing
 */

import { useState, useCallback } from 'react';
import { useChainConnector } from '@babylonlabs-io/wallet-connector';
import type { Hex } from 'viem';
import { addCollateralAndBorrowWithMarketId } from '../../../services/vault/vaultTransactionService';
import type { AddCollateralAndBorrowResult } from '../../../services/vault/vaultTransactionService';
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
  executeMintAndBorrow: (params: UseMintAndBorrowParams) => Promise<AddCollateralAndBorrowResult | null>;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Transaction result */
  result: AddCollateralAndBorrowResult | null;
  /** Reset state */
  reset: () => void;
}

/**
 * Hook to add collateral to position and borrow
 *
 * Gets BTC pubkey from connected wallet and calls addCollateralAndBorrowWithMarketId service
 * Creates position if it doesn't exist, or expands existing position
 */
export function useMintAndBorrow(): UseMintAndBorrowResult {
  const btcConnector = useChainConnector('BTC');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddCollateralAndBorrowResult | null>(null);

  const executeMintAndBorrow = useCallback(
    async ({ pegInTxHashes, borrowAmount, marketId }: UseMintAndBorrowParams) => {
      setIsLoading(true);
      setError(null);
      setResult(null);

      try {
        // Get BTC wallet public key from connected wallet provider
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connector = btcConnector as any;

        if (!connector?.connectedWallet?.provider) {
          throw new Error('BTC wallet not connected');
        }

        // Get public key from provider
        const publicKeyHex = await connector.connectedWallet.provider.getPublicKeyHex();

        // Convert to x-only pubkey (remove first byte coordinate, take next 32 bytes)
        const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');
        const publicKeyNoCoord = publicKeyBuffer.subarray(1, 33);
        const btcPubkey = `0x${publicKeyNoCoord.toString('hex')}` as Hex;

        // Convert market ID from hex string (without 0x) to proper format with 0x prefix
        const marketIdWithPrefix = marketId.startsWith('0x') ? marketId : `0x${marketId}`;

        // Call service to execute transaction with multiple vault IDs
        const txResult = await addCollateralAndBorrowWithMarketId(
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
    [btcConnector]
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
