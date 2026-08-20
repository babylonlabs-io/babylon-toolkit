import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../clients/graphql", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

import { graphqlClient } from "../../../../clients/graphql";
import { fetchPriceCandles } from "../fetchPriceCandles";

const mockRequest = vi.mocked(graphqlClient.request);

const FEED = "0xa5c0105b71d9d2cadc151a1875a5b71c85abf8db";
const RESERVE_ID = 2n;

/** One day_1 row exactly as the indexer serves it: raw feed integers. */
const CANDLE_ROW = {
  bucketStart: "1787184000",
  open: "6968071223262",
  high: "7151025399874",
  low: "6893361300000",
  close: "7000000000000",
  decimals: 8,
};

function mockFeedThenCandles(items: unknown[]) {
  mockRequest
    .mockResolvedValueOnce({ aavePriceFeedSource: { feed: FEED } })
    .mockResolvedValueOnce({ aavePriceCandles: { items } });
}

function fetchDaily() {
  return fetchPriceCandles({
    reserveId: RESERVE_ID,
    interval: "day_1",
    limit: 3,
  });
}

describe("fetchPriceCandles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the reserve's feed before asking for its candles", async () => {
    mockFeedThenCandles([CANDLE_ROW]);

    await fetchDaily();

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest.mock.calls[0][0]).toMatchObject({
      variables: { reserveId: "2" },
    });
    expect(mockRequest.mock.calls[1][0]).toMatchObject({
      variables: { feed: FEED, interval: "day_1", limit: 3 },
    });
  });

  it("scales prices by the row's own decimals and converts seconds to ms", async () => {
    mockFeedThenCandles([CANDLE_ROW]);

    const [candle] = await fetchDaily();

    expect(candle).toEqual({
      time: 1_787_184_000_000,
      open: 69_680.71223262,
      high: 71_510.25399874,
      low: 68_933.613,
      close: 70_000,
    });
  });

  it("honours a feed that does not use 8 decimals", async () => {
    mockFeedThenCandles([
      {
        ...CANDLE_ROW,
        open: "6968071",
        high: "6968071",
        low: "6968071",
        close: "6968071",
        decimals: 2,
      },
    ]);

    const [candle] = await fetchDaily();

    expect(candle.open).toBe(69_680.71);
  });

  it("returns the series oldest first, whichever order the indexer served", async () => {
    mockFeedThenCandles([
      { ...CANDLE_ROW, bucketStart: "1787184000" },
      { ...CANDLE_ROW, bucketStart: "1787097600" },
    ]);

    const candles = await fetchDaily();

    expect(candles.map((c) => c.time)).toEqual([
      1_787_097_600_000, 1_787_184_000_000,
    ]);
  });

  it("returns nothing when the reserve has no feed registered", async () => {
    mockRequest.mockResolvedValueOnce({ aavePriceFeedSource: null });

    await expect(fetchDaily()).resolves.toEqual([]);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("returns an empty series for a feed with no history yet", async () => {
    mockFeedThenCandles([]);

    await expect(fetchDaily()).resolves.toEqual([]);
  });

  // A malformed row must never reach the chart as a plotted price.
  it("throws on a non-numeric price", async () => {
    mockFeedThenCandles([{ ...CANDLE_ROW, close: "not-a-price" }]);

    await expect(fetchDaily()).rejects.toThrow(/non-finite "close"/);
  });

  it("throws on invalid decimals rather than guessing a scale", async () => {
    mockFeedThenCandles([{ ...CANDLE_ROW, decimals: -1 }]);

    await expect(fetchDaily()).rejects.toThrow(/invalid decimals/);
  });
});
