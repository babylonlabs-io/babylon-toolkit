/**
 * Aave Spoke Client - Read operations
 *
 * Provides read operations for interacting with Aave v4 Spoke contracts.
 * Used to fetch live user position data (debt, collateral) from the Core Spoke.
 *
 * Note: Reserve data should be fetched from the indexer via fetchReserves.ts
 * since it doesn't need to be live and benefits from caching.
 */

import type { Address } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";
import { hasDebtFromPosition } from "../utils";

import AaveSpokeABI from "./abis/AaveSpoke.abi.json";

/**
 * User account data from the Spoke
 * Contains aggregated position health data calculated by Aave using on-chain oracle prices.
 */
export interface AaveSpokeUserAccountData {
  /** Risk premium in BPS */
  riskPremium: bigint;
  /** Weighted average collateral factor in WAD (1e18 = 100%) */
  avgCollateralFactor: bigint;
  /** Health factor in WAD (1e18 = 1.00) */
  healthFactor: bigint;
  /** Total collateral value in base currency (1e26 = $1 USD) */
  totalCollateralValue: bigint;
  /** Total debt value in base currency (1e26 = $1 USD) */
  totalDebtValue: bigint;
  /** Number of active collateral reserves */
  activeCollateralCount: bigint;
  /** Number of borrowed reserves */
  borrowedCount: bigint;
}

/** Account data result type from contract */
type AccountDataResult = {
  riskPremium: bigint;
  avgCollateralFactor: bigint;
  healthFactor: bigint;
  totalCollateralValue: bigint;
  totalDebtValue: bigint;
  activeCollateralCount: bigint;
  borrowedCount: bigint;
};

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
 * Get user account data from the Spoke
 *
 * Returns aggregated position health data including health factor, collateral value,
 * and debt value. These values are calculated by Aave using on-chain oracle prices
 * and are the authoritative values for liquidation decisions.
 *
 * @param spokeAddress - Aave Spoke contract address
 * @param userAddress - User's proxy contract address
 * @returns User account data with health factor and values
 */
export async function getUserAccountData(
  spokeAddress: Address,
  userAddress: Address,
): Promise<AaveSpokeUserAccountData> {
  const publicClient = ethClient.getPublicClient();

  const result = await publicClient.readContract({
    address: spokeAddress,
    abi: AaveSpokeABI,
    functionName: "getUserAccountData",
    args: [userAddress],
  });

  const data = result as AccountDataResult;
  return {
    riskPremium: data.riskPremium,
    avgCollateralFactor: data.avgCollateralFactor,
    healthFactor: data.healthFactor,
    totalCollateralValue: data.totalCollateralValue,
    totalDebtValue: data.totalDebtValue,
    activeCollateralCount: data.activeCollateralCount,
    borrowedCount: data.borrowedCount,
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

/**
 * Get user's total debt in a reserve (in token units, not shares)
 *
 * This returns the exact amount of tokens owed, including accrued interest.
 * Use this for full repayment to get the precise amount needed.
 *
 * @param spokeAddress - Aave Spoke contract address
 * @param reserveId - Reserve ID
 * @param userAddress - User's proxy contract address
 * @returns Total debt amount in token units (with token decimals)
 */
export async function getUserTotalDebt(
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();

  const result = await publicClient.readContract({
    address: spokeAddress,
    abi: AaveSpokeABI,
    functionName: "getUserTotalDebt",
    args: [reserveId, userAddress],
  });

  return result as bigint;
}
