import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/clients/indexer/aaveHistoryClient", () => ({
  fetchBorrowRateHistory: vi.fn(),
}));

import { fetchBorrowRateHistory } from "@/clients/indexer/aaveHistoryClient";

import { useBorrowRateHistory } from "../useBorrowRateHistory";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useBorrowRateHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the fetched points for the requested reserve and range", async () => {
    vi.mocked(fetchBorrowRateHistory).mockResolvedValue([
      { timeMs: 1_000, ratePercent: 3.1 },
    ]);

    const { result } = renderHook(
      () => useBorrowRateHistory({ reserveId: 5n, range: "1w" }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.points).toEqual([
        { timeMs: 1_000, ratePercent: 3.1 },
      ]),
    );
    expect(result.current.error).toBeNull();
    expect(fetchBorrowRateHistory).toHaveBeenCalledWith({
      reserveId: 5n,
      range: "1w",
      signal: expect.any(AbortSignal),
    });
  });

  it("does not fetch while reserveId is null", () => {
    renderHook(() => useBorrowRateHistory({ reserveId: null, range: "1w" }), {
      wrapper,
    });

    expect(fetchBorrowRateHistory).not.toHaveBeenCalled();
  });

  it("refetches when the range changes for the same reserve", async () => {
    vi.mocked(fetchBorrowRateHistory).mockResolvedValue([
      { timeMs: 1_000, ratePercent: 3.1 },
    ]);

    const { rerender } = renderHook(
      ({ range }: { range: "1w" | "1m" }) =>
        useBorrowRateHistory({ reserveId: 5n, range }),
      { wrapper, initialProps: { range: "1w" } },
    );

    await waitFor(() =>
      expect(fetchBorrowRateHistory).toHaveBeenCalledWith({
        reserveId: 5n,
        range: "1w",
        signal: expect.any(AbortSignal),
      }),
    );

    rerender({ range: "1m" });

    await waitFor(() =>
      expect(fetchBorrowRateHistory).toHaveBeenCalledWith({
        reserveId: 5n,
        range: "1m",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("holds the previous range's series while the new range loads (same reserve)", async () => {
    let resolveSecond: (
      value: { timeMs: number; ratePercent: number }[],
    ) => void = () => {};
    vi.mocked(fetchBorrowRateHistory)
      .mockResolvedValueOnce([{ timeMs: 1_000, ratePercent: 3.1 }])
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );

    const { result, rerender } = renderHook(
      ({ range }: { range: "1w" | "1m" }) =>
        useBorrowRateHistory({ reserveId: 5n, range }),
      { wrapper, initialProps: { range: "1w" } },
    );

    await waitFor(() =>
      expect(result.current.points).toEqual([
        { timeMs: 1_000, ratePercent: 3.1 },
      ]),
    );

    rerender({ range: "1m" });

    // The new range's fetch is in flight; the previous range's series stays visible.
    expect(result.current.points).toEqual([
      { timeMs: 1_000, ratePercent: 3.1 },
    ]);

    resolveSecond([{ timeMs: 2_000, ratePercent: 4.2 }]);
    await waitFor(() =>
      expect(result.current.points).toEqual([
        { timeMs: 2_000, ratePercent: 4.2 },
      ]),
    );
  });

  it("does not reuse the previous reserve's series when the reserve switches", async () => {
    let resolveB: (
      value: { timeMs: number; ratePercent: number }[],
    ) => void = () => {};
    vi.mocked(fetchBorrowRateHistory)
      .mockResolvedValueOnce([{ timeMs: 1_000, ratePercent: 3.1 }])
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveB = resolve;
        }),
      );

    const { result, rerender } = renderHook(
      ({ reserveId }: { reserveId: bigint }) =>
        useBorrowRateHistory({ reserveId, range: "1w" }),
      { wrapper, initialProps: { reserveId: 5n } },
    );

    await waitFor(() =>
      expect(result.current.points).toEqual([
        { timeMs: 1_000, ratePercent: 3.1 },
      ]),
    );

    rerender({ reserveId: 9n });

    // Reserve 9's fetch is in flight; reserve 5's series must not carry over.
    await waitFor(() => expect(result.current.points).toBeNull());

    resolveB([{ timeMs: 2_000, ratePercent: 4.2 }]);
    await waitFor(() =>
      expect(result.current.points).toEqual([
        { timeMs: 2_000, ratePercent: 4.2 },
      ]),
    );
  });

  it("surfaces a fetch error with points null", async () => {
    vi.mocked(fetchBorrowRateHistory).mockRejectedValue(
      new Error("Borrow rate history request failed"),
    );

    const { result } = renderHook(
      () => useBorrowRateHistory({ reserveId: 5n, range: "1w" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.points).toBeNull();
  });

  it("withholds the last-good series once a background refetch fails, instead of showing stale points alongside the error", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function refetchWrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    }

    vi.mocked(fetchBorrowRateHistory)
      .mockResolvedValueOnce([{ timeMs: 1_000, ratePercent: 3.1 }])
      .mockRejectedValueOnce(new Error("refetch failed"));

    const { result } = renderHook(
      () => useBorrowRateHistory({ reserveId: 5n, range: "1w" }),
      { wrapper: refetchWrapper },
    );

    await waitFor(() =>
      expect(result.current.points).toEqual([
        { timeMs: 1_000, ratePercent: 3.1 },
      ]),
    );
    expect(result.current.error).toBeNull();

    // React Query keeps last-good `data` across a failed refetch for the same
    // key by default, which is exactly the condition that must not leak
    // through as visible points.
    await client.refetchQueries().catch(() => {});

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.points).toBeNull();
  });
});
