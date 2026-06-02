/**
 * Tests for Aave value conversion utilities
 */

import { describe, expect, it } from "vitest";

import {
  aaveRayValueToUsd,
  aaveValueToUsd,
  rayRateToAprPercent,
  wadToNumber,
} from "../aaveConversions.js";

describe("aaveConversions", () => {
  describe("aaveValueToUsd", () => {
    it("should convert 1e26 to $1 USD", () => {
      const value = 10n ** 26n;
      expect(aaveValueToUsd(value)).toBeCloseTo(1);
    });

    it("should convert 100e26 to $100 USD", () => {
      const value = 100n * 10n ** 26n;
      expect(aaveValueToUsd(value)).toBeCloseTo(100);
    });

    it("should convert 0 to $0 USD", () => {
      expect(aaveValueToUsd(0n)).toBe(0);
    });

    it("should handle fractional USD values", () => {
      // 0.5 USD = 0.5 * 1e26
      // toBeCloseTo: dividing a 25+ digit BigInt by 1e26 rounds to the
      // nearest representable double, which loses sub-cent precision.
      const value = 5n * 10n ** 25n;
      expect(aaveValueToUsd(value)).toBeCloseTo(0.5);
    });

    it("should handle large values", () => {
      // $1,000,000 USD
      const value = 1_000_000n * 10n ** 26n;
      expect(aaveValueToUsd(value)).toBeCloseTo(1_000_000);
    });
  });

  describe("aaveRayValueToUsd", () => {
    it("should convert 1e53 to $1 USD", () => {
      const value = 10n ** 53n;
      expect(aaveRayValueToUsd(value)).toBe(1);
    });

    it("should convert 100e53 to $100 USD", () => {
      const value = 100n * 10n ** 53n;
      expect(aaveRayValueToUsd(value)).toBeCloseTo(100);
    });

    it("should convert 0 to $0 USD", () => {
      expect(aaveRayValueToUsd(0n)).toBe(0);
    });

    it("should handle fractional USD values", () => {
      // toBeCloseTo: dividing a 52+ digit BigInt by 1e53 rounds to the
      // nearest representable double, which loses sub-cent precision.
      const value = 5n * 10n ** 52n;
      expect(aaveRayValueToUsd(value)).toBeCloseTo(0.5);
    });
  });

  describe("wadToNumber", () => {
    it("should convert 1e18 to 1.0", () => {
      const value = 10n ** 18n;
      expect(wadToNumber(value)).toBe(1);
    });

    it("should convert 1.5e18 to 1.5", () => {
      const value = 15n * 10n ** 17n;
      expect(wadToNumber(value)).toBe(1.5);
    });

    it("should convert 0 to 0", () => {
      expect(wadToNumber(0n)).toBe(0);
    });

    it("should handle health factor of 2.0", () => {
      const value = 2n * 10n ** 18n;
      expect(wadToNumber(value)).toBe(2);
    });

    it("should handle health factor below 1.0 (liquidatable)", () => {
      // 0.8 health factor
      const value = 8n * 10n ** 17n;
      expect(wadToNumber(value)).toBe(0.8);
    });

    it("should handle very large health factor", () => {
      // 100 health factor (very safe position)
      const value = 100n * 10n ** 18n;
      expect(wadToNumber(value)).toBe(100);
    });
  });

  describe("rayRateToAprPercent", () => {
    it("should convert 1e27 (RAY) to 100%", () => {
      expect(rayRateToAprPercent(10n ** 27n)).toBeCloseTo(100);
    });

    it("should convert 3.7e25 to 3.7%", () => {
      // 3.7% APR is stored as 0.037 * 1e27 = 3.7e25
      const value = 37n * 10n ** 24n;
      expect(rayRateToAprPercent(value)).toBeCloseTo(3.7);
    });

    it("should convert a fractional rate (0.4%)", () => {
      // 0.4% APR = 0.004 * 1e27 = 4e24
      const value = 4n * 10n ** 24n;
      expect(rayRateToAprPercent(value)).toBeCloseTo(0.4);
    });

    it("should convert 0 to 0%", () => {
      expect(rayRateToAprPercent(0n)).toBe(0);
    });
  });
});
