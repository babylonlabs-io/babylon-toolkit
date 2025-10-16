/**
 * Pegin Service - Business logic layer
 *
 * Orchestrates pegin request operations and transformations.
 * This layer sits between React hooks and low-level clients.
 */

import type { Address, Hex } from 'viem';
import { BTCVaultsManager, VaultController, Morpho, MorphoOracle } from '../../clients/eth-contract';
import type { PeginRequest, MorphoUserPosition, MorphoMarketSummary, VaultMetadata } from '../../clients/eth-contract';

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
 * Pegin request with vault metadata (for deposit tab)
 * Shows vault status without full Morpho position details
 */
export interface PeginRequestWithVaultMetadata {
  /** The pegin request data */
  peginRequest: PeginRequest;
  /** Transaction hash */
  txHash: Hex;
  /** Vault metadata (undefined if vault not yet minted) */
  vaultMetadata?: VaultMetadata;
}

/**
 * Pegin request with morpho position data
 */
export interface PeginRequestWithMorpho {
  /** The pegin request data */
  peginRequest: PeginRequest;
  /** Transaction hash */
  txHash: Hex;
  /** Vault metadata (undefined if vault not yet minted) */
  vaultMetadata?: VaultMetadata;
  /** Morpho position data (undefined if vault not yet minted) */
  morphoPosition?: MorphoUserPosition;
  /** Morpho market data */
  morphoMarket: MorphoMarketSummary;
  /** BTC price in USD as a number from Morpho oracle */
  btcPriceUSD: number;
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
  // Use Promise.allSettled to handle partial failures gracefully
  const peginRequestsWithDetails = (await Promise.allSettled(
    txHashes.map(async (txHash) => {
      const peginRequest = await BTCVaultsManager.getPeginRequest(btcVaultsManagerAddress, txHash);
      return { peginRequest, txHash };
    })
  )).filter((result): result is PromiseFulfilledResult<PeginRequestWithTxHash> =>
    result.status === 'fulfilled'
  ).map(result => result.value);

  return peginRequestsWithDetails;
}

/**
 * Get all pegin requests with vault metadata
 *
 * Composite operation that:
 * 1. Fetches all pegin requests with details
 * 2. For each pegin, attempts to fetch vault metadata to show "in use" status
 * 3. Does NOT fetch full Morpho position data (for performance)
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @param btcVaultsManagerAddress - BTCVaultsManager contract address
 * @param vaultControllerAddress - VaultController contract address
 * @returns Array of pegin requests with vault metadata
 */
export async function getPeginRequestsWithVaultMetadata(
  depositorAddress: Address,
  btcVaultsManagerAddress: Address,
  vaultControllerAddress: Address
): Promise<PeginRequestWithVaultMetadata[]> {
  // Step 1: Get basic pegin request data
  const peginRequests = await getPeginRequestsWithDetails(depositorAddress, btcVaultsManagerAddress);

  if (peginRequests.length === 0) {
    return [];
  }

  // Step 2: For each pegin, try to fetch vault metadata (to show "in use" status)
  const peginRequestsWithMetadata = await Promise.all(
    peginRequests.map(async ({ peginRequest, txHash }) => {
      try {
        // Try to get vault metadata (will fail if vault not minted yet)
        const vaultMetadata = await VaultController.getVaultMetadata(vaultControllerAddress, txHash);

        return {
          peginRequest,
          txHash,
          vaultMetadata,
        };
      } catch (error) {
        // Vault not minted yet or error fetching metadata, return without vault metadata
        return {
          peginRequest,
          txHash,
          vaultMetadata: undefined,
        };
      }
    })
  );

  return peginRequestsWithMetadata;
}

/**
 * Get all pegin requests with Morpho position data
 *
 * Composite operation that:
 * 1. Fetches all pegin requests with details
 * 2. Fetches Morpho market data and BTC price (once, shared across all pegins)
 * 3. For each pegin, attempts to fetch vault metadata and morpho position
 * 4. Returns pegin data with morpho position (undefined if vault not minted yet)
 *    but always includes market data and BTC price
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

  // Step 2: Fetch market data and BTC price (independent of vault status)
  const morphoMarket = await Morpho.getMarketById(marketId);
  const oraclePrice = await MorphoOracle.getOraclePrice(morphoMarket.oracle);
  const btcPriceUSD = MorphoOracle.convertOraclePriceToUSD(oraclePrice);

  // Step 3: For each pegin, try to fetch morpho position
  const peginRequestsWithMorpho = await Promise.all(
    peginRequests.map(async ({ peginRequest, txHash }) => {
      try {
        // Try to get vault metadata (will fail if vault not minted yet)
        const vaultMetadata = await VaultController.getVaultMetadata(vaultControllerAddress, txHash);

        // If we have vault metadata, fetch morpho position
        const morphoPosition = await Morpho.getUserPosition(marketId, vaultMetadata.proxyContract);

        return {
          peginRequest,
          txHash,
          vaultMetadata,
          morphoPosition,
          morphoMarket,
          btcPriceUSD,
        };
      } catch (error) {
        // Vault not minted yet or error fetching position, return without morpho position but with price
        return {
          peginRequest,
          txHash,
          vaultMetadata: undefined,
          morphoPosition: undefined,
          morphoMarket,
          btcPriceUSD,
        };
      }
    })
  );

  return peginRequestsWithMorpho;
}
