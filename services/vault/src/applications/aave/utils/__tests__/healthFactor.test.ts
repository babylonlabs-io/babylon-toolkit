/**
 * Tests for health factor utilities
 */

import { describe, expect, it } from "vitest";

import {
  calculateHealthFactor,
  formatHealthFactor,
  isHealthFactorHealthy,
} from "../healthFactor";

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

  describe("calculateHealthFactor", () => {
    it("should calculate health factor correctly", () => {
      // HF = (Collateral * LT) / Debt
      // HF = (100 * 0.80) / 50 = 1.6
      expect(calculateHealthFactor(100, 50, 8000)).toBe(1.6);
    });

    it("should return 0 when debt is 0", () => {
      expect(calculateHealthFactor(100, 0, 8000)).toBe(0);
    });

    it("should return 0 when debt is negative", () => {
      expect(calculateHealthFactor(100, -10, 8000)).toBe(0);
    });

    it("should handle 75% liquidation threshold", () => {
      // HF = (100 * 0.75) / 50 = 1.5
      expect(calculateHealthFactor(100, 50, 7500)).toBe(1.5);
    });

    it("should calculate health factor close to 1 (liquidation risk)", () => {
      // HF = (100 * 0.80) / 80 = 1.0
      expect(calculateHealthFactor(100, 80, 8000)).toBe(1.0);
    });

    it("should handle real-world values", () => {
      // Collateral: $63.57, Debt: $10.00, LT: 75%
      // HF = (63.57 * 0.75) / 10 = 4.77
      const hf = calculateHealthFactor(63.57, 10, 7500);
      expect(hf).toBeCloseTo(4.77, 2);
    });
  });
});
