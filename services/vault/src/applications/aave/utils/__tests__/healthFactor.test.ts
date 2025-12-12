/**
 * Tests for Aave health factor calculation utilities
 *
 * Health Factor = (Collateral Value * Liquidation Threshold) / Total Debt
 */

import { describe, expect, it } from "vitest";

import { calculateHealthFactor, isHealthFactorHealthy } from "../healthFactor";

describe("Health Factor Utilities", () => {
  describe("calculateHealthFactor", () => {
    it("should calculate health factor correctly with typical values", () => {
      // Example from Aave docs: $10,000 collateral, 80% threshold, $6,000 debt
      // HF = (10000 * 0.80) / 6000 = 1.333...
      const result = calculateHealthFactor({
        collateralValueUsd: 10000,
        debtValueUsd: 6000,
        liquidationThreshold: 80,
      });

      expect(result.value).toBeCloseTo(1.333, 2);
      expect(result.formatted).toBe("1.33");
      expect(result.isHealthy).toBe(true);
    });

    it("should return healthy status when health factor >= 1.0", () => {
      const result = calculateHealthFactor({
        collateralValueUsd: 10000,
        debtValueUsd: 8000,
        liquidationThreshold: 80,
      });

      // HF = (10000 * 0.80) / 8000 = 1.0
      expect(result.value).toBe(1.0);
      expect(result.isHealthy).toBe(true);
    });

    it("should return unhealthy status when health factor < 1.0", () => {
      const result = calculateHealthFactor({
        collateralValueUsd: 10000,
        debtValueUsd: 9000,
        liquidationThreshold: 80,
      });

      // HF = (10000 * 0.80) / 9000 = 0.888...
      expect(result.value).toBeCloseTo(0.889, 2);
      expect(result.isHealthy).toBe(false);
    });

    it("should return infinite health factor when no debt", () => {
      const result = calculateHealthFactor({
        collateralValueUsd: 10000,
        debtValueUsd: 0,
        liquidationThreshold: 80,
      });

      expect(result.value).toBe(Infinity);
      expect(result.formatted).toBe("-");
      expect(result.isHealthy).toBe(true);
    });

    it("should return infinite health factor when debt is negative", () => {
      const result = calculateHealthFactor({
        collateralValueUsd: 10000,
        debtValueUsd: -100,
        liquidationThreshold: 80,
      });

      expect(result.value).toBe(Infinity);
      expect(result.formatted).toBe("-");
      expect(result.isHealthy).toBe(true);
    });

    it("should return zero health factor when no collateral but has debt", () => {
      const result = calculateHealthFactor({
        collateralValueUsd: 0,
        debtValueUsd: 5000,
        liquidationThreshold: 80,
      });

      expect(result.value).toBe(0);
      expect(result.formatted).toBe("0.00");
      expect(result.isHealthy).toBe(false);
    });

    it("should handle different liquidation thresholds", () => {
      const params = {
        collateralValueUsd: 10000,
        debtValueUsd: 5000,
      };

      // 80% threshold: HF = (10000 * 0.80) / 5000 = 1.6
      const result80 = calculateHealthFactor({
        ...params,
        liquidationThreshold: 80,
      });
      expect(result80.value).toBe(1.6);

      // 85% threshold: HF = (10000 * 0.85) / 5000 = 1.7
      const result85 = calculateHealthFactor({
        ...params,
        liquidationThreshold: 85,
      });
      expect(result85.value).toBe(1.7);

      // 75% threshold: HF = (10000 * 0.75) / 5000 = 1.5
      const result75 = calculateHealthFactor({
        ...params,
        liquidationThreshold: 75,
      });
      expect(result75.value).toBe(1.5);
    });

    it("should handle very small debt values", () => {
      const result = calculateHealthFactor({
        collateralValueUsd: 10000,
        debtValueUsd: 0.01,
        liquidationThreshold: 80,
      });

      // HF = (10000 * 0.80) / 0.01 = 800000
      expect(result.value).toBe(800000);
      expect(result.isHealthy).toBe(true);
    });

    it("should handle very large values", () => {
      const result = calculateHealthFactor({
        collateralValueUsd: 1000000000, // $1B
        debtValueUsd: 500000000, // $500M
        liquidationThreshold: 80,
      });

      // HF = (1B * 0.80) / 500M = 1.6
      expect(result.value).toBe(1.6);
      expect(result.isHealthy).toBe(true);
    });

    it("should format health factor to 2 decimal places", () => {
      const result = calculateHealthFactor({
        collateralValueUsd: 10000,
        debtValueUsd: 7777,
        liquidationThreshold: 80,
      });

      // HF = (10000 * 0.80) / 7777 = 1.0286...
      expect(result.formatted).toBe("1.03");
    });

    it("should handle liquidation threshold as basis points converted", () => {
      // If collateralRisk from indexer is 8000 (basis points),
      // it should be divided by 100 before passing to this function
      // So liquidationThreshold = 80 (percentage)
      const result = calculateHealthFactor({
        collateralValueUsd: 10000,
        debtValueUsd: 6000,
        liquidationThreshold: 80, // Already converted from 8000 basis points
      });

      expect(result.value).toBeCloseTo(1.333, 2);
    });
  });

  describe("isHealthFactorHealthy", () => {
    it("should return true for health factor >= 1.0", () => {
      expect(isHealthFactorHealthy("1.0")).toBe(true);
      expect(isHealthFactorHealthy("1.5")).toBe(true);
      expect(isHealthFactorHealthy("2.0")).toBe(true);
      expect(isHealthFactorHealthy("10.0")).toBe(true);
    });

    it("should return false for health factor < 1.0", () => {
      expect(isHealthFactorHealthy("0.99")).toBe(false);
      expect(isHealthFactorHealthy("0.5")).toBe(false);
      expect(isHealthFactorHealthy("0.0")).toBe(false);
    });

    it("should return false for invalid health factor strings", () => {
      expect(isHealthFactorHealthy("")).toBe(false);
      expect(isHealthFactorHealthy("abc")).toBe(false);
      expect(isHealthFactorHealthy("-")).toBe(false);
    });

    it("should handle edge case at exactly 1.0", () => {
      expect(isHealthFactorHealthy("1.0")).toBe(true);
      expect(isHealthFactorHealthy("1.00")).toBe(true);
      expect(isHealthFactorHealthy("1")).toBe(true);
    });

    it("should handle negative values", () => {
      expect(isHealthFactorHealthy("-1.0")).toBe(false);
      expect(isHealthFactorHealthy("-0.5")).toBe(false);
    });
  });
});
