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
    MAINNET: 0,
    SIGNET: 1,
    TESTNET: 2,
  },
}));

import type { ChainlinkRoundData } from "../query";
import { getTokenPrices, isPriceFresh } from "../query";

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
  });

  function mockFeedResponse(answer: bigint, decimals: number) {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    mockMulticall.mockResolvedValueOnce([
      [
        ROUND_ID,
        answer,
        nowSeconds - FRESH_AGE_SECONDS,
        nowSeconds - FRESH_AGE_SECONDS,
        ROUND_ID,
      ],
      decimals,
    ]);
  }

  it("returns correct price using dynamic decimals for 8-decimal feed", async () => {
    mockFeedResponse(BTC_ANSWER_8_DECIMALS, STANDARD_DECIMALS);

    const result = await getTokenPrices(["BTC"]);

    expect(result.prices["BTC"]).toBe(BTC_PRICE_USD);
    expect(result.metadata["BTC"].isStale).toBe(false);
    expect(result.metadata["BTC"].fetchFailed).toBe(false);
  });

  it("returns correct price using dynamic decimals for 18-decimal feed", async () => {
    mockFeedResponse(BTC_ANSWER_18_DECIMALS, 18);

    const result = await getTokenPrices(["BTC"]);

    expect(result.prices["BTC"]).toBe(BTC_PRICE_USD);
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
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    mockMulticall.mockResolvedValueOnce([
      [
        ROUND_ID,
        BTC_ANSWER_8_DECIMALS,
        nowSeconds - FRESH_AGE_SECONDS,
        nowSeconds - FRESH_AGE_SECONDS,
        INCOMPLETE_ANSWERED_IN_ROUND,
      ],
      STANDARD_DECIMALS,
    ]);

    const result = await getTokenPrices(["BTC"]);

    expect(result.prices["BTC"]).toBe(BTC_PRICE_USD);
    expect(result.metadata["BTC"].isStale).toBe(true);
  });

  it("marks metadata as stale when data exceeds max age", async () => {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    mockMulticall.mockResolvedValueOnce([
      [
        ROUND_ID,
        BTC_ANSWER_8_DECIMALS,
        nowSeconds - TWO_HOURS_SECONDS,
        nowSeconds - TWO_HOURS_SECONDS,
        ROUND_ID,
      ],
      STANDARD_DECIMALS,
    ]);

    const result = await getTokenPrices(["BTC"]);

    expect(result.metadata["BTC"].isStale).toBe(true);
  });

  it("stores error metadata when multicall fails", async () => {
    mockMulticall.mockRejectedValueOnce(new Error("RPC timeout"));

    const result = await getTokenPrices(["BTC"]);

    expect(result.prices["BTC"]).toBeUndefined();
    expect(result.metadata["BTC"].fetchFailed).toBe(true);
    expect(result.metadata["BTC"].error).toBe("RPC timeout");
  });

  it("stores error metadata for alias tokens when BTC fetch fails", async () => {
    mockMulticall.mockRejectedValueOnce(new Error("RPC timeout"));

    const result = await getTokenPrices(["BTC"]);

    expect(result.metadata["vBTC"].fetchFailed).toBe(true);
    expect(result.metadata["sBTC"].fetchFailed).toBe(true);
  });

  it("throws on non-positive price via getTokenPrices error handling", async () => {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    mockMulticall.mockResolvedValueOnce([
      [
        ROUND_ID,
        0n,
        nowSeconds - FRESH_AGE_SECONDS,
        nowSeconds - FRESH_AGE_SECONDS,
        ROUND_ID,
      ],
      STANDARD_DECIMALS,
    ]);

    const result = await getTokenPrices(["BTC"]);

    expect(result.prices["BTC"]).toBeUndefined();
    expect(result.metadata["BTC"].fetchFailed).toBe(true);
    expect(result.metadata["BTC"].error).toContain("price must be positive");
  });

  it("skips symbols with no feed address", async () => {
    const result = await getTokenPrices(["UNKNOWN_TOKEN"]);

    expect(result.prices["UNKNOWN_TOKEN"]).toBeUndefined();
    expect(result.metadata["UNKNOWN_TOKEN"]).toBeUndefined();
    expect(mockMulticall).not.toHaveBeenCalled();
  });
});
