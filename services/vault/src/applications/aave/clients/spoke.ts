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
  getDynamicReserveConfig as sdkGetDynamicReserveConfig,
  getReserve as sdkGetReserve,
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
 * Get reserve data from the Core Spoke contract via the `getReserve` selector.
 *
 * Used as a fallback when reserve data is not available from the GraphQL indexer.
 * Note: distinct from the contract's separate `getReserveConfig` function.
 *
 * @param spokeAddress - Core Spoke contract address
 * @param reserveId - Reserve ID
 * @returns Reserve data including dynamicConfigKey
 */
export async function getReserve(spokeAddress: Address, reserveId: bigint) {
  const publicClient = ethClient.getPublicClient();
  return sdkGetReserve(publicClient, spokeAddress, reserveId);
}

/**
 * Get the dynamic reserve config from the Core Spoke contract.
 *
 * Returns collateral factor, max liquidation bonus, and liquidation fee
 * for a specific reserve and dynamic config key.
 *
 * @param spokeAddress - Core Spoke contract address
 * @param reserveId - Reserve ID (e.g., vBTC reserve ID from indexer config)
 * @param dynamicConfigKey - Dynamic config key (from reserve data)
 * @returns Dynamic reserve config with collateralFactor (BPS), maxLiquidationBonus (BPS), liquidationFee (BPS)
 */
export async function getDynamicReserveConfig(
  spokeAddress: Address,
  reserveId: bigint,
  dynamicConfigKey: number,
) {
  const publicClient = ethClient.getPublicClient();
  return sdkGetDynamicReserveConfig(
    publicClient,
    spokeAddress,
    reserveId,
    dynamicConfigKey,
  );
}

// Re-export types
export type { AaveSpokeUserAccountData, AaveSpokeUserPosition };
