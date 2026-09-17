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

const BABYLON_HUB = "0xb3283508a0E96F80CF79DC2a1135F10dA170138D" as const;
const CORE_HUB = "0xF5E52D571Ed9b4779399A815815ABeFF7D7ec4ca" as const;

function makeReserve(
  reserveId: bigint,
  symbol: string,
  assetId: number,
  hub: `0x${string}` = BABYLON_HUB,
): AaveReserveConfig {
  return {
    reserveId,
    reserve: {
      underlying: "0x0000000000000000000000000000000000000010",
      hub,
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

  it("advertises the lowest APR among a token's reserves on different hubs", () => {
    mockConfig([
      makeReserve(0n, "USDC", 0, BABYLON_HUB),
      makeReserve(4n, "USDC", 0, CORE_HUB),
    ]);
    vi.mocked(useAaveBorrowAprs).mockReturnValue({
      aprPercentByReserveId: { "0": 8.8, "4": 2.5 },
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useLandingBorrowAprs());

    expect(result.current.usdc).toBe("2.5%");
  });

  it("waits for every hub's rate before advertising a token", () => {
    mockConfig([
      makeReserve(0n, "USDC", 0, BABYLON_HUB),
      makeReserve(4n, "USDC", 0, CORE_HUB),
    ]);
    vi.mocked(useAaveBorrowAprs).mockReturnValue({
      aprPercentByReserveId: { "0": 8.8 },
      isLoading: true,
      error: null,
    });

    const { result } = renderHook(() => useLandingBorrowAprs());

    expect(result.current.usdc).toBeUndefined();
  });

  it("skips a hub whose rate read failed", () => {
    mockConfig([
      makeReserve(0n, "USDC", 0, BABYLON_HUB),
      makeReserve(4n, "USDC", 0, CORE_HUB),
    ]);
    vi.mocked(useAaveBorrowAprs).mockReturnValue({
      aprPercentByReserveId: { "0": 8.8, "4": null },
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useLandingBorrowAprs());

    expect(result.current.usdc).toBe("8.8%");
  });
});
