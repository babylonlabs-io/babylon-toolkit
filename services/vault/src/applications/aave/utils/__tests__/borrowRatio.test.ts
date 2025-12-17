/**
 * Tests for borrow ratio utilities
 */

import { describe, expect, it } from "vitest";

import { calculateBorrowRatio } from "../borrowRatio";

describe("borrowRatio", () => {
  describe("calculateBorrowRatio", () => {
    it("should calculate borrow ratio as percentage", () => {
      // 50 / 100 = 50%
      expect(calculateBorrowRatio(50, 100)).toBe("50.0%");
    });

    it("should return 0% when collateral is 0", () => {
      expect(calculateBorrowRatio(50, 0)).toBe("0%");
    });

    it("should return 0% when collateral is negative", () => {
      expect(calculateBorrowRatio(50, -100)).toBe("0%");
    });

    it("should handle 0 debt", () => {
      expect(calculateBorrowRatio(0, 100)).toBe("0.0%");
    });

    it("should format to 1 decimal place", () => {
      // 15.74 / 100 = 15.74%
      expect(calculateBorrowRatio(15.74, 100)).toBe("15.7%");
    });

    it("should handle real-world values", () => {
      // Debt: $10.00, Collateral: $63.57
      // Ratio = 10 / 63.57 * 100 = 15.73%
      expect(calculateBorrowRatio(10, 63.57)).toBe("15.7%");
    });

    it("should handle high borrow ratios", () => {
      // 80 / 100 = 80%
      expect(calculateBorrowRatio(80, 100)).toBe("80.0%");
    });

    it("should handle ratios over 100%", () => {
      // 150 / 100 = 150%
      expect(calculateBorrowRatio(150, 100)).toBe("150.0%");
    });
  });
});
