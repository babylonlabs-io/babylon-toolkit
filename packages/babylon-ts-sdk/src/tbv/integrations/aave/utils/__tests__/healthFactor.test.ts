/**
 * Tests for health factor utilities
 */

import { describe, expect, it } from "vitest";

import {
  calculateHealthFactor,
  getHealthFactorStatus,
  getHealthFactorStatusFromValue,
} from "../healthFactor.js";

describe("healthFactor", () => {
  describe("calculateHealthFactor", () => {
    it("should calculate health factor correctly", () => {
      // HF = (Collateral * LT) / Debt
      // HF = (100 * 0.80) / 50 = 1.6
      expect(calculateHealthFactor(100, 50, 8000)).toBe(1.6);
    });

    it("should return Infinity when debt is 0", () => {
      expect(calculateHealthFactor(100, 0, 8000)).toBe(Infinity);
    });

    it("should return Infinity when debt is negative", () => {
      expect(calculateHealthFactor(100, -10, 8000)).toBe(Infinity);
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

    it("should return risky when health factor is from 1.0 to 1.1 inclusive", () => {
      expect(getHealthFactorStatus(1.0, true)).toBe("risky");
      expect(getHealthFactorStatus(1.05, true)).toBe("risky");
      expect(getHealthFactorStatus(1.1, true)).toBe("risky");
    });

    it("should return warning when health factor is above 1.1 and at most 2.0", () => {
      expect(getHealthFactorStatus(1.11, true)).toBe("warning");
      expect(getHealthFactorStatus(1.5, true)).toBe("warning");
      expect(getHealthFactorStatus(2.0, true)).toBe("warning");
    });

    it("should return safe when health factor > 2.0", () => {
      expect(getHealthFactorStatus(2.01, true)).toBe("safe");
      expect(getHealthFactorStatus(10.0, true)).toBe("safe");
    });
  });

  describe("getHealthFactorStatusFromValue", () => {
    it("should return no_debt for Infinity (no debt)", () => {
      expect(getHealthFactorStatusFromValue(Infinity)).toBe("no_debt");
    });

    it("should return danger when value < 1.0", () => {
      expect(getHealthFactorStatusFromValue(0.99)).toBe("danger");
      expect(getHealthFactorStatusFromValue(0.5)).toBe("danger");
    });

    it("should return risky when value is from 1.0 to 1.1 inclusive", () => {
      expect(getHealthFactorStatusFromValue(1.0)).toBe("risky");
      expect(getHealthFactorStatusFromValue(1.05)).toBe("risky");
      expect(getHealthFactorStatusFromValue(1.1)).toBe("risky");
    });

    it("should return warning when value is above 1.1 and at most 2.0", () => {
      expect(getHealthFactorStatusFromValue(1.11)).toBe("warning");
      expect(getHealthFactorStatusFromValue(1.5)).toBe("warning");
      expect(getHealthFactorStatusFromValue(2.0)).toBe("warning");
    });

    it("should return safe when value > 2.0", () => {
      expect(getHealthFactorStatusFromValue(2.01)).toBe("safe");
      expect(getHealthFactorStatusFromValue(10.0)).toBe("safe");
    });
  });
});
