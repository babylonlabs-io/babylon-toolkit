/**
 * Vault Service - Business logic layer
 *
 * Orchestrates multiple client calls to provide composite vault operations.
 * This layer sits between React hooks and low-level clients.
 */

import type { Address, Hex } from 'viem';
import { VaultController, Morpho, MorphoOracle } from '../../clients/eth-contract';
import type { VaultMetadata, MorphoUserPosition, MorphoMarketSummary } from '../../clients/eth-contract';

/**
 * Complete vault position including metadata and Morpho position data
 */
export interface VaultPositionWithMorpho {
  /** Transaction hash of the vault */
  txHash: Hex;
  /** Vault metadata from BTCVaultController */
  metadata: VaultMetadata;
  /** User's position in Morpho market (via proxy contract) */
  morphoPosition: MorphoUserPosition;
  /** Market data from Morpho (including oracle address and LLTV) */
  marketData: MorphoMarketSummary;
  /** BTC price in USD from oracle */
  btcPriceUSD: number;
}

/**
 * Vault with full details including metadata
 */
export interface VaultWithDetails {
  /** Transaction hash */
  txHash: Hex;
  /** Vault metadata */
  metadata: VaultMetadata;
}

/**
 * Get vault position with Morpho market data
 *
 * Composite operation that:
 * 1. Fetches vault metadata from BTCVaultController
 * 2. Extracts proxy contract address
 * 3. Fetches user's Morpho position using proxy address
 * 4. Fetches Morpho market data (including oracle address)
 * 5. Fetches BTC price from oracle
 *
 * @param txHash - Vault transaction hash
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param marketId - Morpho market ID
 * @returns Complete vault position with Morpho data, market data, and BTC price
 */
export async function getVaultPositionWithMorpho(
  txHash: Hex,
  vaultControllerAddress: Address,
  marketId: string | bigint
): Promise<VaultPositionWithMorpho> {
  // Step 1: Fetch vault metadata
  const metadata = await VaultController.getVaultMetadata(vaultControllerAddress, txHash);

  // Step 2: Fetch Morpho position and market data in parallel
  const [morphoPosition, marketData] = await Promise.all([
    Morpho.getUserPosition(marketId, metadata.proxyContract),
    Morpho.getMarketById(marketId),
  ]);

  // Step 3: Fetch BTC price from oracle
  const oraclePrice = await MorphoOracle.getOraclePrice(marketData.oracle);
  const btcPriceUSD = MorphoOracle.convertOraclePriceToUSD(oraclePrice);

  return {
    txHash,
    metadata,
    morphoPosition,
    marketData,
    btcPriceUSD,
  };
}

/**
 * Get all user vaults with full details
 *
 * Composite operation that:
 * 1. Fetches all vault transaction hashes for user
 * 2. Fetches metadata for each vault in parallel
 *
 * @param userAddress - User's Ethereum address
 * @param vaultControllerAddress - BTCVaultController contract address
 * @returns Array of vaults with full details
 */
export async function getUserVaultsWithDetails(
  userAddress: Address,
  vaultControllerAddress: Address
): Promise<VaultWithDetails[]> {
  // Step 1: Get all vault transaction hashes
  const txHashes = await VaultController.getUserVaults(vaultControllerAddress, userAddress);

  // Early return if no vaults
  if (txHashes.length === 0) {
    return [];
  }

  // Step 2: Fetch metadata for each vault in parallel
  const vaultsWithDetails = await Promise.all(
    txHashes.map(async (txHash) => {
      const metadata = await VaultController.getVaultMetadata(vaultControllerAddress, txHash);
      return {
        txHash,
        metadata,
      };
    })
  );

  return vaultsWithDetails;
}

/**
 * Get all user vault positions with Morpho data
 *
 * Composite operation that combines getUserVaultsWithDetails + Morpho positions + market data + BTC price
 *
 * @param userAddress - User's Ethereum address
 * @param vaultControllerAddress - BTCVaultController contract address
 * @param marketId - Morpho market ID
 * @returns Array of vault positions with Morpho data, market data, and BTC price
 */
export async function getUserVaultPositionsWithMorpho(
  userAddress: Address,
  vaultControllerAddress: Address,
  marketId: string | bigint
): Promise<VaultPositionWithMorpho[]> {
  // Get all vaults with details
  const vaults = await getUserVaultsWithDetails(userAddress, vaultControllerAddress);

  // Early return if no vaults
  if (vaults.length === 0) {
    return [];
  }

  // Fetch market data once (same for all positions)
  const marketData = await Morpho.getMarketById(marketId);

  // Fetch BTC price from oracle once (same for all positions)
  const oraclePrice = await MorphoOracle.getOraclePrice(marketData.oracle);
  const btcPriceUSD = MorphoOracle.convertOraclePriceToUSD(oraclePrice);

  // Fetch Morpho positions for each vault in parallel
  const vaultPositions = await Promise.all(
    vaults.map(async ({ txHash, metadata }) => {
      const morphoPosition = await Morpho.getUserPosition(marketId, metadata.proxyContract);
      return {
        txHash,
        metadata,
        morphoPosition,
        marketData,
        btcPriceUSD,
      };
    })
  );

  return vaultPositions;
}
