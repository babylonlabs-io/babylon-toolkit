/**
 * Hook for minting vaultBTC and borrowing against it
 */

import { useState, useCallback } from 'react';
import { useChainConnector } from '@babylonlabs-io/wallet-connector';
import type { Hex } from 'viem';
import { mintAndBorrowWithMarketId } from '../../../services/vault/vaultTransactionService';
import type { MintAndBorrowResult } from '../../../services/vault/vaultTransactionService';
import { CONTRACTS, MORPHO_MARKET_ID } from '../../../config/contracts';

export interface UseMintAndBorrowParams {
  /** Pegin transaction hash (vault ID) */
  pegInTxHash: Hex;
  /** Amount to borrow in USDC (with 6 decimals) */
  borrowAmount: bigint;
}

export interface UseMintAndBorrowResult {
  /** Execute the mint and borrow transaction */
  executeMintAndBorrow: (params: UseMintAndBorrowParams) => Promise<MintAndBorrowResult | null>;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Transaction result */
  result: MintAndBorrowResult | null;
  /** Reset state */
  reset: () => void;
}

/**
 * Hook to mint vaultBTC and borrow USDC
 *
 * Gets BTC pubkey from connected wallet and calls mintAndBorrowWithMarketId service
 */
export function useMintAndBorrow(): UseMintAndBorrowResult {
  const btcConnector = useChainConnector('BTC');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MintAndBorrowResult | null>(null);

  const executeMintAndBorrow = useCallback(
    async ({ pegInTxHash, borrowAmount }: UseMintAndBorrowParams) => {
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

        // Call service to execute transaction
        const txResult = await mintAndBorrowWithMarketId(
          CONTRACTS.VAULT_CONTROLLER,
          pegInTxHash,
          btcPubkey,
          MORPHO_MARKET_ID,
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
