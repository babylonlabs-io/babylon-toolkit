/**
 * Chainlink Oracle client for fetching asset prices
 */

import type { Address } from 'viem';
import { ethClient } from '../client';
import { network } from '@babylonlabs-io/config';

/**
 * Chainlink AggregatorV3Interface ABI (minimal for price fetching)
 */
const CHAINLINK_AGGREGATOR_ABI = [
  {
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Mock BTC price for localhost (in USD with 8 decimals)
 * Using ~$100,000 as a reasonable test value
 */
const MOCK_BTC_PRICE_USD = 100_000_00000000n; // $100,000 with 8 decimals

/**
 * Get BTC price from Chainlink oracle or mock for localhost
 * @param oracleAddress - Oracle contract address (or "1" for localhost mock)
 * @returns BTC price in USD with decimals info
 */
export async function getBTCPrice(oracleAddress: Address): Promise<{
  price: bigint;
  decimals: number;
}> {
  const publicClient = ethClient.getPublicClient();
  const chainId = await publicClient.getChainId();

  // For localhost or mock oracle address, return mock price
  const isLocalhost = network === 'localhost' || chainId === 31337;
  const isMockOracle =
    oracleAddress === '0x0000000000000000000000000000000000000001' ||
    oracleAddress === '0x1' ||
    BigInt(oracleAddress) === 1n;

  if (isLocalhost || isMockOracle) {
    return {
      price: MOCK_BTC_PRICE_USD,
      decimals: 8,
    };
  }

  try {
    // Query Chainlink oracle for real price
    const [latestRoundData, decimals] = await Promise.all([
      publicClient.readContract({
        address: oracleAddress,
        abi: CHAINLINK_AGGREGATOR_ABI,
        functionName: 'latestRoundData',
      }),
      publicClient.readContract({
        address: oracleAddress,
        abi: CHAINLINK_AGGREGATOR_ABI,
        functionName: 'decimals',
      }),
    ]);

    const [, answer] = latestRoundData;

    return {
      price: answer,
      decimals,
    };
  } catch (error) {
    // Fallback to mock if oracle fails
    return {
      price: MOCK_BTC_PRICE_USD,
      decimals: 8,
    };
  }
}

/**
 * Format price to human readable USD string
 * @param price - Price in smallest unit
 * @param decimals - Number of decimals
 * @returns Formatted price string (e.g., "100000.00")
 */
export function formatPriceToUSD(price: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const usdPrice = Number(price) / Number(divisor);
  return usdPrice.toFixed(2);
}
