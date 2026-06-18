import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/aaveHub", () => ({
  getProjectedBorrowAprPercentsSafe: vi.fn(),
}));

import { getProjectedBorrowAprPercentsSafe } from "../../clients/aaveHub";
import type { AaveReserveConfig } from "../../services/fetchConfig";
import { useProjectedBorrowApr } from "../useProjectedBorrowApr";

const HUB = "0x0000000000000000000000000000000000000003" as const;

function makeReserve(decimals: number, assetId = 0): AaveReserveConfig {
  return {
    reserveId: 1n,
    reserve: {
      underlying: "0x0000000000000000000000000000000000000010",
      hub: HUB,
      assetId,
      decimals,
      dynamicConfigKey: 0,
      paused: false,
      frozen: false,
      borrowable: true,
      collateralRisk: 0,
      collateralFactor: 8000,
    },
    token: {
      address: "0x0000000000000000000000000000000000000010",
      symbol: "USDT",
      name: "Tether USD",
      decimals,
    },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useProjectedBorrowApr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the current and projected percents from the reader", async () => {
    vi.mocked(getProjectedBorrowAprPercentsSafe).mockResolvedValue({
      currentPercent: 3.7,
      projectedPercent: 4.2,
      error: null,
    });

    const { result } = renderHook(
      () =>
        useProjectedBorrowApr({ reserve: makeReserve(6), borrowAmount: 100 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.currentPercent).toBe(3.7));
    expect(result.current.projectedPercent).toBe(4.2);
    expect(result.current.error).toBeNull();
  });

  it("scales the entered amount to the token's smallest units", async () => {
    vi.mocked(getProjectedBorrowAprPercentsSafe).mockResolvedValue({
      currentPercent: 1,
      projectedPercent: 1,
      error: null,
    });

    renderHook(
      () =>
        useProjectedBorrowApr({ reserve: makeReserve(6), borrowAmount: 100.5 }),
      { wrapper },
    );

    await waitFor(() =>
      expect(getProjectedBorrowAprPercentsSafe).toHaveBeenCalledWith({
        hub: HUB,
        assetId: 0,
        borrowAmountRaw: 100_500_000n, // 100.5 * 1e6
      }),
    );
  });

  it("surfaces the reader's non-throwing error while nulling the figures", async () => {
    vi.mocked(getProjectedBorrowAprPercentsSafe).mockResolvedValue({
      currentPercent: null,
      projectedPercent: null,
      error: new Error("Hub asset totals read reverted"),
    });

    const { result } = renderHook(
      () => useProjectedBorrowApr({ reserve: makeReserve(6), borrowAmount: 0 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.currentPercent).toBeNull();
    expect(result.current.projectedPercent).toBeNull();
  });

  it("does not surface the previous reserve's APR while the new reserve loads", async () => {
    let resolveB: (value: {
      currentPercent: number | null;
      projectedPercent: number | null;
      error: Error | null;
    }) => void = () => {};
    vi.mocked(getProjectedBorrowAprPercentsSafe)
      .mockResolvedValueOnce({
        currentPercent: 3.7,
        projectedPercent: 3.7,
        error: null,
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveB = resolve;
        }),
      );

    const { result, rerender } = renderHook(
      ({ reserve }) => useProjectedBorrowApr({ reserve, borrowAmount: 0 }),
      { wrapper, initialProps: { reserve: makeReserve(6, 1) } },
    );
    await waitFor(() => expect(result.current.currentPercent).toBe(3.7));

    // Switch to a different reserve whose read is still in flight.
    rerender({ reserve: makeReserve(6, 2) });
    // The stale 3.7 from reserve 1 must not carry over to reserve 2.
    await waitFor(() => expect(result.current.currentPercent).toBeNull());

    resolveB({ currentPercent: 9.9, projectedPercent: 9.9, error: null });
    await waitFor(() => expect(result.current.currentPercent).toBe(9.9));
  });

  describe("debounces amount edits before the on-chain read", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("waits for the amount to settle before reading the new projection", async () => {
      vi.mocked(getProjectedBorrowAprPercentsSafe).mockResolvedValue({
        currentPercent: 3.7,
        projectedPercent: 3.7,
        error: null,
      });

      const { rerender } = renderHook(
        ({ amount }) =>
          useProjectedBorrowApr({
            reserve: makeReserve(6),
            borrowAmount: amount,
          }),
        { wrapper, initialProps: { amount: 0 } },
      );

      // Initial value reads immediately (no settle needed for the current rate).
      expect(getProjectedBorrowAprPercentsSafe).toHaveBeenLastCalledWith({
        hub: HUB,
        assetId: 0,
        borrowAmountRaw: 0n,
      });

      rerender({ amount: 50 });
      // Before the debounce elapses, no read for the new amount.
      expect(getProjectedBorrowAprPercentsSafe).not.toHaveBeenCalledWith({
        hub: HUB,
        assetId: 0,
        borrowAmountRaw: 50_000_000n,
      });

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(getProjectedBorrowAprPercentsSafe).toHaveBeenLastCalledWith({
        hub: HUB,
        assetId: 0,
        borrowAmountRaw: 50_000_000n,
      });
    });
  });
});
