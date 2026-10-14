/**
 * Chainlink Price Feed Client
 *
 * Fetches token prices in USD from Chainlink's decentralized oracle network.
 * This provides a reliable, independent price source not tied to any specific DeFi protocol.
 *
 * Supported tokens: BTC, ETH, USDC, USDT, DAI
 */

import type { Address } from "viem";

import { ENV } from "@/config/env";
import { getNetworkConfigETH } from "@/config/network";
import {
  ETH_MAINNET_CHAIN_ID,
  ETH_SEPOLIA_CHAIN_ID,
} from "@/config/network/constants";
import { logger } from "@/infrastructure";

import { ethClient } from "../client";

type TokenSymbol = "BTC" | "ETH" | "USDC" | "USDT" | "DAI";

/** One Chainlink proxy: where to read it and how often it promises to update. */
interface ChainlinkFeed {
  address: Address;
  /** Longest gap between updates the aggregator commits to, absent a deviation trigger. */
  heartbeatSeconds: number;
}

/** BTC and ETH exist on every chain the app runs on; stablecoins may be absent. */
interface ChainlinkFeedTable {
  BTC: ChainlinkFeed;
  ETH: ChainlinkFeed;
  USDC: ChainlinkFeed | null;
  USDT: ChainlinkFeed | null;
  DAI: ChainlinkFeed | null;
}

const ONE_HOUR_SECONDS = 3600;
const TWENTY_THREE_HOURS_SECONDS = 82_800;
const ONE_DAY_SECONDS = 86_400;

// Addresses and heartbeats from Chainlink's feed registry, the JSON that
// docs.chain.link renders (reference-data-directory.vercel.app/feeds-*.json).
export const CHAINLINK_PRICE_FEEDS: Record<
  typeof ETH_MAINNET_CHAIN_ID | typeof ETH_SEPOLIA_CHAIN_ID,
  ChainlinkFeedTable
> = {
  [ETH_MAINNET_CHAIN_ID]: {
    BTC: {
      address: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
      heartbeatSeconds: ONE_HOUR_SECONDS,
    },
    ETH: {
      address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
      heartbeatSeconds: ONE_HOUR_SECONDS,
    },
    USDC: {
      address: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
      heartbeatSeconds: TWENTY_THREE_HOURS_SECONDS,
    },
    USDT: {
      address: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
      heartbeatSeconds: ONE_DAY_SECONDS,
    },
    DAI: {
      address: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
      heartbeatSeconds: ONE_HOUR_SECONDS,
    },
  },
  [ETH_SEPOLIA_CHAIN_ID]: {
    BTC: {
      address: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
      heartbeatSeconds: ONE_HOUR_SECONDS,
    },
    ETH: {
      address: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
      heartbeatSeconds: ONE_HOUR_SECONDS,
    },
    USDC: null,
    USDT: null,
    DAI: null,
  },
};

/**
 * Grace period added to the heartbeat before calling a feed stale.
 *
 * A feed is *contractually* allowed to be one full heartbeat old, and real
 * updates routinely land a few minutes late (block time, gas, deviation-trigger
 * jitter). Comparing age against the bare heartbeat therefore flagged the tail
 * of every normal heartbeat window — which is why the reported ages clustered
 * at 1.0-1.2 hours and made this the highest-volume event in the project, while
 * also blanking the liquidation UI on a perfectly healthy feed.
 */
const CHAINLINK_STALENESS_GRACE_SECONDS = 600;

/**
 * How far the client clock may run behind chain time before freshness becomes
 * unknowable. `updatedAt` is compared against `Date.now()`, so a device clock
 * that is behind yields a NEGATIVE age; `age <= maxAge` then reports "fresh"
 * for arbitrarily old data — a fail-open on the check that guards the
 * health-factor path. Skew beyond this bound is treated as stale instead.
 */
const MAX_CLIENT_CLOCK_SKEW_SECONDS = 300;

/** Number of seconds in one hour — used for display formatting */
const SECONDS_PER_HOUR = 3600;

// Each unique feed contributes this many calls, in this order, to the grouped
// multicall built in `getTokenPrices`. Keep these in sync with the per-feed
// entries in the `contracts` flatMap below — the result read-back indexes by
// `feedIdx * CALLS_PER_FEED + <offset>`.
const CALLS_PER_FEED = 2;
const ROUND_DATA_OFFSET = 0;
const DECIMALS_OFFSET = 1;

let btcPriceFeedOverrideWarned = false;

function getChainlinkFeed(symbol: string): ChainlinkFeed | null {
  const feeds =
    CHAINLINK_PRICE_FEEDS[
      getNetworkConfigETH().chainId as keyof typeof CHAINLINK_PRICE_FEEDS
    ];
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
      // The override feed publishes no heartbeat; keep the conservative BTC window.
      return {
        address: ENV.BTC_PRICE_FEED,
        heartbeatSeconds: feeds.BTC.heartbeatSeconds,
      };
    }
    return feeds.BTC;
  }

  if (normalizedSymbol === "WETH" || normalizedSymbol === "ETH") {
    return feeds.ETH;
  }

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
  /** Whether the price data is older than the heartbeat plus its grace window */
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
 * @param maxAgeSeconds - Maximum age in seconds (the feed's heartbeat plus grace)
 * @returns true if data is fresh, false if stale
 */
export function isPriceFresh(
  roundData: ChainlinkRoundData,
  maxAgeSeconds: number,
): boolean {
  if (roundData.answeredInRound < roundData.roundId) return false;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const age = now - roundData.updatedAt;
  // A negative age means the client clock is behind chain time. A small skew is
  // ordinary and the round really is fresh; past that we cannot tell fresh from
  // ancient, so fail closed rather than pass everything.
  if (age < 0n) return -age <= BigInt(MAX_CLIENT_CLOCK_SKEW_SECONDS);
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
 * Feeds already reported stale this session. A stale price feed is a legitimate
 * signal (bad collateral valuation), but every component that reads the price
 * re-runs this, so an undeduped event fires dozens of times per stale episode.
 * Emit once when a feed goes stale and clear the flag when it reports fresh
 * again, so a later stale episode re-alerts. Module-scoped — the signal is about
 * the feed, not any caller.
 */
const reportedStaleFeeds = new Set<string>();

/** Test-only: the dedup store outlives any single call. */
export function resetStaleFeedReporting(): void {
  reportedStaleFeeds.clear();
}

/**
 * Translate one feed's raw multicall results into a price + metadata, or an
 * error metadata entry if either call failed or the price is invalid.
 */
function readoutForFeed(
  feed: ChainlinkFeed,
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
        `Chainlink ${feed.address} latestRoundData failed`,
    };
  }
  if (decimalsResult.status !== "success") {
    return {
      error:
        decimalsResult.error?.message ??
        `Chainlink ${feed.address} decimals failed`,
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
  const isStale = !isPriceFresh(
    roundData,
    feed.heartbeatSeconds + CHAINLINK_STALENESS_GRACE_SECONDS,
  );

  const feedKey = feed.address.toLowerCase();
  if (isStale) {
    // One event per stale episode; subsequent reads while still stale are silent.
    // Messages are kept literal — interpolating the age or the round numbers
    // made every distinct value its own Sentry issue, so the condition could
    // never be seen as a single trend.
    if (!reportedStaleFeeds.has(feedKey)) {
      reportedStaleFeeds.add(feedKey);
      if (answeredInRound < roundId) {
        logger.event(
          "Chainlink price data is stale: incomplete round. Using last known price.",
          {
            tags: { staleReason: "incomplete-round", feed: feedKey },
            roundId: roundId.toString(),
            answeredInRound: answeredInRound.toString(),
          },
        );
      } else if (ageSeconds < 0) {
        logger.event(
          "Chainlink price data rejected: client clock is behind chain time. Using last known price.",
          {
            tags: { staleReason: "clock-skew", feed: feedKey },
            skewSeconds: -ageSeconds,
          },
        );
      } else {
        logger.event("Chainlink price data is stale. Using last known price.", {
          tags: { staleReason: "age", feed: feedKey },
          ageHours: (ageSeconds / SECONDS_PER_HOUR).toFixed(1),
          ageSeconds,
        });
      }
    }
  } else {
    // Recovered — allow the next stale episode for this feed to re-alert.
    reportedStaleFeeds.delete(feedKey);
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
  const symbolsByFeed = new Map<
    Address,
    { feed: ChainlinkFeed; symbols: string[] }
  >();
  for (const symbol of symbols) {
    const feed = getChainlinkFeed(symbol);
    if (!feed) continue;
    const entry = symbolsByFeed.get(feed.address);
    if (entry) entry.symbols.push(symbol);
    else symbolsByFeed.set(feed.address, { feed, symbols: [symbol] });
  }
  if (symbolsByFeed.size === 0) return { prices, metadata };

  const uniqueFeeds = [...symbolsByFeed.values()].map((entry) => entry.feed);
  // One round-trip: latestRoundData + decimals × N feeds.
  const contracts = uniqueFeeds.flatMap(
    ({ address }) =>
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
    for (const { symbols: feedSymbols } of symbolsByFeed.values()) {
      for (const symbol of feedSymbols) {
        emitForSymbol(symbol, { metadata: failedMetadata }, prices, metadata);
      }
    }
    return { prices, metadata };
  }

  uniqueFeeds.forEach((feed, feedIdx) => {
    const roundDataResult =
      results[feedIdx * CALLS_PER_FEED + ROUND_DATA_OFFSET];
    const decimalsResult = results[feedIdx * CALLS_PER_FEED + DECIMALS_OFFSET];
    const feedSymbols = symbolsByFeed.get(feed.address)?.symbols ?? [];

    const readout = readoutForFeed(feed, roundDataResult, decimalsResult);

    if ("error" in readout) {
      logger.warn(`Failed to fetch price for feed ${feed.address}`, {
        feedSymbols,
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
