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
