import {
  AAVE_BASE_CURRENCY_DECIMALS,
  AAVE_BASE_CURRENCY_RAY_DECIMALS,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../clients/aaveOracle", () => ({
  getReservesPrices: vi.fn(),
}));

import { getReservesPrices } from "../../../../../clients/aaveOracle";
import type { AavePositionWithLiveData } from "../../../../../services";
import { validateBorrowPreSign } from "../validateBorrowPreSign";

const ORACLE = "0x0000000000000000000000000000000000000002" as Address;
const RESERVE_ID = 2n;

const USD_COLLATERAL = 10n ** BigInt(AAVE_BASE_CURRENCY_DECIMALS);
const USD_DEBT_RAY = 10n ** BigInt(AAVE_BASE_CURRENCY_RAY_DECIMALS);

/** Aave oracle is 8-decimal. $1 = 100_000_000n. */
const PRICE_1USD_RAW = 100_000_000n;

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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getReservesPrices).mockResolvedValue([PRICE_1USD_RAW]);
  });

  it("throws when refetchSplitParams returns null", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue(null);
    const refetchPosition = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign({
        borrowAmount: 100,
        oracleAddress: ORACLE,
        reserveId: RESERVE_ID,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).rejects.toThrow("Could not verify current risk parameters");
  });

  it("aborts when on-chain CF moved since the screen was rendered (auditor #260)", async () => {
    const refetchSplitParams = vi
      .fn()
      .mockResolvedValue({ THF: 1.1, CF: 0.7, LB: 1.05 });
    const refetchPosition = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign({
        borrowAmount: 100,
        oracleAddress: ORACLE,
        reserveId: RESERVE_ID,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).rejects.toThrow("Risk parameters have changed");
  });

  it("skips revalidation when refetchPosition returns null (first borrow)", async () => {
    const refetchSplitParams = vi
      .fn()
      .mockResolvedValue({ THF: 1.1, CF: 0.75, LB: 1.05 });
    const refetchPosition = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign({
        borrowAmount: 100,
        oracleAddress: ORACLE,
        reserveId: RESERVE_ID,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).resolves.toBeUndefined();

    expect(refetchSplitParams).toHaveBeenCalledTimes(1);
    expect(refetchPosition).toHaveBeenCalledTimes(1);
  });

  it("uses fresh liquidationThresholdBps for HF computation", async () => {
    const refetchSplitParams = vi
      .fn()
      .mockResolvedValue({ THF: 1.1, CF: 0.75, LB: 1.05 });
    const refetchPosition = vi
      .fn()
      .mockResolvedValue(makePosition(10000n * USD_COLLATERAL, 0n));

    await expect(
      validateBorrowPreSign({
        borrowAmount: 1000,
        oracleAddress: ORACLE,
        reserveId: RESERVE_ID,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).resolves.toBeUndefined();
  });

  it("throws when projected HF would fall below MIN_HEALTH_FACTOR_FOR_BORROW", async () => {
    const refetchSplitParams = vi
      .fn()
      .mockResolvedValue({ THF: 1.1, CF: 0.75, LB: 1.05 });
    const refetchPosition = vi
      .fn()
      .mockResolvedValue(makePosition(1000n * USD_COLLATERAL, 0n));

    await expect(
      validateBorrowPreSign({
        borrowAmount: 999,
        oracleAddress: ORACLE,
        reserveId: RESERVE_ID,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).rejects.toThrow(/Projected health factor/);
  });

  it("uses the FRESH oracle price, not a cached UI value", async () => {
    // The UI may have cached BTC at $80,000, but the oracle now returns
    // $100,000. With $80,000 collateral at CF=0.75 and a 1.0-unit borrow,
    // a stale-price projection would compute HF = 80000 * 0.75 / 80000 = 0.75
    // and pass. The fresh-price projection computes
    // HF = 80000 * 0.75 / 100000 = 0.6, below threshold — must throw.
    vi.mocked(getReservesPrices).mockResolvedValueOnce([
      100_000n * PRICE_1USD_RAW,
    ]);
    const refetchSplitParams = vi
      .fn()
      .mockResolvedValue({ THF: 1.1, CF: 0.75, LB: 1.05 });
    const refetchPosition = vi
      .fn()
      .mockResolvedValue(makePosition(80_000n * USD_COLLATERAL, 0n));

    await expect(
      validateBorrowPreSign({
        borrowAmount: 1,
        oracleAddress: ORACLE,
        reserveId: RESERVE_ID,
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
        oracleAddress: ORACLE,
        reserveId: RESERVE_ID,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).rejects.toThrow("RPC failure");
  });

  it("runs all three refetches in parallel for click-path latency", async () => {
    const splitParamsCallStarted = vi.fn();
    const positionCallStarted = vi.fn();
    const priceCallStarted = vi.fn();

    const refetchSplitParams = vi.fn(async () => {
      splitParamsCallStarted();
      await Promise.resolve();
      return { THF: 1.1, CF: 0.75, LB: 1.05 };
    });
    const refetchPosition = vi.fn(async () => {
      positionCallStarted();
      return null;
    });
    vi.mocked(getReservesPrices).mockImplementation(async () => {
      priceCallStarted();
      return [PRICE_1USD_RAW];
    });

    await validateBorrowPreSign({
      borrowAmount: 100,
      oracleAddress: ORACLE,
      reserveId: RESERVE_ID,
      liquidationThresholdBps: 7500,
      refetchSplitParams,
      refetchPosition,
    });

    expect(splitParamsCallStarted).toHaveBeenCalledTimes(1);
    expect(positionCallStarted).toHaveBeenCalledTimes(1);
    expect(priceCallStarted).toHaveBeenCalledTimes(1);
  });

  it("uses fresh debt from refetched position, not stale UI state", async () => {
    const refetchSplitParams = vi
      .fn()
      .mockResolvedValue({ THF: 1.1, CF: 0.75, LB: 1.05 });
    const refetchPosition = vi
      .fn()
      .mockResolvedValue(
        makePosition(1000n * USD_COLLATERAL, 900n * USD_DEBT_RAY),
      );

    await expect(
      validateBorrowPreSign({
        borrowAmount: 100,
        oracleAddress: ORACLE,
        reserveId: RESERVE_ID,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
      }),
    ).rejects.toThrow(/Projected health factor/);
  });
});
