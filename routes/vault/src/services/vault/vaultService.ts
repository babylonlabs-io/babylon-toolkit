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
 * 2. Bulk fetches metadata for all vaults in a single multicall (optimized)
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

  // Step 2: Bulk fetch metadata for all vaults in a single multicall
  // This is much more efficient than individual calls in Promise.all
  const metadataArray = await VaultController.getVaultMetadataBulk(vaultControllerAddress, txHashes);

  // Step 3: Combine with transaction hashes, filtering out undefined results
  const vaultsWithDetails = txHashes
    .map((txHash, index) => {
      const metadata = metadataArray[index];
      if (!metadata) {
        return null;
      }
      return { txHash, metadata };
    })
    .filter((item): item is VaultWithDetails => item !== null);

  return vaultsWithDetails;
}

/**
 * Get all user vault positions with Morpho data
 *
 * Optimized to minimize API calls by:
 * 1. Deduplicating market ID fetches (many vaults may share the same market)
 * 2. Deduplicating oracle price fetches (markets may share the same oracle)
 * 3. Bulk fetching user positions grouped by market ID (optimized)
 *
 * @param userAddress - User's Ethereum address
 * @param vaultControllerAddress - BTCVaultController contract address
 * @returns Array of vault positions with Morpho data, market data, and BTC price
 */
export async function getUserVaultPositionsWithMorpho(
  userAddress: Address,
  vaultControllerAddress: Address
): Promise<VaultPositionWithMorpho[]> {
  // Get all vaults with details
  const vaults = await getUserVaultsWithDetails(userAddress, vaultControllerAddress);

  // Early return if no vaults
  if (vaults.length === 0) {
    return [];
  }

  // Step 1: Deduplicate and fetch unique markets
  // Extract unique market IDs
  const uniqueMarketIds = [...new Set(vaults.map(v => v.metadata.marketId.toString()))];

  // Fetch all unique markets in parallel
  const marketDataMap = new Map<string, MorphoMarketSummary>();
  const marketDataArray = await Promise.all(
    uniqueMarketIds.map(marketId => Morpho.getMarketById(marketId))
  );

  // Build market ID -> market data map
  uniqueMarketIds.forEach((marketId, index) => {
    marketDataMap.set(marketId, marketDataArray[index]);
  });

  // Step 2: Deduplicate and fetch unique oracle prices
  // Extract unique oracle addresses
  const uniqueOracleAddresses = [...new Set(
    Array.from(marketDataMap.values()).map(m => m.oracle.toLowerCase())
  )];

  // Fetch all unique oracle prices in parallel
  const oraclePriceMap = new Map<string, number>();
  const oraclePricesArray = await Promise.all(
    uniqueOracleAddresses.map(async (oracleAddress) => {
      const price = await MorphoOracle.getOraclePrice(oracleAddress as Address);
      return MorphoOracle.convertOraclePriceToUSD(price);
    })
  );

  // Build oracle address -> USD price map
  uniqueOracleAddresses.forEach((oracleAddress, index) => {
    oraclePriceMap.set(oracleAddress.toLowerCase(), oraclePricesArray[index]);
  });

  // Step 3: Group vaults by market ID for bulk position fetching
  const vaultsByMarketId = new Map<string, VaultWithDetails[]>();
  vaults.forEach((vault) => {
    const marketId = vault.metadata.marketId.toString();
    if (!vaultsByMarketId.has(marketId)) {
      vaultsByMarketId.set(marketId, []);
    }
    vaultsByMarketId.get(marketId)!.push(vault);
  });

  // Step 4: Bulk fetch user positions grouped by market ID
  const positionsByProxyAddress = new Map<string, MorphoUserPosition | undefined>();

  await Promise.all(
    Array.from(vaultsByMarketId.entries()).map(async ([marketId, marketVaults]) => {
      // Get all proxy addresses for this market
      const proxyAddresses = marketVaults.map(v => v.metadata.proxyContract);

      // Bulk fetch positions for this market
      const positions = await Morpho.getUserPositionsBulk(marketId, proxyAddresses);

      // Store in map for lookup
      proxyAddresses.forEach((proxyAddress, index) => {
        positionsByProxyAddress.set(proxyAddress.toLowerCase(), positions[index]);
      });
    })
  );

  // Step 5: Combine all data
  const vaultPositions = vaults.map(({ txHash, metadata }) => {
    const marketId = metadata.marketId.toString();
    const morphoPosition = positionsByProxyAddress.get(metadata.proxyContract.toLowerCase())!;
    const marketData = marketDataMap.get(marketId)!;
    const btcPriceUSD = oraclePriceMap.get(marketData.oracle.toLowerCase())!;

    return {
      txHash,
      metadata,
      morphoPosition,
      marketData,
      btcPriceUSD,
    };
  });

  return vaultPositions;
}
