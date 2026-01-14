/**
 * Tests for Aave value conversion utilities
 */

import { describe, expect, it } from "vitest";

import { aaveValueToUsd, wadToNumber } from "../aaveConversions.js";

describe("aaveConversions", () => {
  describe("aaveValueToUsd", () => {
    it("should convert 1e26 to $1 USD", () => {
      const value = 10n ** 26n;
      expect(aaveValueToUsd(value)).toBe(1);
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
      const value = 5n * 10n ** 25n;
      expect(aaveValueToUsd(value)).toBe(0.5);
    });

    it("should handle large values", () => {
      // $1,000,000 USD
      const value = 1_000_000n * 10n ** 26n;
      expect(aaveValueToUsd(value)).toBe(1_000_000);
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
});
