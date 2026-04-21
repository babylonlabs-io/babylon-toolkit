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

import { ENV } from "@/config/env";
import { logger } from "@/infrastructure";

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

/** Maximum acceptable age for Chainlink price data (1 hour) */
const CHAINLINK_MAX_PRICE_AGE_SECONDS = 3600;

/** Number of seconds in one hour — used for display formatting */
const SECONDS_PER_HOUR = 3600;

function getChainlinkFeedAddress(symbol: string): Address | null {
  const network = getBTCNetwork();
  const normalizedSymbol = symbol.toUpperCase();

  if (
    normalizedSymbol === "BTC" ||
    normalizedSymbol === "VBTC" ||
    normalizedSymbol === "SBTC"
  ) {
    if (ENV.BTC_PRICE_FEED) {
      logger.warn(
        `Using BTC_PRICE_FEED env override (${ENV.BTC_PRICE_FEED}) instead of hardcoded Chainlink address`,
      );
      return ENV.BTC_PRICE_FEED;
    }
    return CHAINLINK_PRICE_FEEDS[network].BTC;
  }

  if (normalizedSymbol === "WETH" || normalizedSymbol === "ETH") {
    return CHAINLINK_PRICE_FEEDS[network].ETH;
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
 * Metadata about a price feed's freshness and status
 */
export interface PriceMetadata {
  /** Whether the price data is stale (older than 1 hour) */
  isStale: boolean;
  /** Age of the price data in seconds */
  ageSeconds: number;
  /** Whether fetching the price failed */
  fetchFailed: boolean;
  /** Error message if fetch failed */
  error?: string;
}

/**
 * Result of fetching token prices with metadata
 */
interface TokenPricesResult {
  /** Record mapping token symbols to their USD prices */
  prices: Record<string, number>;
  /** Metadata about price freshness and errors per token */
  metadata: Record<string, PriceMetadata>;
}

/**
 * Get latest price data and decimals from Chainlink price feed in a single RPC call.
 *
 * @param feedAddress - Address of the Chainlink price feed contract
 * @returns Round data including price (answer field) and feed decimals
 */
async function getLatestRoundDataWithDecimals(
  feedAddress: Address,
): Promise<{ roundData: ChainlinkRoundData; decimals: number }> {
  const publicClient = ethClient.getPublicClient();

  const [roundDataResult, decimalsResult] = await publicClient.multicall({
    contracts: [
      {
        address: feedAddress,
        abi: CHAINLINK_AGGREGATOR_V3_ABI,
        functionName: "latestRoundData",
      },
      {
        address: feedAddress,
        abi: CHAINLINK_AGGREGATOR_V3_ABI,
        functionName: "decimals",
      },
    ],
    allowFailure: false,
  });

  const [roundId, answer, startedAt, updatedAt, answeredInRound] =
    roundDataResult;

  return {
    roundData: {
      roundId,
      answer,
      startedAt,
      updatedAt,
      answeredInRound,
    },
    decimals: decimalsResult,
  };
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
  maxAgeSeconds: number = CHAINLINK_MAX_PRICE_AGE_SECONDS,
): boolean {
  if (roundData.answeredInRound < roundData.roundId) return false;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const age = now - roundData.updatedAt;
  return age <= BigInt(maxAgeSeconds);
}

async function fetchPriceFromFeed(
  feedAddress: Address,
): Promise<{ price: number; metadata: PriceMetadata }> {
  const { roundData, decimals } =
    await getLatestRoundDataWithDecimals(feedAddress);

  if (roundData.answer <= 0n) {
    throw new Error(
      "Invalid price from Chainlink oracle: price must be positive",
    );
  }

  const ageSeconds =
    Math.floor(Date.now() / 1000) - Number(roundData.updatedAt);
  const isStale = !isPriceFresh(roundData);

  if (roundData.answer > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `Chainlink price exceeds safe integer range: ${roundData.answer}`,
    );
  }

  if (isStale) {
    if (roundData.answeredInRound < roundData.roundId) {
      logger.event(
        `Chainlink price data is stale: incomplete round (answeredInRound=${roundData.answeredInRound} < roundId=${roundData.roundId}). Using last known price.`,
      );
    } else {
      const ageHours = (ageSeconds / SECONDS_PER_HOUR).toFixed(1);
      logger.event(
        `Chainlink price data is stale (${ageHours} hours old). Using last known price.`,
      );
    }
  }

  return {
    price: Number(roundData.answer) / 10 ** decimals,
    metadata: {
      isStale,
      ageSeconds,
      fetchFailed: false,
    },
  };
}

export async function getTokenPrices(
  symbols: string[],
): Promise<TokenPricesResult> {
  const prices: Record<string, number> = {};
  const metadata: Record<string, PriceMetadata> = {};

  const pricePromises = symbols.map(async (symbol) => {
    const normalizedSymbol = symbol.toUpperCase();
    const feedAddress = getChainlinkFeedAddress(normalizedSymbol);

    if (!feedAddress) {
      return;
    }

    try {
      const result = await fetchPriceFromFeed(feedAddress);
      prices[symbol] = result.price;
      metadata[symbol] = result.metadata;

      // Share price and metadata for alias tokens
      if (normalizedSymbol === "ETH") {
        prices["WETH"] = result.price;
        metadata["WETH"] = result.metadata;
      }
      if (normalizedSymbol === "BTC") {
        prices["vBTC"] = result.price;
        prices["sBTC"] = result.price;
        metadata["vBTC"] = result.metadata;
        metadata["sBTC"] = result.metadata;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to fetch price for ${symbol}`, {
        error: errorMessage,
      });

      // Store error metadata for this token
      metadata[symbol] = {
        isStale: false,
        ageSeconds: 0,
        fetchFailed: true,
        error: errorMessage,
      };

      // Also store error for alias tokens
      if (normalizedSymbol === "ETH") {
        metadata["WETH"] = metadata[symbol];
      }
      if (normalizedSymbol === "BTC") {
        metadata["vBTC"] = metadata[symbol];
        metadata["sBTC"] = metadata[symbol];
      }
    }
  });

  await Promise.all(pricePromises);

  return { prices, metadata };
}
