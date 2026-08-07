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
      currentUtilizationPercent: 40,
      currentAprPercent: 1.78,
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
    expect(result.current.currentUtilizationPercent).toBe(40);
    expect(result.current.currentAprPercent).toBe(1.78);
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
      currentUtilizationPercent: null,
      currentAprPercent: null,
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
});
