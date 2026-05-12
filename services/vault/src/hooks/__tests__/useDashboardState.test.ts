import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDashboardState } from "../useDashboardState";

const stableFindProvider = vi.fn(() => undefined);

vi.mock("@/applications/aave/hooks", () => ({
  useAaveUserPosition: () => ({
    position: null,
    collateralBtc: 0,
    collateralValueUsd: 0,
    debtValueUsd: 0,
    healthFactor: null,
    healthFactorStatus: null,
    isLoading: false,
  }),
  useAaveBorrowedAssets: () => ({
    borrowedAssets: [],
    hasLoans: false,
  }),
}));

vi.mock("@/hooks/deposit/useVaultProviders", () => ({
  useVaultProviders: () => ({
    vaultProviders: [],
    vaultKeepers: [],
    loading: false,
    error: null,
    refetch: async () => {},
    findProvider: stableFindProvider,
  }),
}));

describe("useDashboardState ref stability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a stable collateralVaults reference across re-renders when position?.collaterals is undefined", () => {
    const { result, rerender } = renderHook(() => useDashboardState("0xabc"));
    const first = result.current.collateralVaults;
    rerender();
    expect(result.current.collateralVaults).toBe(first);
  });
});
