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
  tokenDecimals: 6,
  safeMode: true,
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

  it("exposes the Safe mode maximum and the Safe mode off maximum", () => {
    // Smoke test — proves the hook wires inputs through to the pure function.
    // Formula correctness is covered by calculateMaxBorrowTokens.test.ts.
    const { result, rerender } = renderHook(useBorrowState, {
      initialProps: defaultProps,
    });
    expect(result.current.safeModeOffMaxBorrowAmount).toBe(7960);
    expect(result.current.maxBorrowAmount).toBeLessThan(7960);
    rerender({ ...defaultProps, safeMode: false });
    expect(result.current.maxBorrowAmount).toBe(7960);
  });
});
