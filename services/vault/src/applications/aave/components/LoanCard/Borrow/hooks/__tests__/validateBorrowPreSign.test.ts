import {
  AAVE_BASE_CURRENCY_DECIMALS,
  AAVE_BASE_CURRENCY_RAY_DECIMALS,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { describe, expect, it, vi } from "vitest";

import type { AavePositionWithLiveData } from "../../../../../services";
import { validateBorrowPreSign } from "../validateBorrowPreSign";

const USD_COLLATERAL = 10n ** BigInt(AAVE_BASE_CURRENCY_DECIMALS);
const USD_DEBT_RAY = 10n ** BigInt(AAVE_BASE_CURRENCY_RAY_DECIMALS);

function makePosition(
  collateralUsd: bigint,
  debtUsdRay: bigint,
): AavePositionWithLiveData {
  return {
    accountData: {
      totalCollateralValue: collateralUsd,
      totalDebtValueRay: debtUsdRay,
    },
  } as unknown as AavePositionWithLiveData;
}

describe("validateBorrowPreSign", () => {
  it("throws when token price is unavailable", async () => {
    const refetchSplitParams = vi.fn();
    const refetchPosition = vi.fn();

    await expect(
      validateBorrowPreSign({
        borrowAmount: 100,
        tokenPriceUsd: null,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).rejects.toThrow("Token price unavailable");

    expect(refetchSplitParams).not.toHaveBeenCalled();
    expect(refetchPosition).not.toHaveBeenCalled();
  });

  it("throws when refetchSplitParams returns null", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue(null);
    const refetchPosition = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign({
        borrowAmount: 100,
        tokenPriceUsd: 1,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).rejects.toThrow("Could not verify current risk parameters");
  });

  it("aborts when on-chain CF moved since the screen was rendered (auditor #260)", async () => {
    // User's screen was rendered with CF=0.75 (=7500 BPS). Governance has
    // since lowered CF to 0.70 — same dynamicConfigKey, so React Query
    // would have kept the cached 0.75 without an explicit refetch.
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      CF: 0.7,
      LB: 1.05,
    });
    // The two refetches run in parallel (`Promise.all`) for click-path
    // latency, so refetchPosition may be called even though we abort.
    // What matters is that the validator throws and the user never reaches
    // the `borrow(...)` call.
    const refetchPosition = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign({
        borrowAmount: 100,
        tokenPriceUsd: 1,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).rejects.toThrow("Risk parameters have changed");
  });

  it("skips revalidation when refetchPosition returns null (first borrow)", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      CF: 0.75,
      LB: 1.05,
    });
    const refetchPosition = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign({
        borrowAmount: 100,
        tokenPriceUsd: 1,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).resolves.toBeUndefined();

    expect(refetchSplitParams).toHaveBeenCalledTimes(1);
    expect(refetchPosition).toHaveBeenCalledTimes(1);
  });

  it("uses fresh liquidationThresholdBps for HF computation", async () => {
    // CF unchanged at 0.75 → fresh liquidationThresholdBps = 7500.
    // Collateral: $10000, debt: $0, borrow: $1000 worth.
    // HF = 10000 * 0.75 / 1000 = 7.5 — well above MIN_HEALTH_FACTOR_FOR_BORROW.
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      CF: 0.75,
      LB: 1.05,
    });
    const refetchPosition = vi
      .fn()
      .mockResolvedValue(makePosition(10000n * USD_COLLATERAL, 0n));

    await expect(
      validateBorrowPreSign({
        borrowAmount: 1000,
        tokenPriceUsd: 1,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).resolves.toBeUndefined();
  });

  it("throws when projected HF would fall below MIN_HEALTH_FACTOR_FOR_BORROW", async () => {
    // Collateral $1000 at 0.75 CF, no existing debt, borrow $999 worth.
    // HF = 1000 * 0.75 / 999 ≈ 0.751 — well below the safety threshold.
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      CF: 0.75,
      LB: 1.05,
    });
    const refetchPosition = vi
      .fn()
      .mockResolvedValue(makePosition(1000n * USD_COLLATERAL, 0n));

    await expect(
      validateBorrowPreSign({
        borrowAmount: 999,
        tokenPriceUsd: 1,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).rejects.toThrow(/Projected health factor/);
  });

  it("propagates errors from refetchSplitParams", async () => {
    const refetchSplitParams = vi
      .fn()
      .mockRejectedValue(new Error("RPC failure"));
    const refetchPosition = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign({
        borrowAmount: 100,
        tokenPriceUsd: 1,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).rejects.toThrow("RPC failure");
  });

  it("runs refetchSplitParams and refetchPosition in parallel for click-path latency", async () => {
    // Both refetches should be in flight at the same time. We assert this
    // by resolving them in the opposite order from what a serial impl would
    // produce: refetchPosition resolves before refetchSplitParams.
    const splitParamsCallStarted = vi.fn();
    const positionCallStarted = vi.fn();

    const refetchSplitParams = vi.fn(async () => {
      splitParamsCallStarted();
      // Yield to the microtask queue so refetchPosition can also start.
      await Promise.resolve();
      return { THF: 1.1, CF: 0.75, LB: 1.05 };
    });
    const refetchPosition = vi.fn(async () => {
      positionCallStarted();
      return null; // first-borrow path
    });

    await validateBorrowPreSign({
      borrowAmount: 100,
      tokenPriceUsd: 1,
      liquidationThresholdBps: 7500,
      refetchSplitParams,
      refetchPosition,
    });

    // Both refetches must have been initiated before either resolved —
    // i.e. both call counters were non-zero by the time the first
    // microtask boundary was reached. With a serial implementation,
    // refetchPosition would not have started until after the first await
    // inside refetchSplitParams resolved.
    expect(splitParamsCallStarted).toHaveBeenCalledTimes(1);
    expect(positionCallStarted).toHaveBeenCalledTimes(1);
  });

  it("uses fresh debt from refetched position, not stale UI state", async () => {
    // The original UI showed $0 debt; in reality the user already has
    // $900 debt at the moment of signing — borrowing another $100 against
    // $1000 collateral at 0.75 CF puts HF = 1000 * 0.75 / 1000 = 0.75
    // (below threshold). Validator must catch this using the FRESH debt.
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      CF: 0.75,
      LB: 1.05,
    });
    const refetchPosition = vi
      .fn()
      .mockResolvedValue(
        makePosition(1000n * USD_COLLATERAL, 900n * USD_DEBT_RAY),
      );

    await expect(
      validateBorrowPreSign({
        borrowAmount: 100,
        tokenPriceUsd: 1,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).rejects.toThrow(/Projected health factor/);
  });
});
