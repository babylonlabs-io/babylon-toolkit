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

  describe("isMaxIntent", () => {
    it("defaults to false", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      expect(result.current.isMaxIntent).toBe(false);
    });

    it("is true after setRepayAmountMax", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountMax(100);
      });

      expect(result.current.isMaxIntent).toBe(true);
      expect(result.current.repayAmount).toBe(100);
    });

    it("is cleared by setRepayAmount (typed/sliderd input)", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountMax(100);
      });
      expect(result.current.isMaxIntent).toBe(true);

      act(() => {
        result.current.setRepayAmount(50);
      });

      expect(result.current.isMaxIntent).toBe(false);
    });

    it("is cleared by resetRepayAmount", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountMax(100);
      });
      act(() => {
        result.current.resetRepayAmount();
      });

      expect(result.current.isMaxIntent).toBe(false);
      expect(result.current.repayAmount).toBe(0);
    });

    it("remains false when the user types an amount equal to debt", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmount(100);
      });

      // Typed 100 is partial intent — submit must not refetch + remap.
      expect(result.current.isMaxIntent).toBe(false);
      expect(result.current.repayAmount).toBe(100);
    });
  });

  describe("setRepayAmountSlider", () => {
    it("sets Max intent and snaps to max when the slider reaches the top", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountSlider(100);
      });

      expect(result.current.isMaxIntent).toBe(true);
      expect(result.current.repayAmount).toBe(100);
    });

    it("sets Max intent when the slider snaps one step short of max", () => {
      // Native range input with step = max / 1000 can emit max - one step at
      // the far right (99.9 for a max of 100). That last reachable step must
      // still count as Max intent, and the display snaps to the true max.
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountSlider(99.9);
      });

      expect(result.current.isMaxIntent).toBe(true);
      expect(result.current.repayAmount).toBe(100);
    });

    it("stays partial just below the one-step threshold", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountSlider(99.89);
      });

      expect(result.current.isMaxIntent).toBe(false);
      expect(result.current.repayAmount).toBe(99.89);
    });

    it("sets Max intent at the balance-limited max when balance is below debt", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 50 }),
      );

      act(() => {
        result.current.setRepayAmountSlider(50);
      });

      expect(result.current.isMaxIntent).toBe(true);
      expect(result.current.repayAmount).toBe(50);
    });

    it("does not set Max intent when there is nothing to repay", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 0, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountSlider(0);
      });

      expect(result.current.isMaxIntent).toBe(false);
      expect(result.current.repayAmount).toBe(0);
    });

    it("clears Max intent when the slider moves back down from the top", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountSlider(100);
      });
      expect(result.current.isMaxIntent).toBe(true);

      act(() => {
        result.current.setRepayAmountSlider(30);
      });

      expect(result.current.isMaxIntent).toBe(false);
      expect(result.current.repayAmount).toBe(30);
    });

    it("works at WBTC's 8-decimal scale (slider at max clears in full)", () => {
      // WBTC at ~$75k: a small loan is a tiny token amount. The tolerance is
      // relative (max / SLIDER_STEP_COUNT), so it's scale-invariant — an
      // absolute epsilon would fail here. The far-right value lands one step
      // short of max; it must still snap to the full 8-decimal debt.
      const wbtcDebt = 0.00133333;
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: wbtcDebt, userTokenBalance: 1 }),
      );

      act(() => {
        result.current.setRepayAmountSlider(wbtcDebt - wbtcDebt / 1000);
      });

      expect(result.current.isMaxIntent).toBe(true);
      expect(result.current.repayAmount).toBe(wbtcDebt);
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
