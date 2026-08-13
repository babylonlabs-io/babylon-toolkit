import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/aaveIrm", () => ({
  getInterestRateModelCurveSafe: vi.fn(),
}));

import { getInterestRateModelCurveSafe } from "../../clients/aaveIrm";
import type { AaveReserveConfig } from "../../services/fetchConfig";
import { useInterestRateModelCurve } from "../useInterestRateModelCurve";

const HUB = "0x0000000000000000000000000000000000000003" as const;

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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useInterestRateModelCurve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the Safe result's curve and figures through", async () => {
    vi.mocked(getInterestRateModelCurveSafe).mockResolvedValue({
      curve: [
        { utilizationPercent: 0, aprPercent: 0 },
        { utilizationPercent: 90, aprPercent: 4 },
        { utilizationPercent: 100, aprPercent: 64 },
      ],
      kinkUtilizationPercent: 90,
      maxAprPercent: 64,
      error: null,
    });

    const { result } = renderHook(
      () => useInterestRateModelCurve({ reserve: makeReserve() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.curve).not.toBeNull());
    expect(result.current.curve).toHaveLength(3);
    expect(result.current.kinkUtilizationPercent).toBe(90);
    expect(result.current.maxAprPercent).toBe(64);
    expect(result.current.error).toBeNull();
    expect(getInterestRateModelCurveSafe).toHaveBeenCalledWith({
      hub: HUB,
      assetId: 0,
    });
  });

  it("surfaces the Safe result's error with a null curve", async () => {
    vi.mocked(getInterestRateModelCurveSafe).mockResolvedValue({
      curve: null,
      kinkUtilizationPercent: null,
      maxAprPercent: null,
      error: new Error("Interest-rate strategy curve read reverted"),
    });

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
    const { result } = renderHook(
      () => useInterestRateModelCurve({ reserve: null }),
      { wrapper },
    );

    expect(result.current.curve).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(getInterestRateModelCurveSafe).not.toHaveBeenCalled();
  });

  it("withholds the retained curve when a refetch after a successful load fails", async () => {
    vi.mocked(getInterestRateModelCurveSafe)
      .mockResolvedValueOnce({
        curve: [
          { utilizationPercent: 0, aprPercent: 0 },
          { utilizationPercent: 100, aprPercent: 10 },
        ],
        kinkUtilizationPercent: 50,
        maxAprPercent: 10,
        error: null,
      })
      .mockResolvedValueOnce({
        curve: null,
        kinkUtilizationPercent: null,
        maxAprPercent: null,
        error: new Error("boom"),
      });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function scopedWrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    }

    const { result } = renderHook(
      () => useInterestRateModelCurve({ reserve: makeReserve() }),
      { wrapper: scopedWrapper },
    );

    await waitFor(() => expect(result.current.curve).not.toBeNull());

    await client.refetchQueries();

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.curve).toBeNull();
    expect(result.current.kinkUtilizationPercent).toBeNull();
    expect(result.current.maxAprPercent).toBeNull();
  });
});
