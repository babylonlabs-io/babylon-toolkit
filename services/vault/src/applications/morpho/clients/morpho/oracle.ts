/**
 * Morpho Oracle - Read operations for Morpho market price feeds
 *
 * Each Morpho market has its own oracle that determines collateral/loan pricing
 * for liquidation calculations. This is different from general price feeds like Chainlink.
 */

import type { Address } from "viem";

import { ethClient } from "../../../../clients/eth-contract/client";

/**
 * Morpho Oracle ABI - minimal interface for reading prices
 * Morpho uses a custom oracle interface that returns price with 36 decimals
 */
const MORPHO_ORACLE_ABI = [
  {
    inputs: [],
    name: "price",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Get price from Morpho market oracle
 * Morpho oracles return prices with 36 decimals (price of 1 collateral token in loan token)
 * For BTC/USDC market: returns how many USDC (with 6 decimals) equals 1 BTC (with 8 decimals)
 * Price = USDC amount * 10^(36 - 6) / BTC amount * 10^(36 - 8)
 * Simplified: price * 10^6 / 10^8 = USDC per BTC (in normal units)
 *
 * @param oracleAddress - Address of the Morpho oracle contract
 * @returns Price with 36 decimals
 */
export async function getOraclePrice(oracleAddress: Address): Promise<bigint> {
  const publicClient = ethClient.getPublicClient();

  const price = await publicClient.readContract({
    address: oracleAddress,
    abi: MORPHO_ORACLE_ABI,
    functionName: "price",
  });

  return price;
}

/**
 * Convert Morpho oracle price to human-readable BTC price in USD
 * Morpho price has 36 decimals and represents: (loan token amount in smallest unit × 10^36) / (collateral token amount in smallest unit)
 * For vBTC (18 decimals) / USDC (6 decimals) market:
 * - Oracle price = (USDC × 10^36) / vBTC
 * - To get price in USD per BTC: price / 10^36 × 10^18 / 10^6 = price / 10^24
 *
 * @param oraclePrice - Price from oracle (36 decimals)
 * @returns BTC price in USD as a number
 */
export function convertOraclePriceToUSD(oraclePrice: bigint): number {
  // For vBTC(18 decimals)/USDC(6 decimals): divide by 10^24 to get USDC per BTC
  // Using Number is safe for prices up to ~$9 billion BTC (beyond Number.MAX_SAFE_INTEGER / 10^24)
  return Number(oraclePrice) / 1e24;
}
