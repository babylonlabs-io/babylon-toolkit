/**
 * Aave Position Service
 *
 * Hybrid service that combines indexer data with live RPC data for positions.
 * Uses indexer for position list and collateral data, RPC for live debt/health data.
 */

import type { Address } from "viem";

import { AaveSpoke, type GetUserPositionInput } from "../clients";
import { hasDebtFromPosition } from "../utils";

import {
  fetchAaveActivePositionsWithCollaterals,
  fetchAavePositionById,
  fetchAavePositionCollaterals,
  type AavePosition,
  type AavePositionCollateral,
} from "./fetchPositions";

/**
 * Position with live on-chain data
 */
export interface AavePositionWithLiveData extends AavePosition {
  /** Collateral entries for this position */
  collaterals: AavePositionCollateral[];
  /** Live debt data from Spoke */
  liveData: {
    /** Drawn debt shares */
    drawnShares: bigint;
    /** Premium shares (interest) */
    premiumShares: bigint;
    /** Supplied collateral shares */
    suppliedShares: bigint;
    /** Whether position has any debt */
    hasDebt: boolean;
  };
}

/**
 * Get user positions with live on-chain data
 *
 * Fetches positions with collaterals from indexer (single GraphQL call)
 * and enriches with live debt data from Spoke (single multicall).
 *
 * @param depositor - User's Ethereum address
 * @param spokeAddress - Spoke contract address (from config context)
 * @returns Array of positions with live data
 */
export async function getUserPositionsWithLiveData(
  depositor: string,
  spokeAddress: Address,
): Promise<AavePositionWithLiveData[]> {
  // Fetch active positions with collaterals in a single GraphQL call
  const positions = await fetchAaveActivePositionsWithCollaterals(depositor);

  if (positions.length === 0) {
    return [];
  }

  // Build inputs for bulk position fetch
  const inputs: GetUserPositionInput[] = positions.map((position) => ({
    reserveId: position.reserveId,
    userAddress: position.proxyContract as Address,
  }));

  // Fetch all live position data in a single multicall
  const spokePositions = await AaveSpoke.getUserPositions(spokeAddress, inputs);

  // Combine indexer data with live Spoke data
  return positions.map((position, index) => ({
    ...position,
    liveData: {
      drawnShares: spokePositions[index].drawnShares,
      premiumShares: spokePositions[index].premiumShares,
      suppliedShares: spokePositions[index].suppliedShares,
      hasDebt: hasDebtFromPosition(spokePositions[index]),
    },
  }));
}

/**
 * Get a single position with live data by position ID
 *
 * @param positionId - Position ID (bytes32)
 * @param spokeAddress - Spoke contract address (from config context)
 * @returns Position with live data or null if not found
 */
export async function getPositionWithLiveData(
  positionId: string,
  spokeAddress: Address,
): Promise<AavePositionWithLiveData | null> {
  // Fetch position and collaterals from indexer in parallel
  const [position, collaterals] = await Promise.all([
    fetchAavePositionById(positionId),
    fetchAavePositionCollaterals(positionId),
  ]);

  if (!position) {
    return null;
  }

  // Fetch live position data from Spoke (debt accrues interest so must be live)
  const spokePosition = await AaveSpoke.getUserPosition(
    spokeAddress,
    position.reserveId,
    position.proxyContract as Address,
  );

  return {
    ...position,
    collaterals,
    liveData: {
      drawnShares: spokePosition.drawnShares,
      premiumShares: spokePosition.premiumShares,
      suppliedShares: spokePosition.suppliedShares,
      hasDebt: hasDebtFromPosition(spokePosition),
    },
  };
}

/**
 * Check if a position can withdraw collateral
 *
 * Position can only withdraw if it has no debt.
 *
 * @param positionId - Position ID
 * @param spokeAddress - Spoke contract address (from config context)
 * @returns true if position can withdraw
 */
export async function canWithdrawCollateral(
  positionId: string,
  spokeAddress: Address,
): Promise<boolean> {
  const position = await getPositionWithLiveData(positionId, spokeAddress);
  if (!position) {
    return false;
  }
  return !position.liveData.hasDebt;
}

/**
 * Get position for a specific reserve
 *
 * @param depositor - User's Ethereum address
 * @param reserveId - Reserve ID
 * @param spokeAddress - Spoke contract address (from config context)
 * @returns Position with live data or null if not found
 */
export async function getUserPositionForReserve(
  depositor: string,
  reserveId: bigint,
  spokeAddress: Address,
): Promise<AavePositionWithLiveData | null> {
  const positions = await getUserPositionsWithLiveData(depositor, spokeAddress);
  return positions.find((p) => p.reserveId === reserveId) || null;
}
