/**
 * Tests for useBorrowState hook state management.
 *
 * The maxBorrowAmount formula is covered by calculateMaxBorrowTokens.test.ts;
 * this file only verifies the hook's state-holder responsibility.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useBorrowState } from "../useBorrowState";

const defaultProps = {
  collateralValueUsd: 10000,
  currentDebtUsd: 0,
  liquidationThresholdBps: 8000,
  tokenPriceUsd: 1,
};

describe("useBorrowState", () => {
  it("initializes borrowAmount to zero", () => {
    const { result } = renderHook(() => useBorrowState(defaultProps));

    expect(result.current.borrowAmount).toBe(0);
  });

  it("updates borrowAmount when setBorrowAmount is called", () => {
    const { result } = renderHook(() => useBorrowState(defaultProps));

    act(() => {
      result.current.setBorrowAmount(500);
    });

    expect(result.current.borrowAmount).toBe(500);
  });

  it("resets borrowAmount to zero when resetBorrowAmount is called", () => {
    const { result } = renderHook(() => useBorrowState(defaultProps));

    act(() => {
      result.current.setBorrowAmount(500);
    });

    act(() => {
      result.current.resetBorrowAmount();
    });

    expect(result.current.borrowAmount).toBe(0);
  });

  it("exposes maxBorrowAmount computed from calculateMaxBorrowTokens", () => {
    // Smoke test — proves the hook wires inputs through to the pure function.
    // Formula correctness is covered by calculateMaxBorrowTokens.test.ts.
    const { result } = renderHook(() => useBorrowState(defaultProps));

    expect(result.current.maxBorrowAmount).toBeGreaterThan(0);
  });
});
