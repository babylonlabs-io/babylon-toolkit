/**
 * Tests for debt utilities
 */

import { describe, expect, it } from "vitest";

import { hasDebtFromPosition } from "../debtUtils";

describe("debtUtils", () => {
  describe("hasDebtFromPosition", () => {
    it("should return true when drawnShares > 0", () => {
      const position = {
        drawnShares: 100n,
        premiumShares: 0n,
        realizedPremiumRay: 0n,
        premiumOffsetRay: 0n,
        suppliedShares: 0n,
        dynamicConfigKey: 0,
      };
      expect(hasDebtFromPosition(position)).toBe(true);
    });

    it("should return true when premiumShares > 0", () => {
      const position = {
        drawnShares: 0n,
        premiumShares: 50n,
        realizedPremiumRay: 0n,
        premiumOffsetRay: 0n,
        suppliedShares: 0n,
        dynamicConfigKey: 0,
      };
      expect(hasDebtFromPosition(position)).toBe(true);
    });

    it("should return true when both drawnShares and premiumShares > 0", () => {
      const position = {
        drawnShares: 100n,
        premiumShares: 50n,
        realizedPremiumRay: 0n,
        premiumOffsetRay: 0n,
        suppliedShares: 0n,
        dynamicConfigKey: 0,
      };
      expect(hasDebtFromPosition(position)).toBe(true);
    });

    it("should return false when both drawnShares and premiumShares are 0", () => {
      const position = {
        drawnShares: 0n,
        premiumShares: 0n,
        realizedPremiumRay: 0n,
        premiumOffsetRay: 0n,
        suppliedShares: 0n,
        dynamicConfigKey: 0,
      };
      expect(hasDebtFromPosition(position)).toBe(false);
    });

    it("should not consider suppliedShares as debt", () => {
      const position = {
        drawnShares: 0n,
        premiumShares: 0n,
        realizedPremiumRay: 0n,
        premiumOffsetRay: 0n,
        suppliedShares: 1000n,
        dynamicConfigKey: 0,
      };
      expect(hasDebtFromPosition(position)).toBe(false);
    });
  });
});
