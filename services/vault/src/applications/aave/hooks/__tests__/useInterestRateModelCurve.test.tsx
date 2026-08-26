import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/clients/indexer/aaveIrmClient", () => ({
  fetchIrmCurve: vi.fn(),
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn() },
}));

import { fetchIrmCurve } from "@/clients/indexer/aaveIrmClient";
import { logger } from "@/infrastructure";

import type { AaveReserveConfig } from "../../services/fetchConfig";
import { useInterestRateModelCurve } from "../useInterestRateModelCurve";

const HUB = "0x0000000000000000000000000000000000000003" as const;
const HOUR_MS = 60 * 60 * 1000;
const SIXTY_SECONDS_MS = 60_000;

function makeReserve(assetId = 0): AaveReserveConfig {
  return {
    reserveId: 1n,
    reserve: {
      underlying: "0x0000000000000000000000000000000000000010",
      hub: HUB,
      assetId,
      decimals: 6,
      dynamicConfigKey: 0,
      paused: false,
      frozen: false,
      borrowable: true,
      collateralRisk: 0,
      collateralFactor: 8000,
    },
    token: {
      address: "0x0000000000000000000000000000000000000010",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    },
  };
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return { client, wrapper };
}

describe("useInterestRateModelCurve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the fetched curve and figures through", async () => {
    vi.mocked(fetchIrmCurve).mockResolvedValue({
      curve: [
        { utilizationPercent: 0, aprPercent: 0 },
        { utilizationPercent: 90, aprPercent: 4 },
        { utilizationPercent: 100, aprPercent: 64 },
      ],
      kinkUtilizationPercent: 90,
      maxAprPercent: 64,
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useInterestRateModelCurve({ reserve: makeReserve() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.curve).not.toBeNull());
    expect(result.current.curve).toHaveLength(3);
    expect(result.current.kinkUtilizationPercent).toBe(90);
    expect(result.current.maxAprPercent).toBe(64);
    expect(result.current.error).toBeNull();
    expect(fetchIrmCurve).toHaveBeenCalledWith({
      reserveId: 1n,
      signal: expect.any(AbortSignal),
    });
  });

  it("surfaces a fetch rejection with a null curve", async () => {
    vi.mocked(fetchIrmCurve).mockRejectedValue(
      new Error(
        "IRM curve request to https://indexer.test failed with status 502",
      ),
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useInterestRateModelCurve({ reserve: makeReserve() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.curve).toBeNull();
    expect(result.current.kinkUtilizationPercent).toBeNull();
    expect(result.current.maxAprPercent).toBeNull();
  });

  it("is disabled when reserve is null", () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useInterestRateModelCurve({ reserve: null }),
      { wrapper },
    );

    expect(result.current.curve).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(fetchIrmCurve).not.toHaveBeenCalled();
  });

  describe("refetch cadence", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("on success, does not refetch just under an hour later, then refetches exactly once past the hour", async () => {
      vi.mocked(fetchIrmCurve).mockResolvedValue({
        curve: [
          { utilizationPercent: 0, aprPercent: 0 },
          { utilizationPercent: 100, aprPercent: 10 },
        ],
        kinkUtilizationPercent: 50,
        maxAprPercent: 10,
      });

      const { wrapper } = makeWrapper();
      const { result } = renderHook(
        () => useInterestRateModelCurve({ reserve: makeReserve() }),
        { wrapper },
      );

      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(result.current.curve).not.toBeNull();
      expect(fetchIrmCurve).toHaveBeenCalledTimes(1);

      await act(() => vi.advanceTimersByTimeAsync(HOUR_MS - 1000));
      expect(fetchIrmCurve).toHaveBeenCalledTimes(1);

      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(fetchIrmCurve).toHaveBeenCalledTimes(2);
    });

    it("on an errored read, retries 60s later", async () => {
      vi.mocked(fetchIrmCurve).mockRejectedValue(new Error("boom"));

      const { wrapper } = makeWrapper();
      const { result } = renderHook(
        () => useInterestRateModelCurve({ reserve: makeReserve() }),
        { wrapper },
      );

      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(result.current.error).toBeInstanceOf(Error);
      expect(fetchIrmCurve).toHaveBeenCalledTimes(1);

      await act(() => vi.advanceTimersByTimeAsync(SIXTY_SECONDS_MS));
      expect(fetchIrmCurve).toHaveBeenCalledTimes(2);
    });
  });

  it("reports one Sentry error on the ok -> error edge, not once per retry", async () => {
    // `QueryCache.onError` never fires for this query: the queryFn resolves.
    // Reporting per refetch instead would bill ~60 issues an hour per viewer,
    // which is the alert storm `queryClient.ts` documents.
    vi.useFakeTimers();
    try {
      vi.mocked(fetchIrmCurve).mockRejectedValue(new Error("boom"));

      const { wrapper } = makeWrapper();
      renderHook(() => useInterestRateModelCurve({ reserve: makeReserve() }), {
        wrapper,
      });

      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(logger.error).toHaveBeenCalledTimes(1);

      await act(() => vi.advanceTimersByTimeAsync(SIXTY_SECONDS_MS * 3));
      expect(vi.mocked(fetchIrmCurve).mock.calls.length).toBeGreaterThan(1);
      expect(logger.error).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops the retained curve once it is older than an hour, so a stuck outage surfaces", async () => {
    // Retention is measured from the last SUCCESSFUL read. Without the cap a
    // permanently broken endpoint chains its retained curve forward for the
    // life of the tab, which is neither hour-stable nor the "up to an hour"
    // the module doc promises.
    vi.useFakeTimers();
    try {
      vi.mocked(fetchIrmCurve)
        .mockResolvedValueOnce({
          curve: [
            { utilizationPercent: 0, aprPercent: 0 },
            { utilizationPercent: 100, aprPercent: 10 },
          ],
          kinkUtilizationPercent: 50,
          maxAprPercent: 10,
        })
        .mockRejectedValue(new Error("boom"));

      const { wrapper } = makeWrapper();
      const { result } = renderHook(
        () => useInterestRateModelCurve({ reserve: makeReserve() }),
        { wrapper },
      );

      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(result.current.curve).not.toBeNull();

      // The healthy refetch lands on the hour and fails. Still inside the
      // retention ceiling, so the shape is kept and the 60s retries can heal
      // it silently.
      await act(() => vi.advanceTimersByTimeAsync(HOUR_MS + SIXTY_SECONDS_MS));
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.curve).not.toBeNull();

      // Past the ceiling with no successful read since: dropped, so the card
      // falls to its "Chart unavailable" state.
      await act(() => vi.advanceTimersByTimeAsync(HOUR_MS));
      expect(result.current.curve).toBeNull();
      expect(result.current.kinkUtilizationPercent).toBeNull();
      expect(result.current.maxAprPercent).toBeNull();
      expect(result.current.error).toBeInstanceOf(Error);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retains the last-good curve and reports a non-null error when a refetch after a successful load fails", async () => {
    vi.mocked(fetchIrmCurve)
      .mockResolvedValueOnce({
        curve: [
          { utilizationPercent: 0, aprPercent: 0 },
          { utilizationPercent: 100, aprPercent: 10 },
        ],
        kinkUtilizationPercent: 50,
        maxAprPercent: 10,
      })
      .mockRejectedValueOnce(new Error("boom"));

    const { client, wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useInterestRateModelCurve({ reserve: makeReserve() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.curve).not.toBeNull());
    expect(result.current.error).toBeNull();

    await client.refetchQueries();

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.curve).toHaveLength(2);
    expect(result.current.kinkUtilizationPercent).toBe(50);
    expect(result.current.maxAprPercent).toBe(10);
    expect(fetchIrmCurve).toHaveBeenCalledTimes(2);
  });
});
