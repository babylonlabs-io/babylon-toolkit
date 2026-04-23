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

  describe("isFullRepayment (explicit mode)", () => {
    it("defaults to false (partial mode)", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      expect(result.current.isFullRepayment).toBe(false);
    });

    it("is true when setRepayAmountWithMode is called with 'full'", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountWithMode(100, "full");
      });

      expect(result.current.isFullRepayment).toBe(true);
    });

    it("resets to false when setRepayAmount is called (manual input)", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountWithMode(100, "full");
      });
      expect(result.current.isFullRepayment).toBe(true);

      act(() => {
        result.current.setRepayAmount(99);
      });
      expect(result.current.isFullRepayment).toBe(false);
    });

    it("is false even when amount equals debt if mode is partial (typed, not Max)", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmount(100);
      });

      // Typed 100 manually — partial mode, not full repay
      expect(result.current.isFullRepayment).toBe(false);
    });

    it("is false when balance limits max below debt (partial repay via Max)", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 50 }),
      );

      // Max button with balance < debt should set partial
      act(() => {
        result.current.setRepayAmountWithMode(50, "partial");
      });

      expect(result.current.isFullRepayment).toBe(false);
    });

    it("resets mode on resetRepayAmount", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountWithMode(100, "full");
      });
      act(() => {
        result.current.resetRepayAmount();
      });

      expect(result.current.isFullRepayment).toBe(false);
      expect(result.current.repayAmount).toBe(0);
    });

    it("is false when max is zero", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 0, userTokenBalance: 100 }),
      );

      expect(result.current.isFullRepayment).toBe(false);
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
