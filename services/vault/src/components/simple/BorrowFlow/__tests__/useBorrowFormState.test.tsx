import {
  AAVE_BASE_CURRENCY_DECIMALS,
  AAVE_BASE_CURRENCY_RAY_DECIMALS,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
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

const USD_BASE = 10n ** BigInt(AAVE_BASE_CURRENCY_DECIMALS);
const USD_RAY = 10n ** BigInt(AAVE_BASE_CURRENCY_RAY_DECIMALS);

function buildAccountData(collateralUsd: bigint, debtUsd: bigint) {
  return {
    riskPremium: 0n,
    avgCollateralFactor: 0n,
    healthFactor: 0n,
    totalCollateralValue: collateralUsd * USD_BASE,
    totalDebtValueRay: debtUsd * USD_RAY,
    activeCollateralCount: 0n,
    borrowCount: 0n,
  };
}

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

  it("does not disable on staleness when isPositionDataStale is false", () => {
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

describe("useBorrowFormState — pre-sign HF gate (audit #251)", () => {
  it("passes a preSignValidation closure into executeBorrow", async () => {
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

  it("preSignValidation throws when fresh position pushes projected HF below MIN_HEALTH_FACTOR_FOR_BORROW", async () => {
    mockExecuteBorrow.mockReset();
    mockExecuteBorrow.mockResolvedValue(true);

    // Fresh position: $1000 collateral, $700 debt, 80% liq threshold.
    // Pre-borrow HF = 1000 * 0.8 / 700 ≈ 1.14 — already below 1.2.
    // Borrowing anything more keeps it below 1.2.
    const refetchPosition = vi.fn().mockResolvedValue({
      accountData: buildAccountData(1000n, 700n),
    });
    const ctx = makeContext({
      collateralValueUsd: 1000,
      totalDebtValueUsd: 700,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 1,
      refetchPosition,
    });

    const { result } = renderHook(
      () =>
        useBorrowFormState({
          onBorrowSuccess: () => {},
        }),
      { wrapper: wrapWith(ctx) },
    );

    act(() => {
      result.current.setBorrowAmount(50);
    });

    await act(async () => {
      await result.current.handleBorrow();
    });

    const [, , preSignValidation] = mockExecuteBorrow.mock.calls[0];
    await expect(preSignValidation()).rejects.toThrow(
      /Projected health factor.*would be below 1\.2/,
    );
    expect(refetchPosition).toHaveBeenCalled();
  });

  it("preSignValidation resolves without throwing when fresh position keeps projected HF safely above the floor", async () => {
    mockExecuteBorrow.mockReset();
    mockExecuteBorrow.mockResolvedValue(true);

    // Fresh position: $1000 collateral, $100 debt, 80% liq threshold.
    // Pre-borrow HF = 1000 * 0.8 / 100 = 8.0; borrowing 50 USDC at $1 keeps HF = 5.33.
    const refetchPosition = vi.fn().mockResolvedValue({
      accountData: buildAccountData(1000n, 100n),
    });
    const ctx = makeContext({
      collateralValueUsd: 1000,
      totalDebtValueUsd: 100,
      liquidationThresholdBps: 8000,
      tokenPriceUsd: 1,
      refetchPosition,
    });

    const { result } = renderHook(
      () => useBorrowFormState({ onBorrowSuccess: () => {} }),
      { wrapper: wrapWith(ctx) },
    );

    act(() => {
      result.current.setBorrowAmount(50);
    });

    await act(async () => {
      await result.current.handleBorrow();
    });

    const [, , preSignValidation] = mockExecuteBorrow.mock.calls[0];
    await expect(preSignValidation()).resolves.toBeUndefined();
  });

  it("preSignValidation throws when tokenPriceUsd is null at sign time", async () => {
    mockExecuteBorrow.mockReset();
    mockExecuteBorrow.mockResolvedValue(true);

    const refetchPosition = vi.fn();
    const ctx = makeContext({
      tokenPriceUsd: null,
      refetchPosition,
    });

    const { result } = renderHook(
      () => useBorrowFormState({ onBorrowSuccess: () => {} }),
      { wrapper: wrapWith(ctx) },
    );

    await act(async () => {
      await result.current.handleBorrow();
    });

    const [, , preSignValidation] = mockExecuteBorrow.mock.calls[0];
    await expect(preSignValidation()).rejects.toThrow(
      /Token price unavailable/,
    );
    expect(refetchPosition).not.toHaveBeenCalled();
  });

  it("preSignValidation skips revalidation when refetchPosition returns null (first borrow)", async () => {
    mockExecuteBorrow.mockReset();
    mockExecuteBorrow.mockResolvedValue(true);

    const refetchPosition = vi.fn().mockResolvedValue(null);
    const ctx = makeContext({ refetchPosition });

    const { result } = renderHook(
      () => useBorrowFormState({ onBorrowSuccess: () => {} }),
      { wrapper: wrapWith(ctx) },
    );

    await act(async () => {
      await result.current.handleBorrow();
    });

    const [, , preSignValidation] = mockExecuteBorrow.mock.calls[0];
    await expect(preSignValidation()).resolves.toBeUndefined();
    expect(refetchPosition).toHaveBeenCalled();
  });
});
