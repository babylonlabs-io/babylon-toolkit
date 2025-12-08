/**
 * Morpho Position Service
 *
 * Hybrid approach: Fetches static position data from GraphQL indexer,
 * then enriches with real-time borrow data from on-chain.
 *
 * This reduces RPC calls from ~7+ to ~2-3 per fetch.
 */

import type { Address, Hex } from "viem";

import { Morpho, MorphoController, type MorphoUserPosition } from "../clients";

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
}

/**
 * Get all user positions using hybrid indexer + RPC approach
 *
 * Data flow:
 * 1. Fetch active positions from GraphQL indexer (includes market config)
 * 2. Batch fetch real-time borrow data from Morpho contract
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

  // Step 4: Combine indexed data with real-time data
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
    });
  }

  return positionsWithMorpho;
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
