import { describe, expect, it } from "vitest";

import type { PriceMetadata } from "@/clients/eth-contract/chainlink";

import { hasUnhealthyPrice } from "../priceHealth";

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
