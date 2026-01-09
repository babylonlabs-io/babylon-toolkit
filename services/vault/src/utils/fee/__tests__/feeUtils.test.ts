import { describe, expect, it, vi } from "vitest";

import { nextPowerOfTwo } from "../nextPowerOfTwo";

vi.mock("@/config/pegin", () => ({
  LOCAL_PEGIN_CONFIG: {
    defaultFeeRate: 100,
  },
}));

const { getFeeRateFromMempool } = await import("../getFeeRateFromMempool");

describe("Fee Utilities", () => {
  describe("nextPowerOfTwo", () => {
    it("should throw RangeError for zero", () => {
      expect(() => nextPowerOfTwo(0)).toThrow(RangeError);
      expect(() => nextPowerOfTwo(0)).toThrow(
        "nextPowerOfTwo: x must be a positive number",
      );
    });

    it("should throw RangeError for negative numbers", () => {
      expect(() => nextPowerOfTwo(-1)).toThrow(RangeError);
      expect(() => nextPowerOfTwo(-100)).toThrow(RangeError);
    });

    it("should return 2 for x = 1", () => {
      expect(nextPowerOfTwo(1)).toBe(2);
    });

    it("should return 4 for x = 2", () => {
      expect(nextPowerOfTwo(2)).toBe(4);
    });

    it("should return 8 for x = 3 or 4", () => {
      expect(nextPowerOfTwo(3)).toBe(8);
      expect(nextPowerOfTwo(4)).toBe(8);
    });

    it("should return 16 for x = 5 through 8", () => {
      expect(nextPowerOfTwo(5)).toBe(16);
      expect(nextPowerOfTwo(6)).toBe(16);
      expect(nextPowerOfTwo(7)).toBe(16);
      expect(nextPowerOfTwo(8)).toBe(16);
    });

    it("should handle typical fee rate values", () => {
      expect(nextPowerOfTwo(50)).toBe(128);
      expect(nextPowerOfTwo(100)).toBe(256);
      expect(nextPowerOfTwo(150)).toBe(512);
    });
  });

  describe("getFeeRateFromMempool", () => {
    const DEFAULT_FEE_RATE = 100;
    const LEAST_MAX_FEE_RATE = 128;

    it("should return fallback values when mempoolFeeRates is undefined", () => {
      const result = getFeeRateFromMempool(undefined);

      expect(result).toEqual({
        minFeeRate: DEFAULT_FEE_RATE,
        defaultFeeRate: DEFAULT_FEE_RATE,
        maxFeeRate: LEAST_MAX_FEE_RATE,
      });
    });

    it("should return correct fee rates when mempoolFeeRates is provided", () => {
      const mempoolFeeRates = {
        fastestFee: 50,
        halfHourFee: 40,
        hourFee: 30,
        economyFee: 20,
        minimumFee: 10,
      };

      const result = getFeeRateFromMempool(mempoolFeeRates);

      expect(result.minFeeRate).toBe(30);
      expect(result.defaultFeeRate).toBe(50);
      expect(result.maxFeeRate).toBe(LEAST_MAX_FEE_RATE);
    });

    it("should use nextPowerOfTwo for maxFeeRate when it exceeds LEAST_MAX_FEE_RATE", () => {
      const mempoolFeeRates = {
        fastestFee: 100,
        halfHourFee: 80,
        hourFee: 60,
        economyFee: 40,
        minimumFee: 20,
      };

      const result = getFeeRateFromMempool(mempoolFeeRates);

      expect(result.minFeeRate).toBe(60);
      expect(result.defaultFeeRate).toBe(100);
      expect(result.maxFeeRate).toBe(256);
    });

    it("should use LEAST_MAX_FEE_RATE when nextPowerOfTwo is smaller", () => {
      const mempoolFeeRates = {
        fastestFee: 10,
        halfHourFee: 8,
        hourFee: 6,
        economyFee: 4,
        minimumFee: 2,
      };

      const result = getFeeRateFromMempool(mempoolFeeRates);

      expect(result.minFeeRate).toBe(6);
      expect(result.defaultFeeRate).toBe(10);
      expect(result.maxFeeRate).toBe(LEAST_MAX_FEE_RATE);
    });
  });
});
