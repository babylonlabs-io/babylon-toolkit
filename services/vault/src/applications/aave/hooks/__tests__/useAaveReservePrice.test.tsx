import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/aaveOracle", () => ({
  getOracleAddress: vi.fn(),
  getReservesPrices: vi.fn(),
}));

vi.mock("@/infrastructure", () => ({ logger: { error: vi.fn() } }));

import { logger } from "@/infrastructure";

import { getOracleAddress, getReservesPrices } from "../../clients/aaveOracle";
import { useAaveReservePrice } from "../useAaveReservePrice";

const SPOKE = "0x0000000000000000000000000000000000000001" as const;
const ORACLE = "0x0000000000000000000000000000000000000002" as const;

/**
 * A read failure the app's retry policy gives up on at once, so a test sees
 * the failed state without waiting out the hook's in-fetch backoff.
 */
function lastingFailure(message = "RPC failure"): Error {
  return Object.assign(new Error(message), { retryable: false });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAaveReservePrice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOracleAddress).mockResolvedValue(ORACLE);
  });

  it("returns USD price scaled from 1e8 base units", async () => {
    vi.mocked(getReservesPrices).mockResolvedValueOnce([8_000_000_000_000n]);
    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: 1n }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.priceUsd).toBe(80_000));
    expect(result.current.error).toBeNull();
  });

  it("returns null priceUsd and surfaces the error on oracle revert", async () => {
    vi.mocked(getReservesPrices).mockRejectedValueOnce(
      lastingFailure("execution reverted: InvalidSource(7)"),
    );
    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: 7n }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.priceUsd).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("clears stale priceUsd after a refetch fails (no stale-price leak)", async () => {
    // First fetch succeeds, then a forced refetch fails. The query data keeps
    // the last price next to the error, to date a recovery; the hook must not
    // serve it, so downstream consumers don't display a price next to an
    // error.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getReservesPrices)
      .mockResolvedValueOnce([8_000_000_000_000n])
      .mockRejectedValueOnce(lastingFailure());

    const wrapperWithClient = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: 1n }),
      { wrapper: wrapperWithClient },
    );

    await waitFor(() => expect(result.current.priceUsd).toBe(80_000));

    await client.refetchQueries({ queryKey: ["aaveReservePrice"] });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.priceUsd).toBeNull();
  });

  it("is disabled when reserveId is undefined", () => {
    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: undefined }),
      { wrapper },
    );
    expect(result.current.priceUsd).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(getReservesPrices).not.toHaveBeenCalled();
  });

  it("is disabled when spokeAddress is undefined", () => {
    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: undefined, reserveId: 1n }),
      { wrapper },
    );
    expect(result.current.priceUsd).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(getOracleAddress).not.toHaveBeenCalled();
  });

  it("keeps a failed first read's error, without reporting loading, while it is retried", async () => {
    // A thrown error would be cleared, and the query reset to loading, on
    // every retry of a read that has never succeeded. A consumer that renders
    // a loading state would blank on every retry.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getReservesPrices)
      .mockRejectedValueOnce(lastingFailure())
      .mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: 3n }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    void client.refetchQueries({ queryKey: ["aaveReservePrice"] });
    await waitFor(() =>
      expect(
        client.getQueryState(["aaveReservePrice", ORACLE, "3"])?.fetchStatus,
      ).toBe("fetching"),
    );
    // Let React Query's batched notification re-render the hook.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.priceUsd).toBeNull();
  });

  it("keeps a failed oracle-address read's error, without reporting loading, while it is retried", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getOracleAddress)
      .mockRejectedValueOnce(lastingFailure())
      .mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: 3n }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    void client.refetchQueries({ queryKey: ["aaveOracleAddress"] });
    await waitFor(() =>
      expect(
        client.getQueryState(["aaveOracleAddress", SPOKE])?.fetchStatus,
      ).toBe("fetching"),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(getReservesPrices).not.toHaveBeenCalled();
  });

  it("dates the price by when its value last changed, not by every poll", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      vi.mocked(getReservesPrices)
        .mockResolvedValueOnce([8_000_000_000_000n])
        .mockResolvedValueOnce([8_000_000_000_000n])
        .mockResolvedValueOnce([7_900_000_000_000n]);
      vi.setSystemTime(1_000_000);

      const { result } = renderHook(
        () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: 1n }),
        {
          wrapper: ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>
              {children}
            </QueryClientProvider>
          ),
        },
      );
      await waitFor(() => expect(result.current.priceUsd).toBe(80_000));
      expect(result.current.priceChangedAt).toBe(1_000_000);

      // A minute later the poll reads the same price.
      vi.setSystemTime(1_060_000);
      await act(() =>
        client.refetchQueries({ queryKey: ["aaveReservePrice"] }),
      );
      expect(
        client.getQueryState(["aaveReservePrice", ORACLE, "1"])?.dataUpdatedAt,
      ).toBe(1_060_000);
      // Let React Query's batched notification re-render the hook.
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(result.current.priceChangedAt).toBe(1_000_000);

      // The next poll reads a new price.
      vi.setSystemTime(1_120_000);
      await act(() =>
        client.refetchQueries({ queryKey: ["aaveReservePrice"] }),
      );
      await waitFor(() => expect(result.current.priceUsd).toBe(79_000));
      expect(result.current.priceChangedAt).toBe(1_120_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a read that keeps failing to error tracking once, not on every retry", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getReservesPrices).mockRejectedValue(lastingFailure());

    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: 3n }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    await act(() => client.refetchQueries({ queryKey: ["aaveReservePrice"] }));

    expect(getReservesPrices).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("does not carry one reserve's failed read over to the next reserve", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getReservesPrices)
      .mockRejectedValueOnce(lastingFailure())
      .mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ reserveId }: { reserveId: bigint }) =>
        useAaveReservePrice({ spokeAddress: SPOKE, reserveId }),
      {
        initialProps: { reserveId: 1n },
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    rerender({ reserveId: 2n });
    await waitFor(() => expect(getReservesPrices).toHaveBeenCalledTimes(2));

    // No last price to carry over, so the next reserve loads as a first read.
    expect(result.current.error).toBeNull();
    expect(result.current.priceUsd).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPriceStale).toBe(false);
  });

  it("carries the previous reserve's last price, not its failure, while the next reserve loads", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getReservesPrices)
      .mockResolvedValueOnce([8_000_000_000_000n])
      .mockRejectedValueOnce(lastingFailure())
      .mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ reserveId }: { reserveId: bigint }) =>
        useAaveReservePrice({ spokeAddress: SPOKE, reserveId }),
      {
        initialProps: { reserveId: 1n },
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.priceUsd).toBe(80_000));
    await act(() => client.refetchQueries({ queryKey: ["aaveReservePrice"] }));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    rerender({ reserveId: 2n });
    await waitFor(() => expect(getReservesPrices).toHaveBeenCalledTimes(3));

    expect(result.current.error).toBeNull();
    expect(result.current.priceUsd).toBe(80_000);
    expect(result.current.isPriceStale).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it("retries a read that is already failing with a single read, not another round of backoff", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      vi.mocked(getReservesPrices).mockRejectedValue(
        new Error("HTTP request failed. Status: 429"),
      );

      const { result } = renderHook(
        () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: 3n }),
        {
          wrapper: ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>
              {children}
            </QueryClientProvider>
          ),
        },
      );
      // The first failure gets the quick retries: four reads over 7s.
      await waitFor(() => expect(getReservesPrices).toHaveBeenCalledTimes(1));
      await act(() => vi.advanceTimersByTimeAsync(7_000));
      await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
      expect(getReservesPrices).toHaveBeenCalledTimes(4);

      await act(() =>
        client.refetchQueries({ queryKey: ["aaveReservePrice"] }),
      );

      expect(getReservesPrices).toHaveBeenCalledTimes(5);
      expect(result.current.error).toBeInstanceOf(Error);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the last price through a failed poll that a quick retry recovers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      vi.mocked(getReservesPrices)
        .mockResolvedValueOnce([8_000_000_000_000n])
        .mockRejectedValueOnce(new Error("HTTP request failed. Status: 429"))
        .mockResolvedValueOnce([7_900_000_000_000n]);

      const { result } = renderHook(
        () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: 1n }),
        {
          wrapper: ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>
              {children}
            </QueryClientProvider>
          ),
        },
      );
      await waitFor(() => expect(result.current.priceUsd).toBe(80_000));

      void client.refetchQueries({ queryKey: ["aaveReservePrice"] });
      await waitFor(() => expect(getReservesPrices).toHaveBeenCalledTimes(2));
      await act(() => vi.advanceTimersByTimeAsync(0));
      // Waiting out the first backoff step: nothing has failed yet.
      expect(result.current.priceUsd).toBe(80_000);
      expect(result.current.error).toBeNull();

      await act(() => vi.advanceTimersByTimeAsync(1_000));
      await waitFor(() => expect(result.current.priceUsd).toBe(79_000));
      expect(result.current.error).toBeNull();
      expect(logger.error).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
