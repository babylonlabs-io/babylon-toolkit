/**
 * Aave Position Service
 *
 * Hybrid service that combines indexer data with live RPC data for positions.
 * Uses indexer for position list and collateral data, RPC for live debt/health data.
 */

import type { Address } from "viem";

import { AaveSpoke } from "../clients";

import { fetchAaveConfig } from "./fetchConfig";
import {
  fetchAaveActivePositions,
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
 * Fetches positions from indexer and enriches with live debt data from Spoke.
 *
 * @param depositor - User's Ethereum address
 * @returns Array of positions with live data
 */
export async function getUserPositionsWithLiveData(
  depositor: string,
): Promise<AavePositionWithLiveData[]> {
  // Fetch config and active positions in parallel
  const [config, positions] = await Promise.all([
    fetchAaveConfig(),
    fetchAaveActivePositions(depositor),
  ]);

  if (!config || positions.length === 0) {
    return [];
  }

  const spokeAddress = config.btcVaultCoreSpokeAddress as Address;

  // Fetch collaterals and live data for each position
  const positionsWithLiveData = await Promise.all(
    positions.map(async (position) => {
      // Fetch collaterals from indexer
      const collaterals = await fetchAavePositionCollaterals(position.id);

      // Fetch live position data from Spoke
      const spokePosition = await AaveSpoke.getUserPosition(
        spokeAddress,
        position.reserveId,
        position.proxyContract as Address,
      );

      const hasDebt =
        spokePosition.drawnShares > 0n ||
        spokePosition.premiumShares > 0n ||
        spokePosition.realizedPremiumRay > 0n;

      return {
        ...position,
        collaterals,
        liveData: {
          drawnShares: spokePosition.drawnShares,
          premiumShares: spokePosition.premiumShares,
          suppliedShares: spokePosition.suppliedShares,
          hasDebt,
        },
      };
    }),
  );

  return positionsWithLiveData;
}

/**
 * Get a single position with live data by position ID
 *
 * @param positionId - Position ID (bytes32)
 * @returns Position with live data or null if not found
 */
export async function getPositionWithLiveData(
  positionId: string,
): Promise<AavePositionWithLiveData | null> {
  // Fetch position from indexer and config in parallel
  const [config, position, collaterals] = await Promise.all([
    fetchAaveConfig(),
    fetchAavePositionById(positionId),
    fetchAavePositionCollaterals(positionId),
  ]);

  if (!config || !position) {
    return null;
  }

  const spokeAddress = config.btcVaultCoreSpokeAddress as Address;

  // Fetch live position data from Spoke (debt accrues interest so must be live)
  const spokePosition = await AaveSpoke.getUserPosition(
    spokeAddress,
    position.reserveId,
    position.proxyContract as Address,
  );

  const hasDebt =
    spokePosition.drawnShares > 0n ||
    spokePosition.premiumShares > 0n ||
    spokePosition.realizedPremiumRay > 0n;

  return {
    ...position,
    collaterals,
    liveData: {
      drawnShares: spokePosition.drawnShares,
      premiumShares: spokePosition.premiumShares,
      suppliedShares: spokePosition.suppliedShares,
      hasDebt,
    },
  };
}

/**
 * Check if a position can withdraw collateral
 *
 * Position can only withdraw if it has no debt.
 *
 * @param positionId - Position ID
 * @returns true if position can withdraw
 */
export async function canWithdrawCollateral(
  positionId: string,
): Promise<boolean> {
  const position = await getPositionWithLiveData(positionId);
  if (!position) {
    return false;
  }
  return !position.liveData.hasDebt;
}

/**
 * Get position for a specific market/reserve
 *
 * @param depositor - User's Ethereum address
 * @param reserveId - Reserve ID
 * @returns Position with live data or null if not found
 */
export async function getUserPositionForReserve(
  depositor: string,
  reserveId: bigint,
): Promise<AavePositionWithLiveData | null> {
  const positions = await getUserPositionsWithLiveData(depositor);
  return positions.find((p) => p.reserveId === reserveId) || null;
}
