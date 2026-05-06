import { act, renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  LoanProvider,
  type LoanContextValue,
} from "@/applications/aave/components/context/LoanContext";

import { useBorrowFormState } from "../useBorrowFormState";

const mockExecuteBorrow = vi.fn();
vi.mock("@/applications/aave/hooks", () => ({
  useBorrowTransaction: () => ({
    executeBorrow: mockExecuteBorrow,
    isProcessing: false,
  }),
}));

// The shared test setup mocks "@/config" without FeatureFlags. Extend that
// mock here so the hook's FeatureFlags.isBorrowDisabled read does not crash.
vi.mock("@/config", () => ({
  FeatureFlags: {
    isBorrowDisabled: false,
  },
  getNetworkConfigBTC: () => ({
    coinName: "Signet BTC",
    coinSymbol: "sBTC",
    networkName: "BTC signet",
    mempoolApiUrl: "https://mempool.space/signet",
    network: "signet",
    icon: "/images/signet_bitcoin.svg",
    name: "Signet Bitcoin",
    displayUSD: false,
  }),
  getBTCNetwork: () => "signet",
  CONTRACTS: {},
  ENV: {},
  isProductionEnv: () => false,
  getCommitHash: () => "test-commit",
}));

const RESERVE = {
  reserveId: 1n,
  token: { address: "0xtoken", decimals: 18 },
} as unknown as LoanContextValue["selectedReserve"];

const ASSET = {
  symbol: "USDC",
  name: "USD Coin",
  icon: "/usdc.svg",
} as LoanContextValue["assetConfig"];

function makeContext(
  overrides: Partial<LoanContextValue> = {},
): LoanContextValue {
  return {
    collateralValueUsd: 1000,
    currentDebtAmount: 500,
    totalDebtValueUsd: 500,
    healthFactor: 1.6,
    liquidationThresholdBps: 8000,
    selectedReserve: RESERVE,
    assetConfig: ASSET,
    proxyContract: "0xproxy",
    tokenPriceUsd: 1,
    isPositionDataStale: false,
    refetchPosition: vi.fn().mockResolvedValue(null),
    refetchSplitParams: vi.fn().mockResolvedValue(null),
    onBorrowSuccess: () => {},
    onRepaySuccess: () => {},
    ...overrides,
  };
}

function wrapWith(value: LoanContextValue) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <LoanProvider value={value}>{children}</LoanProvider>;
  };
}

describe("useBorrowFormState — staleness gate (audit #251)", () => {
  it("disables the button and shows 'Refreshing position...' when isPositionDataStale is true", () => {
    const ctx = makeContext({ isPositionDataStale: true });
    const { result } = renderHook(
      () => useBorrowFormState({ onBorrowSuccess: () => {} }),
      { wrapper: wrapWith(ctx) },
    );

    expect(result.current.isDisabled).toBe(true);
    expect(result.current.buttonText).toBe("Refreshing position...");
  });

  it("does not short-circuit on staleness when isPositionDataStale is false", () => {
    const ctx = makeContext({ isPositionDataStale: false });
    const { result } = renderHook(
      () => useBorrowFormState({ onBorrowSuccess: () => {} }),
      { wrapper: wrapWith(ctx) },
    );

    // borrowAmount starts at 0 so button text falls through to "Enter an amount",
    // which is the validateBorrowAction path *after* the staleness short-circuit.
    expect(result.current.buttonText).toBe("Enter an amount");
  });
});

describe("useBorrowFormState — pre-sign wire-up (audit #260 + #251)", () => {
  it("calls executeBorrow with a preSignValidation callback in arg 3", async () => {
    mockExecuteBorrow.mockReset();
    mockExecuteBorrow.mockResolvedValue(true);

    const ctx = makeContext();
    const { result } = renderHook(
      () => useBorrowFormState({ onBorrowSuccess: () => {} }),
      { wrapper: wrapWith(ctx) },
    );

    await act(async () => {
      await result.current.handleBorrow();
    });

    expect(mockExecuteBorrow).toHaveBeenCalledOnce();
    const [, , preSignValidation] = mockExecuteBorrow.mock.calls[0];
    expect(typeof preSignValidation).toBe("function");
  });
});
