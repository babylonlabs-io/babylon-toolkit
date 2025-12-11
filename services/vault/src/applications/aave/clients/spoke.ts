/**
 * Aave Spoke Client - Read operations
 *
 * Provides read operations for interacting with Aave v4 Spoke contracts.
 * Used to fetch live user position data (debt, collateral) from the Core Spoke.
 *
 * Note: Reserve data should be fetched from the indexer via fetchReserves.ts
 * since it doesn't need to be live and benefits from caching.
 */

import { type Address } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";
import { hasDebtFromPosition } from "../utils";

import AaveSpokeABI from "./abis/AaveSpoke.abi.json";

/**
 * User position data from the Spoke
 */
export interface AaveSpokeUserPosition {
  /** Drawn debt shares */
  drawnShares: bigint;
  /** Premium shares (interest) */
  premiumShares: bigint;
  /** Realized premium (ray) */
  realizedPremiumRay: bigint;
  /** Premium offset (ray) */
  premiumOffsetRay: bigint;
  /** Supplied collateral shares */
  suppliedShares: bigint;
  /** Dynamic config key */
  dynamicConfigKey: number;
}

/**
 * Get user position from the Spoke
 *
 * This fetches live data from the contract because debt accrues interest
 * and needs to be current for accurate health factor calculations.
 *
 * @param spokeAddress - Aave Spoke contract address
 * @param reserveId - Reserve ID
 * @param userAddress - User's proxy contract address
 * @returns User position data
 */
export async function getUserPosition(
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<AaveSpokeUserPosition> {
  const publicClient = ethClient.getPublicClient();

  const result = await publicClient.readContract({
    address: spokeAddress,
    abi: AaveSpokeABI,
    functionName: "getUserPosition",
    args: [reserveId, userAddress],
  });

  type PositionResult = {
    drawnShares: bigint;
    premiumShares: bigint;
    realizedPremiumRay: bigint;
    premiumOffsetRay: bigint;
    suppliedShares: bigint;
    dynamicConfigKey: number;
  };

  const position = result as PositionResult;

  return {
    drawnShares: position.drawnShares,
    premiumShares: position.premiumShares,
    realizedPremiumRay: position.realizedPremiumRay,
    premiumOffsetRay: position.premiumOffsetRay,
    suppliedShares: position.suppliedShares,
    dynamicConfigKey: position.dynamicConfigKey,
  };
}

/**
 * Check if a user has any debt in a reserve
 *
 * @param spokeAddress - Aave Spoke contract address
 * @param reserveId - Reserve ID
 * @param userAddress - User's proxy contract address
 * @returns true if user has debt
 */
export async function hasDebt(
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<boolean> {
  const position = await getUserPosition(spokeAddress, reserveId, userAddress);
  return hasDebtFromPosition(position);
}

/**
 * Check if a user has supplied collateral in a reserve
 *
 * @param spokeAddress - Aave Spoke contract address
 * @param reserveId - Reserve ID
 * @param userAddress - User's proxy contract address
 * @returns true if user has supplied collateral
 */
export async function hasCollateral(
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<boolean> {
  const position = await getUserPosition(spokeAddress, reserveId, userAddress);
  return position.suppliedShares > 0n;
}
