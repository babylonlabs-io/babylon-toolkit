import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DebtPositionFetchError,
  IncompleteDebtDiscoveryError,
} from "@/applications/aave/services";

const mockUseAaveUserPosition = vi.fn<(addr?: string) => unknown>();
const mockUseAaveBorrowedAssets = vi.fn<(props: unknown) => unknown>(() => ({
  borrowedAssets: [],
  totalDebtValueUsd: 0,
  hasLoans: false,
}));
const mockUseVaultProviders = vi.fn(() => ({ findProvider: vi.fn() }));

vi.mock("@/applications/aave/hooks", () => ({
  useAaveUserPosition: (addr?: string) => mockUseAaveUserPosition(addr),
  useAaveBorrowedAssets: (props: unknown) => mockUseAaveBorrowedAssets(props),
}));

vi.mock("@/hooks/deposit/useVaultProviders", () => ({
  useVaultProviders: () => mockUseVaultProviders(),
}));

vi.mock("@/utils/collateral", () => ({
  toCollateralVaultEntries: vi.fn(() => []),
}));

import { useDashboardState } from "../useDashboardState";

const baseUserPosition = {
  position: null,
  collateralBtc: 0,
  collateralValueUsd: 0,
  debtValueUsd: 0,
  healthFactor: null,
  healthFactorStatus: "healthy",
  isPositionDataStale: false,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};

describe("useDashboardState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAaveUserPosition.mockReturnValue(baseUserPosition);
  });

  it("flags debtDiscoveryFailed=true when useAaveUserPosition errors with IncompleteDebtDiscoveryError", () => {
    mockUseAaveUserPosition.mockReturnValue({
      ...baseUserPosition,
      error: new IncompleteDebtDiscoveryError(0, 1n, []),
    });

    const { result } = renderHook(() => useDashboardState("0xUser"));

    expect(result.current.debtDiscoveryFailed).toBe(true);
  });

  it("flags debtDiscoveryFailed=true when useAaveUserPosition errors with DebtPositionFetchError", () => {
    mockUseAaveUserPosition.mockReturnValue({
      ...baseUserPosition,
      error: new DebtPositionFetchError(7n, new Error("rpc lost")),
    });

    const { result } = renderHook(() => useDashboardState("0xUser"));

    expect(result.current.debtDiscoveryFailed).toBe(true);
  });

  it("flags debtDiscoveryFailed=false on unrelated errors so they don't accidentally block borrow/repay", () => {
    mockUseAaveUserPosition.mockReturnValue({
      ...baseUserPosition,
      error: new Error("some unrelated error"),
    });

    const { result } = renderHook(() => useDashboardState("0xUser"));

    expect(result.current.debtDiscoveryFailed).toBe(false);
  });

  it("flags debtDiscoveryFailed=false when there is no error", () => {
    const { result } = renderHook(() => useDashboardState("0xUser"));

    expect(result.current.debtDiscoveryFailed).toBe(false);
  });
});
