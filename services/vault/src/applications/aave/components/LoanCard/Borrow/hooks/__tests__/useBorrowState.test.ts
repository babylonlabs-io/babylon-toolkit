/**
 * Tests for useBorrowState hook
 *
 * Verifies that maxBorrowAmount correctly incorporates the liquidation
 * threshold and MIN_HEALTH_FACTOR_FOR_BORROW safety margin (Issue #46).
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  BPS_SCALE,
  MIN_HEALTH_FACTOR_FOR_BORROW,
} from "../../../../../constants";
import { useBorrowState } from "../useBorrowState";

describe("useBorrowState", () => {
  describe("maxBorrowAmount with LTV cap", () => {
    it("caps max borrow using liquidation threshold and safety margin", () => {
      // $10,000 collateral, 80% LT, no existing debt, $1 token
      // Expected: (10000 * 8000 / 10000) / 1.2 - 0 = 6666.66 USD = 6666.66 tokens
      const { result } = renderHook(() =>
        useBorrowState({
          collateralValueUsd: 10000,
          currentDebtUsd: 0,
          liquidationThresholdBps: 8000,
          tokenPriceUsd: 1,
        }),
      );

      const expectedMaxUsd =
        (10000 * 8000) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW;
      const expectedMaxTokens = Math.floor(expectedMaxUsd * 100) / 100;
      expect(result.current.maxBorrowAmount).toBe(expectedMaxTokens);
    });

    it("subtracts existing debt from max borrow", () => {
      // $10,000 collateral, 80% LT, $2000 existing debt, $1 token
      // Expected: (10000 * 0.8) / 1.2 - 2000 = 4666.66 tokens
      const { result } = renderHook(() =>
        useBorrowState({
          collateralValueUsd: 10000,
          currentDebtUsd: 2000,
          liquidationThresholdBps: 8000,
          tokenPriceUsd: 1,
        }),
      );

      const expectedMaxUsd =
        (10000 * 8000) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW - 2000;
      const expectedMaxTokens = Math.floor(expectedMaxUsd * 100) / 100;
      expect(result.current.maxBorrowAmount).toBe(expectedMaxTokens);
    });

    it("converts USD cap to token units using tokenPriceUsd", () => {
      // $10,000 collateral, 80% LT, no debt, token worth $2
      // Max USD = (10000 * 0.8) / 1.2 = 6666.66
      // Max tokens = 6666.66 / 2 = 3333.33
      const { result } = renderHook(() =>
        useBorrowState({
          collateralValueUsd: 10000,
          currentDebtUsd: 0,
          liquidationThresholdBps: 8000,
          tokenPriceUsd: 2,
        }),
      );

      const expectedMaxUsd =
        (10000 * 8000) / BPS_SCALE / MIN_HEALTH_FACTOR_FOR_BORROW;
      const expectedMaxTokens = Math.floor((expectedMaxUsd / 2) * 100) / 100;
      expect(result.current.maxBorrowAmount).toBe(expectedMaxTokens);
    });

    it("returns zero when debt exceeds borrowing capacity", () => {
      // $10,000 collateral, 80% LT, $8000 debt (exceeds capacity)
      const { result } = renderHook(() =>
        useBorrowState({
          collateralValueUsd: 10000,
          currentDebtUsd: 8000,
          liquidationThresholdBps: 8000,
          tokenPriceUsd: 1,
        }),
      );

      expect(result.current.maxBorrowAmount).toBe(0);
    });

    it("returns zero when collateral is zero", () => {
      const { result } = renderHook(() =>
        useBorrowState({
          collateralValueUsd: 0,
          currentDebtUsd: 0,
          liquidationThresholdBps: 8000,
          tokenPriceUsd: 1,
        }),
      );

      expect(result.current.maxBorrowAmount).toBe(0);
    });
  });

  describe("borrowAmount state", () => {
    it("initializes to zero", () => {
      const { result } = renderHook(() =>
        useBorrowState({
          collateralValueUsd: 10000,
          currentDebtUsd: 0,
          liquidationThresholdBps: 8000,
          tokenPriceUsd: 1,
        }),
      );

      expect(result.current.borrowAmount).toBe(0);
    });

    it("updates when setBorrowAmount is called", () => {
      const { result } = renderHook(() =>
        useBorrowState({
          collateralValueUsd: 10000,
          currentDebtUsd: 0,
          liquidationThresholdBps: 8000,
          tokenPriceUsd: 1,
        }),
      );

      act(() => {
        result.current.setBorrowAmount(500);
      });

      expect(result.current.borrowAmount).toBe(500);
    });

    it("resets to zero when resetBorrowAmount is called", () => {
      const { result } = renderHook(() =>
        useBorrowState({
          collateralValueUsd: 10000,
          currentDebtUsd: 0,
          liquidationThresholdBps: 8000,
          tokenPriceUsd: 1,
        }),
      );

      act(() => {
        result.current.setBorrowAmount(500);
      });

      act(() => {
        result.current.resetBorrowAmount();
      });

      expect(result.current.borrowAmount).toBe(0);
    });
  });
});
