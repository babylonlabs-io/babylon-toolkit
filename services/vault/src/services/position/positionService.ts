/**
 * Position Service - Business logic layer for positions
 *
 * Handles position-related operations (borrowing positions in Morpho markets).
 * A position can contain MULTIPLE vaults as collateral (N:1 relationship).
 */

import type { Address, Hex } from "viem";

import type {
  MarketPosition,
  MorphoMarketSummary,
  MorphoUserPosition,
} from "../../clients/eth-contract";
import {
  Morpho,
  MorphoOracle,
  VaultController,
} from "../../clients/eth-contract";

/**
 * Complete position with Morpho data
 */
export interface PositionWithMorpho {
  /** Position ID */
  positionId: Hex;
  /** Position data from BTCVaultController */
  position: MarketPosition;
  /** User's Morpho position data (via proxy contract) */
  morphoPosition: MorphoUserPosition;
  /** Market data from Morpho */
  marketData: MorphoMarketSummary;
  /** BTC price in USD from oracle */
  btcPriceUSD: number;
}

/**
 * Get all user positions with Morpho data
 *
 * @param userAddress - User's Ethereum address
 * @param vaultControllerAddress - BTCVaultController contract address
 * @returns Array of positions with Morpho position, full market data, and BTC price
 */
export async function getUserPositionsWithMorpho(
  userAddress: Address,
  vaultControllerAddress: Address,
): Promise<PositionWithMorpho[]> {
  // Step 1: Get all position IDs for the user
  const positionIds = await VaultController.getUserPositions(
    vaultControllerAddress,
    userAddress,
  );

  // Early return if no positions
  if (positionIds.length === 0) {
    return [];
  }

  // Step 2: Bulk fetch all position data in a single multicall
  const positions = await VaultController.getPositionsBulk(
    vaultControllerAddress,
    positionIds,
  );

  // Step 3: Deduplicate and fetch unique markets
  const uniqueMarketIds = [
    ...new Set(positions.map((p) => p.marketId.toString())),
  ];

  // Fetch all unique market data in parallel
  const marketDataArray = await Promise.all(
    uniqueMarketIds.map((marketId) => Morpho.getMarketWithData(marketId)),
  );

  // Build market ID -> market data map
  const marketDataMap = new Map<string, MorphoMarketSummary>();
  uniqueMarketIds.forEach((marketId, index) => {
    marketDataMap.set(marketId, marketDataArray[index]);
  });

  // Step 4: Deduplicate and fetch unique oracle prices (multiple markets may share same oracle)
  const uniqueOracleAddresses = [
    ...new Set(
      Array.from(marketDataMap.values()).map((m) => m.oracle.toLowerCase()),
    ),
  ];

  // Fetch all unique oracle prices in parallel
  const oraclePricesArray = await Promise.all(
    uniqueOracleAddresses.map(async (oracleAddress) => {
      const price = await MorphoOracle.getOraclePrice(oracleAddress as Address);
      return MorphoOracle.convertOraclePriceToUSD(price);
    }),
  );

  // Build oracle address -> BTC price map
  const oraclePriceMap = new Map<string, number>();
  uniqueOracleAddresses.forEach((oracleAddress, index) => {
    oraclePriceMap.set(oracleAddress.toLowerCase(), oraclePricesArray[index]);
  });

  // Step 5: Group positions by market ID for bulk Morpho position fetching
  const positionsByMarketId = new Map<
    string,
    Array<{ id: Hex; position: MarketPosition }>
  >();
  positions.forEach((position, index) => {
    const marketId = position.marketId.toString();
    if (!positionsByMarketId.has(marketId)) {
      positionsByMarketId.set(marketId, []);
    }
    positionsByMarketId.get(marketId)!.push({
      id: positionIds[index],
      position,
    });
  });

  // Step 6: Bulk fetch Morpho positions grouped by market ID
  const morphoPositionsByProxy = new Map<
    string,
    MorphoUserPosition | undefined
  >();

  await Promise.all(
    Array.from(positionsByMarketId.entries()).map(
      async ([marketId, marketPositions]) => {
        // Get all proxy addresses for this market
        const proxyAddresses = marketPositions.map(
          (p) => p.position.proxyContract,
        );

        // Bulk fetch Morpho positions for this market
        const morphoPositions = await Morpho.getUserPositionsBulk(
          marketId,
          proxyAddresses,
        );

        // Store in map for lookup
        proxyAddresses.forEach((proxyAddress, index) => {
          morphoPositionsByProxy.set(
            proxyAddress.toLowerCase(),
            morphoPositions[index],
          );
        });
      },
    ),
  );

  // Step 7: Combine all data
  const positionsWithMorpho = positions.map((position, index) => {
    const positionId = positionIds[index];
    const marketId = position.marketId.toString();
    const morphoPosition = morphoPositionsByProxy.get(
      position.proxyContract.toLowerCase(),
    )!;
    const marketData = marketDataMap.get(marketId)!;
    const btcPriceUSD = oraclePriceMap.get(marketData.oracle.toLowerCase())!;

    return {
      positionId,
      position,
      morphoPosition,
      marketData,
      btcPriceUSD,
    };
  });

  return positionsWithMorpho;
}

/**
 * Get user's position for a specific market
 * Returns only the data needed for UI and transactions
 *
 * @param userAddress - User's Ethereum address
 * @param marketId - Market ID
 * @param vaultControllerAddress - BTCVaultController contract address
 * @returns Position data with current loan/collateral from Morpho, or null if no position exists
 */
export async function getUserPositionForMarket(
  userAddress: Address,
  marketId: string | bigint,
  vaultControllerAddress: Address,
): Promise<{
  positionId: Hex;
  marketId: Hex;
  currentLoan: bigint;
  currentCollateral: bigint;
} | null> {
  // Get position from Vault Controller (contains positionId and proxy address)
  const [position, positionId] = await Promise.all([
    VaultController.getPosition(vaultControllerAddress, userAddress, marketId),
    VaultController.getPositionKey(
      vaultControllerAddress,
      userAddress,
      marketId,
    ),
  ]);

  if (!position) {
    return null;
  }

  const morphoPosition = await Morpho.getUserPosition(
    marketId,
    position.proxyContract,
  );

  return {
    positionId,
    marketId: position.marketId,
    currentLoan: morphoPosition.borrowAssets,
    currentCollateral: morphoPosition.collateral,
  };
}

/**
 * Get a single position by position ID with full Morpho data
 *
 * @param positionId - Position ID (hex string)
 * @param vaultControllerAddress - BTCVaultController contract address
 * @returns Position with Morpho data, or null if not found
 */
export async function getSinglePositionWithMorpho(
  positionId: Hex,
  vaultControllerAddress: Address,
): Promise<PositionWithMorpho | null> {
  // Step 1: Fetch position data
  const positions = await VaultController.getPositionsBulk(
    vaultControllerAddress,
    [positionId],
  );

  if (positions.length === 0) {
    return null;
  }

  const position = positions[0];
  const marketId = position.marketId.toString();

  // Step 2: Fetch market data and Morpho position in parallel
  const [marketData, morphoPosition] = await Promise.all([
    Morpho.getMarketWithData(marketId),
    Morpho.getUserPosition(marketId, position.proxyContract),
  ]);

  // Step 3: Fetch BTC price from oracle
  const oraclePrice = await MorphoOracle.getOraclePrice(
    marketData.oracle as Address,
  );
  const btcPriceUSD = MorphoOracle.convertOraclePriceToUSD(oraclePrice);

  return {
    positionId,
    position,
    morphoPosition,
    marketData,
    btcPriceUSD,
  };
}
