/**
 * Tests for position calculation utilities
 */

import { describe, expect, it } from "vitest";

import {
  calculateDebtValueUsd,
  liquidationThresholdFromBps,
} from "../positionCalculations";

describe("Position Calculation Utilities", () => {
  describe("calculateDebtValueUsd", () => {
    it("should calculate debt value from shares (USDC 6 decimals)", () => {
      // 1000 USDC = 1000 * 10^6 shares
      const drawnShares = 1000_000000n;
      const premiumShares = 0n;

      const result = calculateDebtValueUsd(drawnShares, premiumShares);
      expect(result).toBe(1000);
    });

    it("should include premium shares in total debt", () => {
      // 1000 USDC principal + 50 USDC interest
      const drawnShares = 1000_000000n;
      const premiumShares = 50_000000n;

      const result = calculateDebtValueUsd(drawnShares, premiumShares);
      expect(result).toBe(1050);
    });

    it("should handle zero debt", () => {
      const result = calculateDebtValueUsd(0n, 0n);
      expect(result).toBe(0);
    });

    it("should handle fractional amounts", () => {
      // 0.5 USDC = 500000 shares
      const drawnShares = 500000n;
      const premiumShares = 0n;

      const result = calculateDebtValueUsd(drawnShares, premiumShares);
      expect(result).toBe(0.5);
    });

    it("should handle large debt values", () => {
      // 1 million USDC
      const drawnShares = 1_000_000_000000n;
      const premiumShares = 0n;

      const result = calculateDebtValueUsd(drawnShares, premiumShares);
      expect(result).toBe(1_000_000);
    });

    it("should handle small premium shares", () => {
      // 100 USDC principal + 0.01 USDC interest
      const drawnShares = 100_000000n;
      const premiumShares = 10000n; // 0.01 USDC

      const result = calculateDebtValueUsd(drawnShares, premiumShares);
      expect(result).toBeCloseTo(100.01, 2);
    });
  });

  describe("liquidationThresholdFromBps", () => {
    it("should convert 8000 BPS to 80%", () => {
      const result = liquidationThresholdFromBps(8000);
      expect(result).toBe(80);
    });

    it("should convert 8500 BPS to 85%", () => {
      const result = liquidationThresholdFromBps(8500);
      expect(result).toBe(85);
    });

    it("should convert 10000 BPS to 100%", () => {
      const result = liquidationThresholdFromBps(10000);
      expect(result).toBe(100);
    });

    it("should convert 7500 BPS to 75%", () => {
      const result = liquidationThresholdFromBps(7500);
      expect(result).toBe(75);
    });

    it("should handle 0 BPS", () => {
      const result = liquidationThresholdFromBps(0);
      expect(result).toBe(0);
    });

    it("should handle fractional percentages", () => {
      // 8250 BPS = 82.5%
      const result = liquidationThresholdFromBps(8250);
      expect(result).toBe(82.5);
    });
  });
});
