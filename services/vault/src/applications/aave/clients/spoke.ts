/**
 * Aave Spoke Client - Read operations
 *
 * Vault-side wrapper that injects ethClient into SDK functions.
 * Used to fetch live user position data (debt, collateral) from the Core Spoke.
 */

import type {
  AaveSpokeUserAccountData,
  AaveSpokeUserPosition,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import {
  getCollateralFactor as sdkGetCollateralFactor,
  getLiquidationBonus as sdkGetLiquidationBonus,
  getTargetHealthFactor as sdkGetTargetHealthFactor,
  getUserAccountData as sdkGetUserAccountData,
  getUserPosition as sdkGetUserPosition,
  getUserTotalDebt as sdkGetUserTotalDebt,
  hasCollateral as sdkHasCollateral,
  hasDebt as sdkHasDebt,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";

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
  return sdkGetUserAccountData(publicClient, spokeAddress, userAddress);
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
  return sdkGetUserPosition(publicClient, spokeAddress, reserveId, userAddress);
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
  const publicClient = ethClient.getPublicClient();
  return sdkHasDebt(publicClient, spokeAddress, reserveId, userAddress);
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
  const publicClient = ethClient.getPublicClient();
  return sdkHasCollateral(publicClient, spokeAddress, reserveId, userAddress);
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
  return sdkGetUserTotalDebt(
    publicClient,
    spokeAddress,
    reserveId,
    userAddress,
  );
}

/**
 * Get the target health factor (THF) from the Core Spoke contract.
 *
 * @param spokeAddress - Core Spoke contract address
 * @returns THF in WAD format (1e18 = 1.0)
 */
export async function getTargetHealthFactor(
  spokeAddress: Address,
): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();
  return sdkGetTargetHealthFactor(publicClient, spokeAddress);
}

/**
 * Get the collateral factor (CF) from the Core Spoke contract.
 *
 * @param spokeAddress - Core Spoke contract address
 * @returns CF in BPS (10000 = 100%)
 */
export async function getCollateralFactor(
  spokeAddress: Address,
): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();
  return sdkGetCollateralFactor(publicClient, spokeAddress);
}

/**
 * Get the liquidation bonus (LB) from the Core Spoke contract.
 *
 * @param spokeAddress - Core Spoke contract address
 * @returns LB in WAD format (1e18 = 1.0)
 */
export async function getLiquidationBonus(
  spokeAddress: Address,
): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();
  return sdkGetLiquidationBonus(publicClient, spokeAddress);
}

// Re-export types
export type { AaveSpokeUserAccountData, AaveSpokeUserPosition };
