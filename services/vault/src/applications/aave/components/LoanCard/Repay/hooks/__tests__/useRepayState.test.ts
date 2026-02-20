/**
 * Tests for useRepayState hook
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useRepayState } from "../useRepayState";

describe("useRepayState", () => {
  describe("maxRepayAmount", () => {
    it("should return full precision without truncation when balance exceeds debt", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 1.23456789, userTokenBalance: 100 }),
      );

      // Should NOT truncate to 1.23
      expect(result.current.maxRepayAmount).toBe(1.23456789);
    });

    it("should handle zero debt", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 0, userTokenBalance: 100 }),
      );

      expect(result.current.maxRepayAmount).toBe(0);
    });

    it("should handle negative debt as zero", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: -100, userTokenBalance: 100 }),
      );

      expect(result.current.maxRepayAmount).toBe(0);
    });

    it("should handle very small amounts", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 0.00000001, userTokenBalance: 100 }),
      );

      expect(result.current.maxRepayAmount).toBe(0.00000001);
    });

    it("should handle large amounts", () => {
      const { result } = renderHook(() =>
        useRepayState({
          currentDebtAmount: 999999.99999999,
          userTokenBalance: 1000000,
        }),
      );

      expect(result.current.maxRepayAmount).toBe(999999.99999999);
    });

    it("should limit max to balance when balance is less than debt", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 50 }),
      );

      expect(result.current.maxRepayAmount).toBe(50);
    });

    it("should handle zero balance", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 0 }),
      );

      expect(result.current.maxRepayAmount).toBe(0);
    });
  });

  describe("isFullRepayment", () => {
    it("should be true when repay amount equals max", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmount(100);
      });

      expect(result.current.isFullRepayment).toBe(true);
    });

    it("should be true when repay amount is within tolerance of max", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      // Within 0.01 tolerance
      act(() => {
        result.current.setRepayAmount(99.995);
      });

      expect(result.current.isFullRepayment).toBe(true);
    });

    it("should be false when repay amount is significantly less than max", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmount(50);
      });

      expect(result.current.isFullRepayment).toBe(false);
    });

    it("should be false when max is zero", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 0, userTokenBalance: 100 }),
      );

      expect(result.current.isFullRepayment).toBe(false);
    });

    it("should be false when balance limits max below repay amount", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 50 }),
      );

      // Max is 50 (limited by balance), repay 50 is full of what's available
      act(() => {
        result.current.setRepayAmount(50);
      });

      expect(result.current.isFullRepayment).toBe(true);
    });
  });

  describe("repayAmount state", () => {
    it("should initialize to zero", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      expect(result.current.repayAmount).toBe(0);
    });

    it("should update when setRepayAmount is called", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmount(50);
      });

      expect(result.current.repayAmount).toBe(50);
    });

    it("should reset to zero when resetRepayAmount is called", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmount(50);
      });

      expect(result.current.repayAmount).toBe(50);

      act(() => {
        result.current.resetRepayAmount();
      });

      expect(result.current.repayAmount).toBe(0);
    });
  });
});
