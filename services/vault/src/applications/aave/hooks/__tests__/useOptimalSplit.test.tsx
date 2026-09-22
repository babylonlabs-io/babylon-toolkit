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

// Launch values: split THF 1.08, expected HF 0.99, CF 78%, bonus at HF 0.99
const DEFAULT_PARAMS = {
  THF: 1.08,
  expectedHF: 0.99,
  CF: 0.78,
  LB: 1.0504,
  maxLB: 1.0555,
};

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

    // seized_fraction ≈ 0.2857 with no extra buffer: 2.857 / 7.143 BTC
    expect(result.current.sacrificialVault).toBe(285_716_677n);
    expect(result.current.protectedVault).toBe(714_283_323n);
    expect(result.current.seizedFraction).toBeCloseTo(0.28572, 5);
    expect(result.current.canSplit).toBe(true);
    expect(result.current.sizingViolation).toBeNull();
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

  it("returns an empty result without throwing for an oversized amount", () => {
    // Above Bitcoin's max supply (21M BTC) — would trip the SDK's
    // assertSafePrecision guard (RangeError); the hook must bail safely.
    const { result } = renderHook(() =>
      useOptimalSplit(2_100_000_100_000_000n),
    );

    expect(result.current.canSplit).toBe(false);
    expect(result.current.sacrificialVault).toBe(0n);
    expect(result.current.protectedVault).toBe(0n);
  });

  it("sets the split minimum to minDeposit divided by the sacrificial share", () => {
    const { result } = renderHook(() => useOptimalSplit(1_000_000_000n));

    // ceil(50_000 / 0.2857166769…) = 174_999
    expect(result.current.minDepositForSplit).toBe(174_999n);
  });

  it("refuses the split and reports why when the sacrificial vault would not be smaller", () => {
    // CF 87% puts the sacrificial share just above 50%
    mockUseVaultSplitParams.mockReturnValue({
      params: { ...DEFAULT_PARAMS, CF: 0.87 },
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useOptimalSplit(1_000_000_000n));

    expect(result.current.sizingViolation).toBe("sacrificial-not-smaller");
    expect(result.current.canSplit).toBe(false);
    expect(result.current.sacrificialVault).toBe(0n);
    expect(result.current.protectedVault).toBe(0n);
    expect(result.current.minDepositForSplit).toBe(0n);
  });

  it("reports a refused split before any amount is entered", () => {
    mockUseVaultSplitParams.mockReturnValue({
      params: { ...DEFAULT_PARAMS, THF: 0.99 },
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useOptimalSplit(0n));

    expect(result.current.sizingViolation).toBe("target-not-above-expected-hf");
    expect(result.current.canSplit).toBe(false);
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
