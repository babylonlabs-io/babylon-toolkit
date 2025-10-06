/**
 * Pegin Service - Business logic layer
 *
 * Orchestrates pegin request operations and transformations.
 * This layer sits between React hooks and low-level clients.
 */

import type { Address, Hex } from 'viem';
import { BTCVaultsManager, VaultController, Morpho, Oracle } from '../../clients/eth-contract';
import type { PeginRequest, MorphoUserPosition, MorphoMarketSummary } from '../../clients/eth-contract';

/**
 * Pegin request with transaction hash
 */
export interface PeginRequestWithTxHash {
  /** The pegin request data */
  peginRequest: PeginRequest;
  /** Transaction hash */
  txHash: Hex;
}

/**
 * Pegin request with morpho position data
 */
export interface PeginRequestWithMorpho {
  /** The pegin request data */
  peginRequest: PeginRequest;
  /** Transaction hash */
  txHash: Hex;
  /** Morpho position data (undefined if vault not yet minted) */
  morphoPosition?: MorphoUserPosition;
  /** Morpho market data (undefined if vault not yet minted) */
  morphoMarket?: MorphoMarketSummary;
  /** BTC price in USD (undefined if vault not yet minted) */
  btcPriceUSD?: {
    price: bigint;
    decimals: number;
  };
}

/**
 * Get all pegin requests for a depositor with full details
 *
 * Composite operation that:
 * 1. Fetches all pegin transaction hashes for depositor
 * 2. Fetches detailed pegin request data for each hash in parallel
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @param btcVaultsManagerAddress - BTCVaultsManager contract address
 * @returns Array of pegin requests with transaction hashes
 */
export async function getPeginRequestsWithDetails(
  depositorAddress: Address,
  btcVaultsManagerAddress: Address
): Promise<PeginRequestWithTxHash[]> {
  // Step 1: Get all transaction hashes for this depositor
  const txHashes: Hex[] = await BTCVaultsManager.getDepositorPeginRequests(
    btcVaultsManagerAddress,
    depositorAddress
  );

  // Early return if no pegin requests found
  if (txHashes.length === 0) {
    return [];
  }

  // Step 2: Fetch detailed pegin request data for each transaction hash in parallel
  const peginRequestsWithDetails = await Promise.all(
    txHashes.map(async (txHash) => {
      const peginRequest = await BTCVaultsManager.getPeginRequest(btcVaultsManagerAddress, txHash);
      return {
        peginRequest,
        txHash,
      };
    })
  );

  return peginRequestsWithDetails;
}

/**
 * Get all pegin requests with Morpho position data
 *
 * Composite operation that:
 * 1. Fetches all pegin requests with details
 * 2. For each pegin, attempts to fetch vault metadata and morpho position
 * 3. Returns pegin data with morpho position (undefined if vault not minted yet)
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @param btcVaultsManagerAddress - BTCVaultsManager contract address
 * @param vaultControllerAddress - VaultController contract address
 * @param marketId - Morpho market ID
 * @returns Array of pegin requests with morpho position data
 */
export async function getPeginRequestsWithMorpho(
  depositorAddress: Address,
  btcVaultsManagerAddress: Address,
  vaultControllerAddress: Address,
  marketId: string | bigint
): Promise<PeginRequestWithMorpho[]> {
  // Step 1: Get basic pegin request data
  const peginRequests = await getPeginRequestsWithDetails(depositorAddress, btcVaultsManagerAddress);

  if (peginRequests.length === 0) {
    return [];
  }

  // Step 2: For each pegin, try to fetch morpho position, market data, and BTC price
  const peginRequestsWithMorpho = await Promise.all(
    peginRequests.map(async ({ peginRequest, txHash }) => {
      try {
        // Try to get vault metadata (will fail if vault not minted yet)
        const vaultMetadata = await VaultController.getVaultMetadata(vaultControllerAddress, txHash);

        // If we have vault metadata, fetch morpho position and market data in parallel
        const [morphoPosition, morphoMarket] = await Promise.all([
          Morpho.getUserPosition(marketId, vaultMetadata.proxyContract),
          Morpho.getMarketById(marketId),
        ]);

        // Fetch BTC price from oracle
        const btcPriceUSD = await Oracle.getBTCPrice(morphoMarket.oracle);

        return {
          peginRequest,
          txHash,
          morphoPosition,
          morphoMarket,
          btcPriceUSD,
        };
      } catch (error) {
        // Vault not minted yet or error fetching position, return without morpho data
        console.log(`[peginService] No vault/position for txHash ${txHash}:`, error);
        return {
          peginRequest,
          txHash,
          morphoPosition: undefined,
          morphoMarket: undefined,
          btcPriceUSD: undefined,
        };
      }
    })
  );

  return peginRequestsWithMorpho;
}
