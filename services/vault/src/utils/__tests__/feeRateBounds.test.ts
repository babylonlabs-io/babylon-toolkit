import { describe, expect, it } from "vitest";

import { MIN_RELAY_FEE_RATE_SATS_VB } from "@/constants";

import { getFeeRateBounds } from "../feeRateBounds";

describe("getFeeRateBounds", () => {
  it("floors minFeeRate at the min relay fee", () => {
    const bounds = getFeeRateBounds({ defaultFeeRate: 10, hourFeeRate: 2 });

    expect(bounds.minFeeRate).toBe(MIN_RELAY_FEE_RATE_SATS_VB);
    expect(bounds.defaultFeeRate).toBe(10);
  });

  it("caps at 128 when nextPowerOfTwo(fastest) is below 128", () => {
    // fastestFee=10 -> nextPowerOfTwo=32, below LEAST_MAX_FEE_RATE.
    const bounds = getFeeRateBounds({ defaultFeeRate: 10, hourFeeRate: 5 });

    expect(bounds.maxFeeRate).toBe(128);
  });

  it("caps at nextPowerOfTwo(fastest) when it exceeds 128", () => {
    // fastestFee=200 -> nextPowerOfTwo=512, above LEAST_MAX_FEE_RATE.
    const bounds = getFeeRateBounds({ defaultFeeRate: 200, hourFeeRate: 100 });

    expect(bounds.maxFeeRate).toBe(512);
  });

  it("returns the floor and 128 cap for zero fees", () => {
    const bounds = getFeeRateBounds({ defaultFeeRate: 0, hourFeeRate: 0 });

    expect(bounds.minFeeRate).toBe(MIN_RELAY_FEE_RATE_SATS_VB);
    expect(bounds.defaultFeeRate).toBe(0);
    expect(bounds.maxFeeRate).toBe(128);
  });
});
