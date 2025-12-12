/**
 * Aave Spoke Client - Read operations
 *
 * Provides read operations for interacting with Aave v4 Spoke contracts.
 * Used to fetch live user position data (debt, collateral) from the Core Spoke.
 *
 * Note: Reserve data should be fetched from the indexer via fetchReserves.ts
 * since it doesn't need to be live and benefits from caching.
 */

import { type Abi, type Address } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";
import { executeMulticall } from "../../../clients/eth-contract/multicall-helpers";
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

/** Position result type from contract */
type PositionResult = {
  drawnShares: bigint;
  premiumShares: bigint;
  realizedPremiumRay: bigint;
  premiumOffsetRay: bigint;
  suppliedShares: bigint;
  dynamicConfigKey: number;
};

/**
 * Maps contract result to AaveSpokeUserPosition
 */
function mapPositionResult(result: PositionResult): AaveSpokeUserPosition {
  return {
    drawnShares: result.drawnShares,
    premiumShares: result.premiumShares,
    realizedPremiumRay: result.realizedPremiumRay,
    premiumOffsetRay: result.premiumOffsetRay,
    suppliedShares: result.suppliedShares,
    dynamicConfigKey: result.dynamicConfigKey,
  };
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

  return mapPositionResult(result as PositionResult);
}

/** Input for bulk position fetch */
export interface GetUserPositionInput {
  reserveId: bigint;
  userAddress: Address;
}

/**
 * Get multiple user positions in a single multicall
 *
 * More efficient than calling getUserPosition multiple times.
 * Uses shared executeMulticall helper to batch all requests into one RPC call.
 *
 * @param spokeAddress - Aave Spoke contract address
 * @param inputs - Array of {reserveId, userAddress} to fetch
 * @returns Array of user position data (same order as inputs, failed requests filtered out)
 */
export async function getUserPositions(
  spokeAddress: Address,
  inputs: GetUserPositionInput[],
): Promise<AaveSpokeUserPosition[]> {
  if (inputs.length === 0) {
    return [];
  }

  const publicClient = ethClient.getPublicClient();

  const results = await executeMulticall<PositionResult>(
    publicClient,
    spokeAddress,
    AaveSpokeABI as Abi,
    "getUserPosition",
    inputs.map((input) => [input.reserveId, input.userAddress]),
  );

  return results.map(mapPositionResult);
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
