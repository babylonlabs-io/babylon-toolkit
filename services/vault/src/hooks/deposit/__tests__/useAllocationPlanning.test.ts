import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseOptimalSplit = vi.fn();
vi.mock("@/applications/aave/hooks/useOptimalSplit", () => ({
  useOptimalSplit: (...args: unknown[]) => mockUseOptimalSplit(...args),
}));

vi.mock("@/context/wallet", () => ({
  useETHWallet: vi.fn(() => ({ address: "0xabc" })),
}));

import { useAllocationPlanning } from "../useAllocationPlanning";

const MIN_DEPOSIT_FOR_SPLIT = 40_000_000n; // 0.4 BTC in sats

// Mirror the real useOptimalSplit shape: a positive minDepositForSplit once
// params have loaded, with canSplit reflecting whether the amount clears it.
function optimalSplit(overrides: {
  minDepositForSplit?: bigint;
  canSplit?: boolean;
  isLoading?: boolean;
}) {
  return {
    sacrificialVault: 0n,
    protectedVault: 0n,
    seizedFraction: 0.4,
    canSplit: overrides.canSplit ?? false,
    minDepositForSplit: overrides.minDepositForSplit ?? MIN_DEPOSIT_FOR_SPLIT,
    isLoading: overrides.isLoading ?? false,
    error: null,
  };
}

// isSplitAmountTooLow drives the "increase your deposit" hint, and its boundary
// must stay complementary with canSplit (which gates on amountSats >=
// minDepositForSplit): the hint shows for every amount below the minimum and
// disappears exactly when the split becomes available.
describe("useAllocationPlanning — isSplitAmountTooLow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is true when the amount is one sat below the split minimum", () => {
    mockUseOptimalSplit.mockReturnValue(optimalSplit({ canSplit: false }));

    const { result } = renderHook(() =>
      useAllocationPlanning({
        amountSats: MIN_DEPOSIT_FOR_SPLIT - 1n,
        isTwoVaultSplit: true,
      }),
    );

    expect(result.current.isSplitAmountTooLow).toBe(true);
    expect(result.current.minDepositForSplit).toBe(MIN_DEPOSIT_FOR_SPLIT);
  });

  it("is false at exactly the split minimum (the split becomes available)", () => {
    mockUseOptimalSplit.mockReturnValue(optimalSplit({ canSplit: true }));

    const { result } = renderHook(() =>
      useAllocationPlanning({
        amountSats: MIN_DEPOSIT_FOR_SPLIT,
        isTwoVaultSplit: true,
      }),
    );

    expect(result.current.isSplitAmountTooLow).toBe(false);
  });

  it("is false when no amount has been entered", () => {
    // Params have loaded with a positive minimum, so the zero-amount guard is
    // the only reason the hint stays hidden (the separate "minimum unavailable"
    // test below isolates the loaded-but-zero-minimum guard).
    mockUseOptimalSplit.mockReturnValue(optimalSplit({ canSplit: false }));

    const { result } = renderHook(() =>
      useAllocationPlanning({ amountSats: 0n, isTwoVaultSplit: true }),
    );

    expect(result.current.isSplitAmountTooLow).toBe(false);
  });

  it("is false while split params are still loading", () => {
    mockUseOptimalSplit.mockReturnValue(
      optimalSplit({ isLoading: true, canSplit: false }),
    );

    const { result } = renderHook(() =>
      useAllocationPlanning({
        amountSats: MIN_DEPOSIT_FOR_SPLIT - 1n,
        isTwoVaultSplit: true,
      }),
    );

    expect(result.current.isSplitAmountTooLow).toBe(false);
  });

  it("is false when the minimum is unavailable (zero)", () => {
    mockUseOptimalSplit.mockReturnValue(
      optimalSplit({ minDepositForSplit: 0n, canSplit: false }),
    );

    const { result } = renderHook(() =>
      useAllocationPlanning({
        amountSats: 10_000_000n,
        isTwoVaultSplit: true,
      }),
    );

    expect(result.current.isSplitAmountTooLow).toBe(false);
  });
});
