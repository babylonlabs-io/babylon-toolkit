/**
 * Morpho Position Service
 *
 * Hybrid approach: Fetches static position data from GraphQL indexer,
 * then enriches with real-time borrow data from on-chain.
 *
 * This reduces RPC calls from ~7+ to ~2-3 per fetch.
 */

import type { Address, Hex } from "viem";

import type { MorphoUserPosition } from "../../../clients/eth-contract";
import {
  Morpho,
  MorphoController,
  MorphoOracle,
} from "../../../clients/eth-contract";

import {
  fetchMorphoActivePositions,
  type MorphoPositionFromIndexer,
} from "./fetchPositions";

/**
 * Position with Morpho data - optimized version using indexer
 */
export interface PositionWithMorphoOptimized {
  /** Position ID */
  positionId: Hex;
  /** Depositor address */
  depositor: Address;
  /** Market ID */
  marketId: string;
  /** Proxy contract address */
  proxyContract: Address;
  /** User's real-time Morpho position data (from RPC) */
  morphoPosition: MorphoUserPosition;
  /** Market static data from indexer */
  marketConfig: {
    loanTokenAddress: string;
    collateralTokenAddress: string;
    oracleAddress: string;
    irm: string;
    lltv: string;
  };
  /** BTC price in USD from oracle */
  btcPriceUSD: number;
}

/**
 * Get all user positions using hybrid indexer + RPC approach
 *
 * Data flow:
 * 1. Fetch active positions from GraphQL indexer (includes market config)
 * 2. Batch fetch real-time borrow data from Morpho contract
 * 3. Fetch BTC price from oracle (single call for all positions)
 *
 * @param userAddress - User's Ethereum address
 * @returns Array of positions with real-time borrow data
 */
export async function getUserPositionsOptimized(
  userAddress: Address,
): Promise<PositionWithMorphoOptimized[]> {
  // Step 1: Fetch positions from GraphQL indexer
  const { positions: indexedPositions } =
    await fetchMorphoActivePositions(userAddress);

  if (indexedPositions.length === 0) {
    return [];
  }

  // Step 2: Group positions by market ID for efficient batch fetching
  const positionsByMarket = groupPositionsByMarket(indexedPositions);

  // Step 3: Fetch real-time Morpho position data for each market in parallel
  const morphoPositionsByProxy = new Map<string, MorphoUserPosition>();

  await Promise.all(
    Array.from(positionsByMarket.entries()).map(
      async ([marketId, positions]) => {
        const proxyAddresses = positions.map((p) => p.proxyContract as Address);

        // Bulk fetch from Morpho contract
        const morphoPositions = await Morpho.getUserPositionsBulk(
          marketId,
          proxyAddresses,
        );

        // Store results in map
        proxyAddresses.forEach((proxy, index) => {
          const result = morphoPositions[index];
          if (result) {
            morphoPositionsByProxy.set(proxy.toLowerCase(), result);
          }
        });
      },
    ),
  );

  // Step 4: Get BTC price from oracle (use first market's oracle)
  // All markets should use the same BTC oracle, so we only need one call
  const firstPosition = indexedPositions[0];
  const oracleAddress = firstPosition.market?.oracleAddress;

  let btcPriceUSD = 0;
  if (oracleAddress) {
    try {
      const oraclePrice = await MorphoOracle.getOraclePrice(
        oracleAddress as Address,
      );
      btcPriceUSD = MorphoOracle.convertOraclePriceToUSD(oraclePrice);
    } catch {
      // Oracle fetch failed, continue with 0 price
      console.warn("Failed to fetch BTC price from oracle");
    }
  }

  // Step 5: Combine indexed data with real-time data
  const positionsWithMorpho: PositionWithMorphoOptimized[] = [];

  for (const indexed of indexedPositions) {
    const morphoPosition = morphoPositionsByProxy.get(
      indexed.proxyContract.toLowerCase(),
    );

    if (!morphoPosition) {
      continue;
    }

    // Only include positions with active borrowing or collateral
    if (
      morphoPosition.borrowShares === 0n &&
      morphoPosition.collateral === 0n
    ) {
      continue;
    }

    positionsWithMorpho.push({
      positionId: indexed.id as Hex,
      depositor: indexed.depositor as Address,
      marketId: indexed.marketId,
      proxyContract: indexed.proxyContract as Address,
      morphoPosition,
      marketConfig: {
        loanTokenAddress: indexed.market?.loanTokenAddress || "",
        collateralTokenAddress: indexed.market?.collateralTokenAddress || "",
        oracleAddress: indexed.market?.oracleAddress || "",
        irm: indexed.market?.irm || "",
        lltv: indexed.market?.lltv || "0",
      },
      btcPriceUSD,
    });
  }

  return positionsWithMorpho;
}

/**
 * Get a single position with real-time data
 *
 * @param positionId - Position ID
 * @param marketId - Market ID
 * @param proxyContract - Proxy contract address
 * @returns Position with real-time Morpho data
 */
export async function getSinglePositionOptimized(
  marketId: string,
  proxyContract: Address,
  oracleAddress?: Address,
): Promise<{
  morphoPosition: MorphoUserPosition;
  btcPriceUSD: number;
}> {
  // Fetch Morpho position and oracle price in parallel
  const [morphoPosition, btcPriceUSD] = await Promise.all([
    Morpho.getUserPosition(marketId, proxyContract),
    oracleAddress
      ? MorphoOracle.getOraclePrice(oracleAddress).then((price) =>
          MorphoOracle.convertOraclePriceToUSD(price),
        )
      : Promise.resolve(0),
  ]);

  return {
    morphoPosition,
    btcPriceUSD,
  };
}

/**
 * Get user's position for a specific market
 * Returns only the data needed for UI and transactions
 *
 * @param userAddress - User's Ethereum address
 * @param marketId - Market ID
 * @param morphoControllerAddress - MorphoIntegrationController contract address
 * @returns Position data with current loan/collateral from Morpho, or null if no position exists
 */
export async function getUserPositionForMarket(
  userAddress: Address,
  marketId: string | bigint,
  morphoControllerAddress: Address,
): Promise<{
  positionId: Hex;
  marketId: Hex;
  currentLoan: bigint;
  currentCollateral: bigint;
} | null> {
  // Get position from Morpho Controller (contains positionId and proxy address)
  const [position, positionId] = await Promise.all([
    MorphoController.getPosition(
      morphoControllerAddress,
      userAddress,
      marketId,
    ),
    MorphoController.getPositionKey(
      morphoControllerAddress,
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
 * Helper: Group positions by market ID
 */
function groupPositionsByMarket(
  positions: MorphoPositionFromIndexer[],
): Map<string, MorphoPositionFromIndexer[]> {
  const grouped = new Map<string, MorphoPositionFromIndexer[]>();

  for (const position of positions) {
    const existing = grouped.get(position.marketId);
    if (existing) {
      existing.push(position);
    } else {
      grouped.set(position.marketId, [position]);
    }
  }

  return grouped;
}
