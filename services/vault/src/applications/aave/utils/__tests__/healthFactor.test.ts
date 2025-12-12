/**
 * Tests for health factor utilities
 */

import { describe, expect, it } from "vitest";

import { formatHealthFactor, isHealthFactorHealthy } from "../healthFactor";

describe("healthFactor", () => {
  describe("formatHealthFactor", () => {
    it("should format health factor to 2 decimal places", () => {
      expect(formatHealthFactor(1.5)).toBe("1.50");
    });

    it("should format whole numbers with decimals", () => {
      expect(formatHealthFactor(2)).toBe("2.00");
    });

    it("should format small health factors", () => {
      expect(formatHealthFactor(0.85)).toBe("0.85");
    });

    it("should return '-' for null (no debt)", () => {
      expect(formatHealthFactor(null)).toBe("-");
    });

    it("should handle very large health factors", () => {
      expect(formatHealthFactor(100.123)).toBe("100.12");
    });

    it("should round to 2 decimal places", () => {
      expect(formatHealthFactor(1.999)).toBe("2.00");
      expect(formatHealthFactor(1.001)).toBe("1.00");
    });
  });

  describe("isHealthFactorHealthy", () => {
    it("should return true for health factor >= 1.0", () => {
      expect(isHealthFactorHealthy(1.0)).toBe(true);
      expect(isHealthFactorHealthy(1.5)).toBe(true);
      expect(isHealthFactorHealthy(2.0)).toBe(true);
    });

    it("should return false for health factor < 1.0", () => {
      expect(isHealthFactorHealthy(0.99)).toBe(false);
      expect(isHealthFactorHealthy(0.5)).toBe(false);
      expect(isHealthFactorHealthy(0)).toBe(false);
    });

    it("should return true for null (no debt = healthy)", () => {
      expect(isHealthFactorHealthy(null)).toBe(true);
    });

    it("should return true for exactly 1.0", () => {
      expect(isHealthFactorHealthy(1.0)).toBe(true);
    });
  });
});
