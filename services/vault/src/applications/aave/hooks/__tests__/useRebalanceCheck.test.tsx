import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseVaultSplitParams = vi.fn();
vi.mock("../useVaultSplitParams", () => ({
  useVaultSplitParams: (...args: unknown[]) => mockUseVaultSplitParams(...args),
}));

import { useRebalanceCheck } from "../useRebalanceCheck";

const DEFAULT_PARAMS = { THF: 1.1, CF: 0.75, LB: 1.05 };

describe("useRebalanceCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseVaultSplitParams.mockReturnValue({
      params: DEFAULT_PARAMS,
      isLoading: false,
      error: null,
    });
  });

  it("detects rebalance needed when sacrificial vault is too small", () => {
    // Total = 10 BTC, sacrificial = 1 BTC (too small), protected = 9 BTC
    const vaultAmounts = [100_000_000n, 900_000_000n];

    const { result } = renderHook(() => useRebalanceCheck(vaultAmounts));

    // Target coverage ≈ 4.18 BTC, current = 1 BTC → needs rebalance
    expect(result.current.needsRebalance).toBe(true);
    expect(result.current.deficit).toBeGreaterThan(0n);
    expect(result.current.targetCoverage).toBeGreaterThan(
      result.current.currentCoverage,
    );
    expect(result.current.currentCoverage).toBe(100_000_000n);
  });

  it("returns no rebalance needed when sacrificial vault is adequate", () => {
    // Total = 10 BTC, sacrificial = 5 BTC (more than enough), protected = 5 BTC
    const vaultAmounts = [500_000_000n, 500_000_000n];

    const { result } = renderHook(() => useRebalanceCheck(vaultAmounts));

    expect(result.current.needsRebalance).toBe(false);
    expect(result.current.deficit).toBe(0n);
  });

  it("returns default result when fewer than 2 vaults", () => {
    const { result } = renderHook(() => useRebalanceCheck([500_000_000n]));

    expect(result.current.needsRebalance).toBe(false);
    expect(result.current.deficit).toBe(0n);
    expect(result.current.currentCoverage).toBe(0n);
    expect(result.current.targetCoverage).toBe(0n);
  });

  it("returns default result for empty vault array", () => {
    const { result } = renderHook(() => useRebalanceCheck([]));
    expect(result.current.needsRebalance).toBe(false);
  });

  it("returns default result when params are loading", () => {
    mockUseVaultSplitParams.mockReturnValue({
      params: null,
      isLoading: true,
      error: null,
    });

    const { result } = renderHook(() =>
      useRebalanceCheck([100_000_000n, 900_000_000n]),
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.needsRebalance).toBe(false);
  });
});
