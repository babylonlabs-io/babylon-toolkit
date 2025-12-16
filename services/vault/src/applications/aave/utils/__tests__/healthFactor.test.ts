/**
 * Tests for health factor utilities
 */

import { describe, expect, it } from "vitest";

import {
  calculateHealthFactor,
  formatHealthFactor,
  getHealthFactorColor,
  getHealthFactorStatus,
  HEALTH_FACTOR_COLORS,
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

  describe("getHealthFactorStatus", () => {
    it("should return no_debt when hasDebt is false", () => {
      expect(getHealthFactorStatus(null, false)).toBe("no_debt");
      expect(getHealthFactorStatus(2.0, false)).toBe("no_debt");
    });

    it("should return safe when health factor is null with debt", () => {
      expect(getHealthFactorStatus(null, true)).toBe("safe");
    });

    it("should return danger when health factor < 1.0", () => {
      expect(getHealthFactorStatus(0.99, true)).toBe("danger");
      expect(getHealthFactorStatus(0.5, true)).toBe("danger");
    });

    it("should return warning when health factor < 1.5 (threshold)", () => {
      expect(getHealthFactorStatus(1.0, true)).toBe("warning");
      expect(getHealthFactorStatus(1.49, true)).toBe("warning");
    });

    it("should return safe when health factor >= 1.5", () => {
      expect(getHealthFactorStatus(1.5, true)).toBe("safe");
      expect(getHealthFactorStatus(2.0, true)).toBe("safe");
      expect(getHealthFactorStatus(10.0, true)).toBe("safe");
    });
  });

  describe("getHealthFactorColor", () => {
    it("should return GREEN for safe status", () => {
      expect(getHealthFactorColor("safe")).toBe(HEALTH_FACTOR_COLORS.GREEN);
    });

    it("should return AMBER for warning status", () => {
      expect(getHealthFactorColor("warning")).toBe(HEALTH_FACTOR_COLORS.AMBER);
    });

    it("should return RED for danger status", () => {
      expect(getHealthFactorColor("danger")).toBe(HEALTH_FACTOR_COLORS.RED);
    });

    it("should return GRAY for no_debt status", () => {
      expect(getHealthFactorColor("no_debt")).toBe(HEALTH_FACTOR_COLORS.GRAY);
    });
  });
});
