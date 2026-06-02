/**
 * Aave Value Conversion Utilities
 *
 * Converts Aave on-chain values to human-readable numbers.
 */

import {
  AAVE_BASE_CURRENCY_DECIMALS,
  AAVE_BASE_CURRENCY_RAY_DECIMALS,
  RAY_DECIMALS,
  WAD_DECIMALS,
} from "../constants.js";

/** Exponent applied to a RAY-scaled fraction to express it as a percentage. */
const RAY_RATE_PERCENT_DECIMALS = RAY_DECIMALS - 2;

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

/**
 * Convert a RAY-scaled annual rate to a percentage.
 *
 * Aave annualized rates are RAY-scaled (1e27 = 100%). Dividing by 1e25 yields
 * the annual percentage (e.g. a 3.7% APR is stored as 3.7e25 and returns 3.7).
 *
 * @param rateRay - RAY-scaled annual rate (1e27 = 100%)
 * @returns Annual percentage (e.g. 3.7 for 3.7%)
 */
export function rayRateToAprPercent(rateRay: bigint): number {
  return Number(rateRay) / 10 ** RAY_RATE_PERCENT_DECIMALS;
}
