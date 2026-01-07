/**
 * Chainlink Price Feed Client
 *
 * Fetches token prices in USD from Chainlink's decentralized oracle network.
 * This provides a reliable, independent price source not tied to any specific DeFi protocol.
 *
 * Supported tokens: BTC, ETH, USDC, USDT, DAI
 */

import { getBTCNetwork } from "@babylonlabs-io/config";
import { Network } from "@babylonlabs-io/wallet-connector";
import type { Address } from "viem";

import { ethClient } from "../client";

type TokenSymbol = "BTC" | "ETH" | "USDC" | "USDT" | "DAI";

type ChainlinkFeedAddresses = Record<TokenSymbol, Address | null>;

const CHAINLINK_PRICE_FEEDS: Record<Network, ChainlinkFeedAddresses> = {
  [Network.MAINNET]: {
    BTC: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
    ETH: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    USDC: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
    USDT: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
    DAI: "0xAed0c38402a5d19df6E4c03F4E2DcEd6e29c1ee9",
  },
  [Network.SIGNET]: {
    BTC: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
    ETH: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    USDC: null,
    USDT: null,
    DAI: null,
  },
  [Network.TESTNET]: {
    BTC: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
    ETH: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    USDC: null,
    USDT: null,
    DAI: null,
  },
};

function getChainlinkFeedAddress(symbol: string): Address | null {
  const network = getBTCNetwork();
  const normalizedSymbol = symbol.toUpperCase();

  if (normalizedSymbol === "WETH") {
    return CHAINLINK_PRICE_FEEDS[network].ETH;
  }

  if (normalizedSymbol === "VBTC" || normalizedSymbol === "SBTC") {
    return CHAINLINK_PRICE_FEEDS[network].BTC;
  }

  const feeds = CHAINLINK_PRICE_FEEDS[network];
  return feeds[normalizedSymbol as TokenSymbol] ?? null;
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
 * Note: If price data is stale (older than 1 hour), a warning is logged but
 * the last known price is still returned. This is common on testnets.
 *
 * @returns BTC price in USD as a number
 * @throws Error if price is invalid (zero or negative)
 */
export async function getBTCPriceUSD(): Promise<number> {
  const feedAddress = getChainlinkFeedAddress("BTC")!;
  const roundData = await getLatestRoundData(feedAddress);

  // Validate answer is positive (can be 0 or negative on oracle malfunction)
  if (roundData.answer <= 0n) {
    throw new Error(
      "Invalid BTC price from Chainlink oracle: price must be positive",
    );
  }

  // Warn if price is stale (older than 1 hour) but still return it
  // This is common on testnets where Chainlink doesn't update frequently
  if (!isPriceFresh(roundData)) {
    const ageSeconds =
      Math.floor(Date.now() / 1000) - Number(roundData.updatedAt);
    const ageHours = (ageSeconds / 3600).toFixed(1);
    console.warn(
      `Chainlink BTC/USD price data is stale (${ageHours} hours old). Using last known price.`,
    );
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

async function fetchPriceFromFeed(feedAddress: Address): Promise<number> {
  const roundData = await getLatestRoundData(feedAddress);

  if (roundData.answer <= 0n) {
    throw new Error(
      "Invalid price from Chainlink oracle: price must be positive",
    );
  }

  if (!isPriceFresh(roundData)) {
    const ageSeconds =
      Math.floor(Date.now() / 1000) - Number(roundData.updatedAt);
    const ageHours = (ageSeconds / 3600).toFixed(1);
    console.warn(
      `Chainlink price data is stale (${ageHours} hours old). Using last known price.`,
    );
  }

  return Number(roundData.answer) / 1e8;
}

export async function getTokenPrices(
  symbols: string[],
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  const pricePromises = symbols.map(async (symbol) => {
    const normalizedSymbol = symbol.toUpperCase();
    const feedAddress = getChainlinkFeedAddress(normalizedSymbol);

    if (!feedAddress) {
      if (["USDC", "USDT", "DAI"].includes(normalizedSymbol)) {
        prices[symbol] = 1.0;
      }
      return;
    }

    try {
      const price = await fetchPriceFromFeed(feedAddress);
      prices[symbol] = price;

      if (normalizedSymbol === "ETH") {
        prices["WETH"] = price;
      }
      if (normalizedSymbol === "BTC") {
        prices["vBTC"] = price;
        prices["sBTC"] = price;
      }
    } catch (error) {
      console.warn(`Failed to fetch price for ${symbol}:`, error);
    }
  });

  await Promise.all(pricePromises);

  return prices;
}
