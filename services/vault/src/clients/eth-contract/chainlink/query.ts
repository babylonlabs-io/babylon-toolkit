/**
 * Chainlink Price Feed Client
 *
 * Fetches token prices in USD from Chainlink's decentralized oracle network.
 * This provides a reliable, independent price source not tied to any specific DeFi protocol.
 *
 * Supported tokens: BTC, ETH, USDC, USDT, DAI
 */

import { Network } from "@babylonlabs-io/wallet-connector";
import type { Address } from "viem";

import { ENV } from "@/config/env";
import { getBTCNetwork } from "@/config/network";
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

let btcPriceFeedOverrideWarned = false;

function getChainlinkFeedAddress(symbol: string): Address | null {
  const network = getBTCNetwork();
  const normalizedSymbol = symbol.toUpperCase();

  // vBTC: 1:1 synthetic BTC by protocol design. sBTC: FE display symbol for BTC on signet.
  // WBTC is NOT here — it has real depeg risk; Aave borrow flow sources it from the Aave oracle.
  if (
    normalizedSymbol === "BTC" ||
    normalizedSymbol === "VBTC" ||
    normalizedSymbol === "SBTC"
  ) {
    if (ENV.BTC_PRICE_FEED) {
      if (!btcPriceFeedOverrideWarned) {
        logger.warn(
          `Using BTC_PRICE_FEED env override (${ENV.BTC_PRICE_FEED}) instead of hardcoded Chainlink address`,
        );
        btcPriceFeedOverrideWarned = true;
      }
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

interface FeedReadout {
  price: number;
  metadata: PriceMetadata;
}

/** Apply a per-feed result to all symbols served by that feed (including aliases). */
function emitForSymbol(
  symbol: string,
  result: { price?: number; metadata: PriceMetadata },
  prices: Record<string, number>,
  metadata: Record<string, PriceMetadata>,
) {
  if (result.price !== undefined) prices[symbol] = result.price;
  metadata[symbol] = result.metadata;

  const normalized = symbol.toUpperCase();
  if (normalized === "ETH") {
    if (result.price !== undefined) prices["WETH"] = result.price;
    metadata["WETH"] = result.metadata;
  }
  if (normalized === "BTC") {
    if (result.price !== undefined) {
      prices["vBTC"] = result.price;
      prices["sBTC"] = result.price;
    }
    metadata["vBTC"] = result.metadata;
    metadata["sBTC"] = result.metadata;
  }
}

/**
 * Translate one feed's raw multicall results into a price + metadata, or an
 * error metadata entry if either call failed or the price is invalid.
 */
function readoutForFeed(
  feedAddress: Address,
  roundDataResult: {
    status: "success" | "failure";
    result?: unknown;
    error?: Error;
  },
  decimalsResult: {
    status: "success" | "failure";
    result?: unknown;
    error?: Error;
  },
): FeedReadout | { error: string } {
  if (roundDataResult.status !== "success") {
    return {
      error:
        roundDataResult.error?.message ??
        `Chainlink ${feedAddress} latestRoundData failed`,
    };
  }
  if (decimalsResult.status !== "success") {
    return {
      error:
        decimalsResult.error?.message ??
        `Chainlink ${feedAddress} decimals failed`,
    };
  }

  const [roundId, answer, startedAt, updatedAt, answeredInRound] =
    roundDataResult.result as readonly [bigint, bigint, bigint, bigint, bigint];
  const decimals = decimalsResult.result as number;

  if (answer <= 0n) {
    return {
      error: "Invalid price from Chainlink oracle: price must be positive",
    };
  }
  if (answer > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { error: `Chainlink price exceeds safe integer range: ${answer}` };
  }

  const roundData: ChainlinkRoundData = {
    roundId,
    answer,
    startedAt,
    updatedAt,
    answeredInRound,
  };
  const ageSeconds = Math.floor(Date.now() / 1000) - Number(updatedAt);
  const isStale = !isPriceFresh(roundData);

  if (isStale) {
    if (answeredInRound < roundId) {
      logger.event(
        `Chainlink price data is stale: incomplete round (answeredInRound=${answeredInRound} < roundId=${roundId}). Using last known price.`,
      );
    } else {
      const ageHours = (ageSeconds / SECONDS_PER_HOUR).toFixed(1);
      logger.event(
        `Chainlink price data is stale (${ageHours} hours old). Using last known price.`,
      );
    }
  }

  return {
    price: Number(answer) / 10 ** decimals,
    metadata: { isStale, ageSeconds, fetchFailed: false },
  };
}

export async function getTokenPrices(
  symbols: string[],
): Promise<TokenPricesResult> {
  const prices: Record<string, number> = {};
  const metadata: Record<string, PriceMetadata> = {};

  // Group requested symbols by feed address. BTC + vBTC + sBTC share one
  // feed; we want one set of multicall entries per UNIQUE feed and to emit
  // results to every symbol that maps to it.
  const symbolsByFeed = new Map<Address, string[]>();
  for (const symbol of symbols) {
    const feed = getChainlinkFeedAddress(symbol);
    if (!feed) continue;
    const list = symbolsByFeed.get(feed);
    if (list) list.push(symbol);
    else symbolsByFeed.set(feed, [symbol]);
  }
  if (symbolsByFeed.size === 0) return { prices, metadata };

  const uniqueFeeds = [...symbolsByFeed.keys()];
  // One round-trip: latestRoundData + decimals × N feeds.
  const contracts = uniqueFeeds.flatMap(
    (address) =>
      [
        {
          address,
          abi: CHAINLINK_AGGREGATOR_V3_ABI,
          functionName: "latestRoundData",
        },
        {
          address,
          abi: CHAINLINK_AGGREGATOR_V3_ABI,
          functionName: "decimals",
        },
      ] as const,
  );

  const publicClient = ethClient.getPublicClient();
  let results;
  try {
    results = await publicClient.multicall({
      contracts,
      allowFailure: true,
    });
  } catch (error) {
    // Network-level multicall failure (RPC timeout, etc.). Mark every
    // requested symbol failed so consumers fail closed rather than display
    // stale or undefined prices.
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Chainlink multicall failed`, { error: errorMessage });
    const failedMetadata: PriceMetadata = {
      isStale: false,
      ageSeconds: 0,
      fetchFailed: true,
      error: errorMessage,
    };
    for (const feedSymbols of symbolsByFeed.values()) {
      for (const symbol of feedSymbols) {
        emitForSymbol(symbol, { metadata: failedMetadata }, prices, metadata);
      }
    }
    return { prices, metadata };
  }

  uniqueFeeds.forEach((feedAddress, feedIdx) => {
    const roundDataResult = results[feedIdx * 2];
    const decimalsResult = results[feedIdx * 2 + 1];
    const feedSymbols = symbolsByFeed.get(feedAddress) ?? [];

    const readout = readoutForFeed(
      feedAddress,
      roundDataResult,
      decimalsResult,
    );

    if ("error" in readout) {
      logger.warn(`Failed to fetch price for feed ${feedAddress}`, {
        error: readout.error,
      });
      const failedMetadata: PriceMetadata = {
        isStale: false,
        ageSeconds: 0,
        fetchFailed: true,
        error: readout.error,
      };
      for (const symbol of feedSymbols) {
        emitForSymbol(symbol, { metadata: failedMetadata }, prices, metadata);
      }
      return;
    }

    for (const symbol of feedSymbols) {
      emitForSymbol(
        symbol,
        { price: readout.price, metadata: readout.metadata },
        prices,
        metadata,
      );
    }
  });

  return { prices, metadata };
}
