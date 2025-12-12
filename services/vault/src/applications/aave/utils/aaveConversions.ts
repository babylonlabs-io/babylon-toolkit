/**
 * Aave Value Conversion Utilities
 *
 * Converts Aave on-chain values to human-readable numbers.
 */

import { AAVE_BASE_CURRENCY_DECIMALS, WAD_DECIMALS } from "../constants";

/**
 * Convert Aave base currency value to USD
 *
 * Aave uses 1e26 = $1 USD for collateral and debt values.
 *
 * @param value - Value in Aave base currency (1e26 = $1)
 * @returns Value in USD
 */
export function aaveValueToUsd(value: bigint): number {
  return Number(value) / 10 ** AAVE_BASE_CURRENCY_DECIMALS;
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
