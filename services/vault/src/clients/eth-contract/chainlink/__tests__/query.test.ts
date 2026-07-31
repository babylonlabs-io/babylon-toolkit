import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMulticall = vi.fn();

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      multicall: mockMulticall,
    }),
  },
}));

vi.mock("@/infrastructure", () => ({
  logger: {
    event: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/config/env", () => ({
  ENV: {
    BTC_PRICE_FEED: null,
  },
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  Network: {
    MAINNET: "mainnet",
    SIGNET: "signet",
    TESTNET: "testnet",
  },
}));

vi.mock("@/config/network", () => ({
  getBTCNetwork: vi.fn(() => "signet"),
}));

import type { ChainlinkRoundData } from "../query";
import {
  getTokenPrices,
  isPriceFresh,
  resetStaleFeedReporting,
} from "../query";

/** Simulated Chainlink round ID for test fixtures */
const ROUND_ID = 100n;

/** BTC price in USD used across test fixtures */
const BTC_PRICE_USD = 65000;

/** BTC price as Chainlink 8-decimal answer */
const BTC_ANSWER_8_DECIMALS = BigInt(BTC_PRICE_USD) * 10n ** 8n;

/** BTC price as Chainlink 18-decimal answer */
const BTC_ANSWER_18_DECIMALS = BigInt(BTC_PRICE_USD) * 10n ** 18n;

/** ETH price in USD */
const ETH_PRICE_USD = 2500;

/** ETH price as Chainlink 8-decimal answer */
const ETH_ANSWER_8_DECIMALS = BigInt(ETH_PRICE_USD) * 10n ** 8n;

/** Chainlink standard feed precision (8 decimals) */
const STANDARD_DECIMALS = 8;

/** Age in seconds for "fresh" test data */
const FRESH_AGE_SECONDS = 10n;

/** answeredInRound value representing an incomplete oracle round */
const INCOMPLETE_ANSWERED_IN_ROUND = 99n;

/** Two hours in seconds — exceeds the 1-hour staleness threshold */
const TWO_HOURS_SECONDS = 7200n;

function makeRoundData(
  overrides: Partial<ChainlinkRoundData> = {},
): ChainlinkRoundData {
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  return {
    roundId: ROUND_ID,
    answer: BTC_ANSWER_8_DECIMALS,
    startedAt: nowSeconds - FRESH_AGE_SECONDS,
    updatedAt: nowSeconds - FRESH_AGE_SECONDS,
    answeredInRound: ROUND_ID,
    ...overrides,
  };
}

describe("isPriceFresh", () => {
  it("returns true when round is complete and data is fresh", () => {
    const roundData = makeRoundData();
    expect(isPriceFresh(roundData)).toBe(true);
  });

  it("returns false when answeredInRound < roundId (incomplete round)", () => {
    const roundData = makeRoundData({
      roundId: ROUND_ID,
      answeredInRound: INCOMPLETE_ANSWERED_IN_ROUND,
    });
    expect(isPriceFresh(roundData)).toBe(false);
  });

  it("returns false when data age exceeds max threshold", () => {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const roundData = makeRoundData({
      updatedAt: nowSeconds - TWO_HOURS_SECONDS,
    });
    expect(isPriceFresh(roundData)).toBe(false);
  });

  it("respects custom maxAgeSeconds parameter", () => {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const roundData = makeRoundData({
      updatedAt: nowSeconds - 60n,
    });
    expect(isPriceFresh(roundData, 30)).toBe(false);
    expect(isPriceFresh(roundData, 120)).toBe(true);
  });
});

describe("getTokenPrices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The stale-feed dedup store is module-scoped and outlives a single test.
    resetStaleFeedReporting();
  });

  /**
   * Multicall returns one entry per contract call when `allowFailure: true`,
   * shaped as `{ status: "success" | "failure", result?, error? }`.
   * `getTokenPrices` issues [latestRoundData, decimals] per feed in a single
   * batched multicall — these helpers build that array.
   */
  function makeFeedResult(
    answer: bigint,
    decimals: number,
    options: {
      updatedAt?: bigint;
      answeredInRound?: bigint;
    } = {},
  ) {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const updatedAt = options.updatedAt ?? nowSeconds - FRESH_AGE_SECONDS;
    const answeredInRound = options.answeredInRound ?? ROUND_ID;
    return [
      {
        status: "success" as const,
        result: [ROUND_ID, answer, updatedAt, updatedAt, answeredInRound],
      },
      { status: "success" as const, result: decimals },
    ];
  }

  function mockFeedResponse(answer: bigint, decimals: number) {
    mockMulticall.mockResolvedValueOnce(makeFeedResult(answer, decimals));
  }

  it("returns correct price using dynamic decimals for 8-decimal feed", async () => {
    mockFeedResponse(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS);

    const result = await getTokenPrices(["BTC"]);

    expect(result.prices["BTC"]).toBe(BTC_PRICE_USD);
    expect(result.metadata["BTC"].isStale).toBe(false);
    expect(result.metadata["BTC"].fetchFailed).toBe(false);
  });

  it("rejects 18-decimal feed answer that exceeds safe integer range", async () => {
    mockFeedResponse(BTC_ANSWER_18_DECIMALS, 18);

    const result = await getTokenPrices(["BTC"]);

    expect(result.prices["BTC"]).toBeUndefined();
    expect(result.metadata["BTC"].fetchFailed).toBe(true);
    expect(result.metadata["BTC"].error).toContain(
      "exceeds safe integer range",
    );
  });

  it("populates alias tokens for BTC (vBTC, sBTC)", async () => {
    mockFeedResponse(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS);

    const result = await getTokenPrices(["BTC"]);

    expect(result.prices["vBTC"]).toBe(BTC_PRICE_USD);
    expect(result.prices["sBTC"]).toBe(BTC_PRICE_USD);
    expect(result.metadata["vBTC"]).toEqual(result.metadata["BTC"]);
    expect(result.metadata["sBTC"]).toEqual(result.metadata["BTC"]);
  });

  it("populates alias token for ETH (WETH)", async () => {
    mockFeedResponse(ETH_ANSWER_8_DECIMALS, STANDARD_DECIMALS);

    const result = await getTokenPrices(["ETH"]);

    expect(result.prices["ETH"]).toBe(ETH_PRICE_USD);
    expect(result.prices["WETH"]).toBe(ETH_PRICE_USD);
    expect(result.metadata["WETH"]).toEqual(result.metadata["ETH"]);
  });

  it("marks metadata as stale when answeredInRound < roundId", async () => {
    mockMulticall.mockResolvedValueOnce(
      makeFeedResult(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS, {
        answeredInRound: INCOMPLETE_ANSWERED_IN_ROUND,
      }),
    );

    const result = await getTokenPrices(["BTC"]);

    expect(result.prices["BTC"]).toBe(BTC_PRICE_USD);
    expect(result.metadata["BTC"].isStale).toBe(true);
  });

  it("logs incomplete round message when answeredInRound < roundId", async () => {
    const { logger } = await import("@/infrastructure");
    mockMulticall.mockResolvedValueOnce(
      makeFeedResult(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS, {
        answeredInRound: INCOMPLETE_ANSWERED_IN_ROUND,
      }),
    );

    await getTokenPrices(["BTC"]);

    expect(logger.event).toHaveBeenCalledWith(
      expect.stringContaining("incomplete round"),
    );
  });

  it("logs age-based message when data exceeds max age", async () => {
    const { logger } = await import("@/infrastructure");
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    mockMulticall.mockResolvedValueOnce(
      makeFeedResult(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS, {
        updatedAt: nowSeconds - TWO_HOURS_SECONDS,
      }),
    );

    await getTokenPrices(["BTC"]);

    expect(logger.event).toHaveBeenCalledWith(
      expect.stringContaining("hours old"),
    );
  });

  it("marks metadata as stale when data exceeds max age", async () => {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    mockMulticall.mockResolvedValueOnce(
      makeFeedResult(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS, {
        updatedAt: nowSeconds - TWO_HOURS_SECONDS,
      }),
    );

    const result = await getTokenPrices(["BTC"]);

    expect(result.metadata["BTC"].isStale).toBe(true);
  });

  it("emits the stale event once per stale episode, not on every read", async () => {
    const { logger } = await import("@/infrastructure");
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const staleFeed = () =>
      makeFeedResult(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS, {
        updatedAt: nowSeconds - TWO_HOURS_SECONDS,
      });

    mockMulticall.mockResolvedValueOnce(staleFeed());
    await getTokenPrices(["BTC"]);
    mockMulticall.mockResolvedValueOnce(staleFeed());
    await getTokenPrices(["BTC"]);

    const staleEvents = vi
      .mocked(logger.event)
      .mock.calls.filter(([m]) => typeof m === "string" && m.includes("stale"));
    expect(staleEvents).toHaveLength(1);
  });

  it("still marks metadata stale on a deduped read (only the event is suppressed)", async () => {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const staleFeed = () =>
      makeFeedResult(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS, {
        updatedAt: nowSeconds - TWO_HOURS_SECONDS,
      });

    mockMulticall.mockResolvedValueOnce(staleFeed());
    await getTokenPrices(["BTC"]);
    mockMulticall.mockResolvedValueOnce(staleFeed());
    const second = await getTokenPrices(["BTC"]);

    // The UI's stale badge reads metadata, which must still report stale even
    // though the second read emitted no event.
    expect(second.metadata["BTC"].isStale).toBe(true);
  });

  it("re-emits the stale event after the feed recovers then goes stale again", async () => {
    const { logger } = await import("@/infrastructure");
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const staleFeed = () =>
      makeFeedResult(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS, {
        updatedAt: nowSeconds - TWO_HOURS_SECONDS,
      });

    mockMulticall.mockResolvedValueOnce(staleFeed());
    await getTokenPrices(["BTC"]); // stale → emit
    mockMulticall.mockResolvedValueOnce(
      makeFeedResult(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS),
    );
    await getTokenPrices(["BTC"]); // fresh → clears the dedup flag
    mockMulticall.mockResolvedValueOnce(staleFeed());
    await getTokenPrices(["BTC"]); // stale again → emit

    const staleEvents = vi
      .mocked(logger.event)
      .mock.calls.filter(([m]) => typeof m === "string" && m.includes("stale"));
    expect(staleEvents).toHaveLength(2);
  });

  it("propagates a multicall rejection instead of resolving with failed metadata", async () => {
    mockMulticall.mockRejectedValueOnce(new Error("RPC timeout"));

    await expect(getTokenPrices(["BTC"])).rejects.toThrow("RPC timeout");
  });

  it("throws on non-positive price via getTokenPrices error handling", async () => {
    mockMulticall.mockResolvedValueOnce(makeFeedResult(0n, STANDARD_DECIMALS));

    const result = await getTokenPrices(["BTC"]);

    expect(result.prices["BTC"]).toBeUndefined();
    expect(result.metadata["BTC"].fetchFailed).toBe(true);
    expect(result.metadata["BTC"].error).toContain("price must be positive");
  });

  it("rejects price exceeding safe integer range", async () => {
    const unsafeAnswer = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    mockFeedResponse(unsafeAnswer, STANDARD_DECIMALS);

    const result = await getTokenPrices(["BTC"]);

    expect(result.prices["BTC"]).toBeUndefined();
    expect(result.metadata["BTC"].fetchFailed).toBe(true);
    expect(result.metadata["BTC"].error).toContain(
      "exceeds safe integer range",
    );
  });

  it("logs warning when BTC_PRICE_FEED env override is active", async () => {
    const { ENV } = await import("@/config/env");
    const { logger } = await import("@/infrastructure");
    const originalFeed = ENV.BTC_PRICE_FEED;

    try {
      ENV.BTC_PRICE_FEED =
        "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;
      mockFeedResponse(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS);

      await getTokenPrices(["BTC"]);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("BTC_PRICE_FEED env override"),
      );
    } finally {
      ENV.BTC_PRICE_FEED = originalFeed;
    }
  });

  it("skips symbols with no feed address", async () => {
    const result = await getTokenPrices(["UNKNOWN_TOKEN"]);

    expect(result.prices["UNKNOWN_TOKEN"]).toBeUndefined();
    expect(result.metadata["UNKNOWN_TOKEN"]).toBeUndefined();
    expect(mockMulticall).not.toHaveBeenCalled();
  });

  it("batches multiple symbols into a single multicall round-trip", async () => {
    // BTC and ETH map to different feeds. getTokenPrices must issue ONE
    // multicall covering both feeds (4 calls total: latestRoundData +
    // decimals × 2 feeds) rather than two separate round-trips.
    mockMulticall.mockResolvedValueOnce([
      ...makeFeedResult(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS),
      ...makeFeedResult(ETH_ANSWER_8_DECIMALS, STANDARD_DECIMALS),
    ]);

    const result = await getTokenPrices(["BTC", "ETH"]);

    expect(mockMulticall).toHaveBeenCalledTimes(1);
    expect(result.prices["BTC"]).toBe(BTC_PRICE_USD);
    expect(result.prices["ETH"]).toBe(ETH_PRICE_USD);
  });

  it("isolates per-feed failures inside a batched multicall", async () => {
    // BTC feed reverts; ETH feed succeeds. Per-feed allowFailure must keep
    // the rest of the batch usable instead of poisoning every result.
    mockMulticall.mockResolvedValueOnce([
      { status: "failure", error: new Error("InvalidSource(BTC)") },
      { status: "failure", error: new Error("InvalidSource(BTC)") },
      ...makeFeedResult(ETH_ANSWER_8_DECIMALS, STANDARD_DECIMALS),
    ]);

    const result = await getTokenPrices(["BTC", "ETH"]);

    expect(result.metadata["BTC"].fetchFailed).toBe(true);
    expect(result.prices["BTC"]).toBeUndefined();
    expect(result.prices["ETH"]).toBe(ETH_PRICE_USD);
    expect(result.metadata["ETH"].fetchFailed).toBe(false);
  });

  it("throws when every call failed from one shared transport error", async () => {
    // viem's multicall does not reject on a transport failure when
    // allowFailure is set; it pushes the same rejection reason onto every
    // entry (viem multicall.ts, rejected-chunk branch). Throwing here is what
    // lets React Query retry and keep the last good prices on screen.
    const transportError = new Error("HTTP request failed");
    mockMulticall.mockResolvedValueOnce([
      { status: "failure", error: transportError, result: undefined },
      { status: "failure", error: transportError, result: undefined },
    ]);

    await expect(getTokenPrices(["BTC"])).rejects.toThrow(
      "HTTP request failed",
    );
  });

  it("does not throw when the only requested feed reverts on-chain", async () => {
    // Every entry is a failure here too, but each carries its own error
    // object — viem builds one per call via getContractError. That is a real
    // per-feed fault, not a dead transport, so it stays data.
    mockMulticall.mockResolvedValueOnce([
      { status: "failure", error: new Error("InvalidSource()") },
      { status: "failure", error: new Error("InvalidSource()") },
    ]);

    const result = await getTokenPrices(["BTC"]);

    expect(result.metadata["BTC"].fetchFailed).toBe(true);
    expect(result.prices["BTC"]).toBeUndefined();
  });

  it("deduplicates shared BTC aliases into one feed entry in a mixed-symbol batch", async () => {
    // vBTC and BTC both resolve to the BTC feed via getChainlinkFeedAddress.
    // The batch must collapse them to a single multicall entry pair
    // (latestRoundData + decimals) rather than re-fetching the same feed.
    mockMulticall.mockResolvedValueOnce([
      ...makeFeedResult(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS),
      ...makeFeedResult(ETH_ANSWER_8_DECIMALS, STANDARD_DECIMALS),
    ]);

    const result = await getTokenPrices(["BTC", "vBTC", "ETH"]);

    expect(mockMulticall).toHaveBeenCalledTimes(1);
    // 2 unique feeds × 2 calls each = 4 entries in the multicall contracts list.
    const callArgs = mockMulticall.mock.calls[0][0] as {
      contracts: unknown[];
    };
    expect(callArgs.contracts).toHaveLength(4);
    expect(result.prices["BTC"]).toBe(BTC_PRICE_USD);
    expect(result.prices["vBTC"]).toBe(BTC_PRICE_USD);
    expect(result.prices["sBTC"]).toBe(BTC_PRICE_USD);
    expect(result.prices["ETH"]).toBe(ETH_PRICE_USD);
    expect(result.prices["WETH"]).toBe(ETH_PRICE_USD);
  });
});
