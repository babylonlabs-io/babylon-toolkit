import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/applications/aave/context", () => ({
  useAaveConfig: vi.fn(),
}));
vi.mock("@/applications/aave/hooks", () => ({
  useAaveBorrowAprs: vi.fn(),
}));

import { useAaveConfig } from "@/applications/aave/context";
import { useAaveBorrowAprs } from "@/applications/aave/hooks";
import type { AaveReserveConfig } from "@/applications/aave/services/fetchConfig";

import { useLandingBorrowAprs } from "../useLandingBorrowAprs";

const HUB = "0x0000000000000000000000000000000000000003" as const;

function makeReserve(
  reserveId: bigint,
  symbol: string,
  assetId: number,
): AaveReserveConfig {
  return {
    reserveId,
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
      symbol,
      name: symbol,
      decimals: 6,
    },
  };
}

function mockConfig(reserves: AaveReserveConfig[]) {
  vi.mocked(useAaveConfig).mockReturnValue({
    config: null,
    vbtcReserve: null,
    borrowableReserves: reserves,
    allBorrowReserves: reserves,
  });
}

describe("useLandingBorrowAprs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps each advertised symbol to its formatted borrow APR", () => {
    mockConfig([
      makeReserve(1n, "USDT", 1),
      makeReserve(2n, "USDC", 0),
      makeReserve(3n, "WBTC", 3),
    ]);
    vi.mocked(useAaveBorrowAprs).mockReturnValue({
      aprPercentByReserveId: { "1": 3.7, "2": 4.25, "3": 0 },
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useLandingBorrowAprs());

    expect(result.current).toEqual({
      usdt: "3.7%",
      usdc: "4.25%",
      wbtc: "0%",
    });
  });

  it("leaves a symbol undefined when its reserve is absent or its rate failed", () => {
    mockConfig([makeReserve(1n, "USDT", 1)]);
    vi.mocked(useAaveBorrowAprs).mockReturnValue({
      aprPercentByReserveId: { "1": null },
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useLandingBorrowAprs());

    expect(result.current).toEqual({
      usdt: undefined,
      usdc: undefined,
      wbtc: undefined,
    });
  });

  it("picks the lowest reserveId when two borrowable reserves share a symbol", () => {
    // Indexer returns the higher reserveId first; selection must not depend on order.
    mockConfig([makeReserve(9n, "USDT", 1), makeReserve(4n, "USDT", 1)]);
    vi.mocked(useAaveBorrowAprs).mockReturnValue({
      aprPercentByReserveId: { "4": 2.5, "9": 8.8 },
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useLandingBorrowAprs());

    expect(result.current.usdt).toBe("2.5%");
  });
});
