/**
 * Aave Value Conversion Utilities
 *
 * Converts Aave on-chain values to human-readable numbers.
 */

import {
  AAVE_BASE_CURRENCY_DECIMALS,
  AAVE_BASE_CURRENCY_RAY_DECIMALS,
  WAD_DECIMALS,
} from "../constants.js";

/**
 * Convert Aave base currency value to USD
 *
 * Aave uses 1e26 = $1 USD for collateral values.
 *
 * @param value - Value in Aave base currency (1e26 = $1)
 * @returns Value in USD
 */
export function aaveValueToUsd(value: bigint): number {
  return Number(value) / 10 ** AAVE_BASE_CURRENCY_DECIMALS;
}

/**
 * Convert Aave RAY-scaled base currency value to USD
 *
 * Debt values use higher precision: 1e53 = $1 USD.
 *
 * @param value - Value in RAY-scaled base currency (1e53 = $1)
 * @returns Value in USD
 */
export function aaveRayValueToUsd(value: bigint): number {
  return Number(value) / 10 ** AAVE_BASE_CURRENCY_RAY_DECIMALS;
}

/**
 * Convert Aave WAD value to number
 *
 * WAD is used for health factor and collateral factor (1e18 = 1.0).
 *
 * @param value - Value in WAD (1e18 = 1.0)
 * @returns Decimal number
 */
export function wadToNumber(value: bigint): number {
  return Number(value) / 10 ** WAD_DECIMALS;
}
