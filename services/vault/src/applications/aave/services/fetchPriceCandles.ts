/**
 * OHLC price candles from the vault indexer, for the liquidation Timeline.
 *
 * The indexer rolls every oracle `PriceUpdated` into candles keyed by FEED,
 * not by reserve — vaultBTC and WBTC both price off the same BTC/USD feed — so
 * a reserve must first be resolved through `aavePriceFeedSource`. That is why
 * this is two sequential requests rather than one.
 *
 * Scaling comes from the candle row's own `decimals` (the feed's decimals,
 * mirroring the oracle's scale), never a hardcoded exponent: the indexer
 * stores prices as raw feed integers.
 */

import type { Candle } from "@babylonlabs-io/core-ui";
import { gql } from "graphql-request";

import { graphqlClient } from "../../../clients/graphql";

/**
 * Candle bucket widths, matching the indexer's `aave_price_interval` enum.
 * The names carry an underscore because GraphQL enum members cannot start
 * with a digit.
 */
export type PriceCandleInterval = "hour_1" | "hour_4" | "day_1";

const MS_PER_SECOND = 1_000;

interface FeedSourceResponse {
  aavePriceFeedSource: { feed: string } | null;
}

interface CandleItem {
  bucketStart: string;
  open: string;
  high: string;
  low: string;
  close: string;
  decimals: number;
}

interface CandlesResponse {
  aavePriceCandles: { items: CandleItem[] };
}

const GET_PRICE_FEED_SOURCE = gql`
  query GetAavePriceFeedSource($reserveId: BigInt!) {
    aavePriceFeedSource(id: $reserveId) {
      feed
    }
  }
`;

const GET_PRICE_CANDLES = gql`
  query GetAavePriceCandles(
    $feed: String!
    $interval: aave_price_interval!
    $limit: Int!
  ) {
    aavePriceCandles(
      where: { feed: $feed, interval: $interval }
      orderBy: "bucketStart"
      orderDirection: "desc"
      limit: $limit
    ) {
      items {
        bucketStart
        open
        high
        low
        close
        decimals
      }
    }
  }
`;

/**
 * Indexer data is external input on a chart the depositor reads prices off, so
 * a malformed row throws rather than silently plotting a wrong candle. An
 * empty `items` array is the one valid-empty case (a feed with no history yet).
 */
function parsePrice(raw: string, scale: number, field: string): number {
  const value = Number(raw) / scale;
  if (!Number.isFinite(value)) {
    throw new Error(
      `Price candle has a non-finite "${field}": ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

function toCandle(item: CandleItem): Candle {
  if (!Number.isInteger(item.decimals) || item.decimals < 0) {
    throw new Error(
      `Price candle has invalid decimals: ${JSON.stringify(item.decimals)}`,
    );
  }
  const scale = 10 ** item.decimals;
  const timeSeconds = Number(item.bucketStart);
  if (!Number.isFinite(timeSeconds)) {
    throw new Error(
      `Price candle has a non-finite bucketStart: ${JSON.stringify(item.bucketStart)}`,
    );
  }
  return {
    time: timeSeconds * MS_PER_SECOND,
    open: parsePrice(item.open, scale, "open"),
    high: parsePrice(item.high, scale, "high"),
    low: parsePrice(item.low, scale, "low"),
    close: parsePrice(item.close, scale, "close"),
  };
}

/**
 * Candles for the reserve's price feed, oldest first (the chart draws left to
 * right). Returns `[]` when the reserve has no feed registered yet.
 */
export async function fetchPriceCandles({
  reserveId,
  interval,
  limit,
  signal,
}: {
  reserveId: bigint;
  interval: PriceCandleInterval;
  limit: number;
  signal?: AbortSignal;
}): Promise<Candle[]> {
  const { aavePriceFeedSource } =
    await graphqlClient.request<FeedSourceResponse>({
      document: GET_PRICE_FEED_SOURCE,
      variables: { reserveId: reserveId.toString() },
      signal,
    });

  if (!aavePriceFeedSource) return [];

  const { aavePriceCandles } = await graphqlClient.request<CandlesResponse>({
    document: GET_PRICE_CANDLES,
    variables: { feed: aavePriceFeedSource.feed, interval, limit },
    signal,
  });

  // The indexer serves newest first so `limit` takes the most recent window.
  return aavePriceCandles.items.map(toCandle).reverse();
}
