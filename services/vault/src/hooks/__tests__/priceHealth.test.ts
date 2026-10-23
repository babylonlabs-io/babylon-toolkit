import { describe, expect, it } from "vitest";

import type { PriceMetadata } from "@/clients/eth-contract/chainlink";

import { hasUnhealthyPrice, usablePriceUsd } from "../priceHealth";

const fresh: PriceMetadata = {
  isStale: false,
  ageSeconds: 30,
  fetchFailed: false,
};
const stale: PriceMetadata = {
  isStale: true,
  ageSeconds: 7200,
  fetchFailed: false,
};
const failed: PriceMetadata = {
  isStale: false,
  ageSeconds: 0,
  fetchFailed: true,
};

describe("hasUnhealthyPrice", () => {
  it("is false when metadata is undefined (not yet loaded)", () => {
    expect(hasUnhealthyPrice(undefined)).toBe(false);
  });

  it("is false when every price is fresh", () => {
    expect(hasUnhealthyPrice({ BTC: fresh, ETH: fresh })).toBe(false);
  });

  it("is true when any price is stale", () => {
    expect(hasUnhealthyPrice({ BTC: stale, ETH: fresh })).toBe(true);
  });

  it("is true when any price fetch failed", () => {
    expect(hasUnhealthyPrice({ BTC: fresh, ETH: failed })).toBe(true);
  });
});

describe("usablePriceUsd", () => {
  it("returns the price when its oracle round is fresh", () => {
    expect(usablePriceUsd({ BTC: 95_000 }, { BTC: fresh }, "BTC")).toBe(95_000);
  });

  it("returns null before prices have loaded", () => {
    expect(usablePriceUsd({}, {}, "BTC")).toBeNull();
  });

  it("returns null when its round is stale, even though the last answer is present", () => {
    expect(usablePriceUsd({ BTC: 95_000 }, { BTC: stale }, "BTC")).toBeNull();
  });

  it("returns null when its price fetch failed, even with a price present", () => {
    expect(usablePriceUsd({ BTC: 95_000 }, { BTC: failed }, "BTC")).toBeNull();
  });

  it("returns null when a fresh round answers zero", () => {
    expect(usablePriceUsd({ BTC: 0 }, { BTC: fresh }, "BTC")).toBeNull();
  });

  it("judges only the requested token's feed", () => {
    expect(
      usablePriceUsd(
        { BTC: 95_000, ETH: 3_000 },
        { BTC: fresh, ETH: failed },
        "BTC",
      ),
    ).toBe(95_000);
  });
});
