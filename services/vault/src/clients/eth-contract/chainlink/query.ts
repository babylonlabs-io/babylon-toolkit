/**
 * Chainlink Price Feed Client
 *
 * Fetches BTC/USD price from Chainlink's decentralized oracle network.
 * This provides a reliable, independent price source not tied to any specific DeFi protocol.
 *
 * Price Feed Addresses:
 * - Mainnet: 0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c
 * - Sepolia: 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43
 */

import { getBTCNetwork } from "@babylonlabs-io/config";
import { Network } from "@babylonlabs-io/wallet-connector";
import type { Address } from "viem";

import { ethClient } from "../client";

/**
 * Chainlink BTC/USD price feed addresses by network
 */
export const CHAINLINK_BTC_USD_FEEDS: Record<Network, Address> = {
  [Network.MAINNET]: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
  // Signet uses Sepolia testnet for ETH side
  [Network.SIGNET]: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
  // Testnet - using Sepolia as fallback
  [Network.TESTNET]: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
};

/**
 * Get the Chainlink BTC/USD feed address for the current network
 *
 * Uses @babylonlabs-io/config to determine the network based on NEXT_PUBLIC_BTC_NETWORK.
 * - mainnet -> Ethereum mainnet Chainlink feed
 * - signet -> Sepolia testnet Chainlink feed
 *
 * @returns Chainlink BTC/USD feed address
 */
export function getChainlinkBTCUSDFeedAddress(): Address {
  const network = getBTCNetwork();
  return CHAINLINK_BTC_USD_FEEDS[network];
}

/**
 * Chainlink AggregatorV3 ABI - minimal interface for reading price data
 * Full spec: https://docs.chain.link/data-feeds/api-reference#latestrounddata
 */
const CHAINLINK_AGGREGATOR_V3_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Response from Chainlink's latestRoundData
 */
export interface ChainlinkRoundData {
  roundId: bigint;
  answer: bigint;
  startedAt: bigint;
  updatedAt: bigint;
  answeredInRound: bigint;
}

/**
 * Get latest price data from Chainlink price feed
 *
 * @param feedAddress - Address of the Chainlink price feed contract
 * @returns Round data including price (answer field)
 */
export async function getLatestRoundData(
  feedAddress: Address,
): Promise<ChainlinkRoundData> {
  const publicClient = ethClient.getPublicClient();

  const [roundId, answer, startedAt, updatedAt, answeredInRound] =
    await publicClient.readContract({
      address: feedAddress,
      abi: CHAINLINK_AGGREGATOR_V3_ABI,
      functionName: "latestRoundData",
    });

  return {
    roundId,
    answer,
    startedAt,
    updatedAt,
    answeredInRound,
  };
}

/**
 * Get the number of decimals for the price feed
 * BTC/USD feeds typically use 8 decimals
 *
 * @param feedAddress - Address of the Chainlink price feed contract
 * @returns Number of decimals
 */
export async function getDecimals(feedAddress: Address): Promise<number> {
  const publicClient = ethClient.getPublicClient();

  const decimals = await publicClient.readContract({
    address: feedAddress,
    abi: CHAINLINK_AGGREGATOR_V3_ABI,
    functionName: "decimals",
  });

  return decimals;
}

/**
 * Get BTC price in USD from Chainlink oracle
 *
 * Automatically uses the correct feed address based on the configured network.
 * Chainlink BTC/USD feeds return price with 8 decimals.
 *
 * @returns BTC price in USD as a number
 * @throws Error if price data is stale (older than 1 hour)
 */
export async function getBTCPriceUSD(): Promise<number> {
  const feedAddress = getChainlinkBTCUSDFeedAddress();
  const roundData = await getLatestRoundData(feedAddress);

  // Validate answer is positive (can be 0 or negative on oracle malfunction)
  if (roundData.answer <= 0n) {
    throw new Error("Invalid BTC price from Chainlink oracle");
  }

  // Validate price is fresh (within 1 hour)
  if (!isPriceFresh(roundData)) {
    throw new Error("Chainlink BTC/USD price data is stale");
  }

  // Chainlink BTC/USD uses 8 decimals
  // answer = price * 10^8, so divide by 10^8 to get USD price
  return Number(roundData.answer) / 1e8;
}

/**
 * Validate that price data is fresh (not stale)
 * Chainlink recommends checking updatedAt is recent
 *
 * @param roundData - Round data from getLatestRoundData
 * @param maxAgeSeconds - Maximum age in seconds (default: 3600 = 1 hour)
 * @returns true if data is fresh, false if stale
 */
export function isPriceFresh(
  roundData: ChainlinkRoundData,
  maxAgeSeconds: number = 3600,
): boolean {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const age = now - roundData.updatedAt;
  return age <= BigInt(maxAgeSeconds);
}
