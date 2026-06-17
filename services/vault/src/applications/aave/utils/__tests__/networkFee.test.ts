import { describe, expect, it } from "vitest";

import { canEstimateRepay, formatNetworkFee, weiToEth } from "../networkFee";

describe("weiToEth", () => {
  it("converts a whole-ETH wei amount", () => {
    expect(weiToEth(2n * 10n ** 18n)).toBe(2);
  });

  it("converts a sub-ETH wei amount", () => {
    // 0.000123 ETH = 123_000_000_000_000 wei
    expect(weiToEth(123_000_000_000_000n)).toBeCloseTo(0.000123, 12);
  });

  it("returns 0 for 0 wei", () => {
    expect(weiToEth(0n)).toBe(0);
  });

  it("keeps precision when the wei product exceeds Number.MAX_SAFE_INTEGER", () => {
    // 12 ETH + 345_678_900_000_000_000 wei remainder. The raw product
    // (12_345_678_900_000_000_000) is far above Number.MAX_SAFE_INTEGER
    // (~9.007e15); the whole/remainder split must not drop the fractional part.
    const wei = 12n * 10n ** 18n + 345_678_900_000_000_000n;
    expect(weiToEth(wei)).toBeCloseTo(12.3456789, 7);
  });
});

describe("formatNetworkFee", () => {
  it("shows ETH and USD when a price is available", () => {
    expect(formatNetworkFee(0.000123, 2000)).toBe("0.000123 ETH ($0.25 USD)");
  });

  it("omits USD when the ETH price is 0 (unavailable)", () => {
    expect(formatNetworkFee(0.000123, 0)).toBe("0.000123 ETH");
  });

  it("omits USD when the ETH price is negative", () => {
    expect(formatNetworkFee(0.000123, -1)).toBe("0.000123 ETH");
  });

  it("renders the ETH amount to 6 decimals", () => {
    expect(formatNetworkFee(1.23456789, 0)).toBe("1.234568 ETH");
  });

  it("groups thousands in the USD value", () => {
    expect(formatNetworkFee(1, 2500.5)).toBe("1.000000 ETH ($2,500.50 USD)");
  });
});

describe("canEstimateRepay", () => {
  it("allows estimation when allowance exceeds the amount", () => {
    expect(canEstimateRepay(1000n, 500n)).toBe(true);
  });

  it("allows estimation when allowance exactly equals the amount", () => {
    expect(canEstimateRepay(500n, 500n)).toBe(true);
  });

  it("blocks estimation when allowance is below the amount", () => {
    expect(canEstimateRepay(499n, 500n)).toBe(false);
  });

  it("blocks estimation when allowance is zero (pre-approval)", () => {
    expect(canEstimateRepay(0n, 500n)).toBe(false);
  });

  it("blocks estimation for a zero amount even with allowance", () => {
    expect(canEstimateRepay(1000n, 0n)).toBe(false);
  });
});
