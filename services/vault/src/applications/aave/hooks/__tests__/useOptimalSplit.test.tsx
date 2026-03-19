import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: vi.fn(() => ({
    minDeposit: 50_000n,
  })),
}));

const mockUseVaultSplitParams = vi.fn();
vi.mock("../useVaultSplitParams", () => ({
  useVaultSplitParams: (...args: unknown[]) => mockUseVaultSplitParams(...args),
}));

import { useOptimalSplit } from "../useOptimalSplit";

const DEFAULT_PARAMS = { THF: 1.1, CF: 0.75, LB: 1.05 };

describe("useOptimalSplit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseVaultSplitParams.mockReturnValue({
      params: DEFAULT_PARAMS,
      isLoading: false,
      error: null,
    });
  });

  it("computes correct sacrificial and protected vault amounts for 10 BTC", () => {
    const totalBtc = 1_000_000_000n; // 10 BTC in sats
    const { result } = renderHook(() => useOptimalSplit(totalBtc));

    // With THF=1.10, CF=0.75, LB=1.05, HF=0.95, margin=1.05:
    // seized_fraction ≈ 0.398, sacrificial ≈ 4.18 BTC
    expect(result.current.sacrificialVault).toBeGreaterThan(400_000_000n);
    expect(result.current.sacrificialVault).toBeLessThan(430_000_000n);
    expect(result.current.protectedVault).toBe(
      totalBtc - result.current.sacrificialVault,
    );
    expect(result.current.seizedFraction).toBeGreaterThan(0.39);
    expect(result.current.seizedFraction).toBeLessThan(0.41);
    expect(result.current.canSplit).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns canSplit: false when deposit is too small", () => {
    const { result } = renderHook(() => useOptimalSplit(10_000n));
    expect(result.current.canSplit).toBe(false);
  });

  it("returns zero values when totalBtc is 0", () => {
    const { result } = renderHook(() => useOptimalSplit(0n));

    expect(result.current.sacrificialVault).toBe(0n);
    expect(result.current.protectedVault).toBe(0n);
    expect(result.current.canSplit).toBe(false);
  });

  it("returns canSplit: false when params are loading", () => {
    mockUseVaultSplitParams.mockReturnValue({
      params: null,
      isLoading: true,
      error: null,
    });

    const { result } = renderHook(() => useOptimalSplit(1_000_000_000n));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.canSplit).toBe(false);
    expect(result.current.sacrificialVault).toBe(0n);
  });

  it("returns canSplit: false when params errored", () => {
    mockUseVaultSplitParams.mockReturnValue({
      params: null,
      isLoading: false,
      error: new Error("fetch failed"),
    });

    const { result } = renderHook(() => useOptimalSplit(1_000_000_000n));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.canSplit).toBe(false);
  });
});
