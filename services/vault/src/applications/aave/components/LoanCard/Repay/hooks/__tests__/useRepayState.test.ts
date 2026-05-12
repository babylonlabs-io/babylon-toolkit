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

  describe("repayMode (tri-state)", () => {
    it("defaults to 'partial'", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      expect(result.current.repayMode).toBe("partial");
    });

    it("is 'full' when setRepayAmountWithMode('full') is called", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountWithMode(100, "full");
      });

      expect(result.current.repayMode).toBe("full");
      expect(result.current.isFullRepayment).toBe(true);
    });

    it("is 'max-capped' when balance covers debt but not the safety buffer", () => {
      // Caller has decided "balance < debt × (1 + buffer)" so we send the
      // full balance and let the adapter pull min(balance, actualDebt).
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100.001, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountWithMode(100, "max-capped");
      });

      expect(result.current.repayMode).toBe("max-capped");
      // max-capped is NOT a full repayment — adapter may leave sub-cent dust.
      expect(result.current.isFullRepayment).toBe(false);
      expect(result.current.repayAmount).toBe(100);
    });

    it("resets to 'partial' when setRepayAmount is called (manual input)", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountWithMode(100, "max-capped");
      });
      expect(result.current.repayMode).toBe("max-capped");

      act(() => {
        result.current.setRepayAmount(50);
      });
      expect(result.current.repayMode).toBe("partial");
    });

    it("resets mode on resetRepayAmount", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountWithMode(100, "max-capped");
      });
      act(() => {
        result.current.resetRepayAmount();
      });

      expect(result.current.repayMode).toBe("partial");
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

  describe("repayAmountRaw (exact bigint cap)", () => {
    it("defaults to null", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      expect(result.current.repayAmountRaw).toBeNull();
    });

    it("stores the bigint when passed to setRepayAmountWithMode", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100.001, userTokenBalance: 100 }),
      );

      // 100 USDC at 6 decimals
      const cap = 100_000_000n;
      act(() => {
        result.current.setRepayAmountWithMode(100, "max-capped", cap);
      });

      // The float is just for display; the raw bigint is the source of truth
      // for the actual approval/transfer amount.
      expect(result.current.repayAmountRaw).toBe(cap);
      expect(result.current.repayAmount).toBe(100);
      expect(result.current.repayMode).toBe("max-capped");
    });

    it("remains null when setRepayAmountWithMode is called without the bigint", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountWithMode(100, "full");
      });

      expect(result.current.repayAmountRaw).toBeNull();
    });

    it("is cleared by setRepayAmount (manual typed input)", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100.001, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountWithMode(100, "max-capped", 100_000_000n);
      });
      expect(result.current.repayAmountRaw).toBe(100_000_000n);

      // User typed something else — the bigint cap is no longer the source of truth
      act(() => {
        result.current.setRepayAmount(50);
      });

      expect(result.current.repayAmountRaw).toBeNull();
    });

    it("is cleared by resetRepayAmount", () => {
      const { result } = renderHook(() =>
        useRepayState({ currentDebtAmount: 100.001, userTokenBalance: 100 }),
      );

      act(() => {
        result.current.setRepayAmountWithMode(100, "max-capped", 100_000_000n);
      });
      act(() => {
        result.current.resetRepayAmount();
      });

      expect(result.current.repayAmountRaw).toBeNull();
    });
  });
});
