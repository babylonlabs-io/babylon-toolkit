/**
 * Aave Position Service
 *
 * Hybrid service that combines indexer data with live RPC data for positions.
 * Uses indexer for position list and collateral data, RPC for live account data.
 */

import type { Address } from "viem";

import { AaveSpoke, type AaveSpokeUserAccountData } from "../clients";
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
  /** Live position data from Spoke */
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
  /**
   * Live account data from Spoke (calculated using on-chain oracle prices)
   * This is the authoritative data for health factor and values.
   */
  accountData: AaveSpokeUserAccountData;
}

/**
 * Get user positions with live on-chain data
 *
 * Fetches positions with collaterals from indexer (single GraphQL call)
 * and enriches with live data from Spoke.
 *
 * Note: In Babylon vault integration, users can only have ONE position
 * (single vBTC collateral reserve), so we don't need batch calls.
 *
 * @param depositor - User's Ethereum address
 * @param spokeAddress - Spoke contract address (from config context)
 * @returns Array of positions with live data (0 or 1 position)
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

  // User can only have one position in Babylon vault integration
  const position = positions[0];
  const proxyAddress = position.proxyContract as Address;

  // Fetch live data from Spoke in parallel
  const [spokePosition, accountData] = await Promise.all([
    AaveSpoke.getUserPosition(spokeAddress, position.reserveId, proxyAddress),
    AaveSpoke.getUserAccountData(spokeAddress, proxyAddress),
  ]);

  return [
    {
      ...position,
      liveData: {
        drawnShares: spokePosition.drawnShares,
        premiumShares: spokePosition.premiumShares,
        suppliedShares: spokePosition.suppliedShares,
        hasDebt: hasDebtFromPosition(spokePosition),
      },
      accountData,
    },
  ];
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

  const proxyAddress = position.proxyContract as Address;

  // Fetch live data from Spoke in parallel
  const [spokePosition, accountData] = await Promise.all([
    AaveSpoke.getUserPosition(spokeAddress, position.reserveId, proxyAddress),
    AaveSpoke.getUserAccountData(spokeAddress, proxyAddress),
  ]);

  return {
    ...position,
    collaterals,
    liveData: {
      drawnShares: spokePosition.drawnShares,
      premiumShares: spokePosition.premiumShares,
      suppliedShares: spokePosition.suppliedShares,
      hasDebt: hasDebtFromPosition(spokePosition),
    },
    accountData,
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
