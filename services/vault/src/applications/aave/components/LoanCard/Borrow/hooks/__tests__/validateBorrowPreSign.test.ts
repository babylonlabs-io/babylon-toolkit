import {
  AAVE_BASE_CURRENCY_DECIMALS,
  AAVE_BASE_CURRENCY_RAY_DECIMALS,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../clients/aaveHub", () => ({
  getAssetDrawnIndex: vi.fn(),
}));
vi.mock("../../../../../clients/aaveOracle", () => ({
  getReservesPrices: vi.fn(),
}));

import { ContractError } from "@/utils/errors";

import { getAssetDrawnIndex } from "../../../../../clients/aaveHub";
import { getReservesPrices } from "../../../../../clients/aaveOracle";
import type { AavePositionWithLiveData } from "../../../../../services";
import { BorrowReserveCapUnavailableError } from "../../../../../utils/borrowReserveLimit";
import { validateBorrowPreSign } from "../validateBorrowPreSign";

const RESERVE_ID = 2n;
const BORROW_ASSET = {
  oracleAddress: "0x0000000000000000000000000000000000000002" as Address,
  reserveId: RESERVE_ID,
  hub: "0x0000000000000000000000000000000000000003" as Address,
  assetId: 2,
  tokenDecimals: 0,
};

const USD_COLLATERAL = 10n ** BigInt(AAVE_BASE_CURRENCY_DECIMALS);
const USD_DEBT_RAY = 10n ** BigInt(AAVE_BASE_CURRENCY_RAY_DECIMALS);
const RAY = USD_DEBT_RAY / USD_COLLATERAL;

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

// A flat bonus: 105% at every health factor.
const FLAT_BONUS_CURVE = {
  healthFactorForMaxBonus: 0n,
  liquidationBonusFactor: 10_000n,
  maxLiquidationBonus: 10_500n,
};

describe("validateBorrowPreSign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getReservesPrices).mockResolvedValue([PRICE_1USD_RAW]);
    vi.mocked(getAssetDrawnIndex).mockResolvedValue(RAY);
  });

  it("throws when refetchSplitParams returns null", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue(null);
    const refetchPosition = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw: 100n,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
        chainMaxBorrowReserves: { status: "loaded", limit: null },
      }),
    ).rejects.toThrow("Could not verify current risk parameters");
  });

  it("aborts when on-chain CF moved since the screen was rendered (auditor #260)", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      expectedHF: 0.95,
      CF: 0.7,
      LB: 1.05,
      bonusCurve: FLAT_BONUS_CURVE,
      lbUnavailableReason: null,
      maxLB: 1.05,
    });
    const refetchPosition = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw: 100n,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
        chainMaxBorrowReserves: { status: "loaded", limit: null },
      }),
    ).rejects.toThrow("Risk parameters have changed");
  });

  it("rejects a borrow when the position is unavailable", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      expectedHF: 0.95,
      CF: 0.75,
      LB: 1.05,
      bonusCurve: FLAT_BONUS_CURVE,
      lbUnavailableReason: null,
      maxLB: 1.05,
    });
    const refetchPosition = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw: 100n,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
        chainMaxBorrowReserves: { status: "loaded", limit: null },
      }),
    ).rejects.toThrow("Could not verify your position");

    expect(refetchSplitParams).toHaveBeenCalledTimes(1);
    expect(refetchPosition).toHaveBeenCalledTimes(1);
  });

  it("uses fresh liquidationThresholdBps for HF computation", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      expectedHF: 0.95,
      CF: 0.75,
      LB: 1.05,
      bonusCurve: FLAT_BONUS_CURVE,
      lbUnavailableReason: null,
      maxLB: 1.05,
    });
    const refetchPosition = vi
      .fn()
      .mockResolvedValue(makePosition(10000n * USD_COLLATERAL, 0n));

    await expect(
      validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw: 1000n,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
        chainMaxBorrowReserves: { status: "loaded", limit: null },
      }),
    ).resolves.toBeUndefined();
  });

  it("throws when projected HF would fall below MIN_HEALTH_FACTOR_FOR_BORROW", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      expectedHF: 0.95,
      CF: 0.75,
      LB: 1.05,
      bonusCurve: FLAT_BONUS_CURVE,
      lbUnavailableReason: null,
      maxLB: 1.05,
    });
    const refetchPosition = vi
      .fn()
      .mockResolvedValue(makePosition(1000n * USD_COLLATERAL, 0n));

    await expect(
      validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw: 999n,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
        chainMaxBorrowReserves: { status: "loaded", limit: null },
      }),
    ).rejects.toThrow(/Projected health factor/);
  });

  it("prints a projected health factor just under the minimum below it, not as the minimum", async () => {
    // $1,000 collateral at LT 75% against a $715 borrow: HF = 750 / 715 =
    // 1.0489…, which rounding to nearest printed as "1.05 would be below 1.05".
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      expectedHF: 0.95,
      CF: 0.75,
      LB: 1.05,
      bonusCurve: FLAT_BONUS_CURVE,
      lbUnavailableReason: null,
      maxLB: 1.05,
    });
    const refetchPosition = vi
      .fn()
      .mockResolvedValue(makePosition(1000n * USD_COLLATERAL, 0n));

    await expect(
      validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw: 715n,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
        chainMaxBorrowReserves: { status: "loaded", limit: null },
      }),
    ).rejects.toThrow("Projected health factor (1.04) would be below 1.05");
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
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      expectedHF: 0.95,
      CF: 0.75,
      LB: 1.05,
      bonusCurve: FLAT_BONUS_CURVE,
      lbUnavailableReason: null,
      maxLB: 1.05,
    });
    const refetchPosition = vi
      .fn()
      .mockResolvedValue(makePosition(80_000n * USD_COLLATERAL, 0n));

    await expect(
      validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw: 1n,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
        chainMaxBorrowReserves: { status: "loaded", limit: null },
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
        ...BORROW_ASSET,
        borrowAmountRaw: 100n,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
        chainMaxBorrowReserves: { status: "loaded", limit: null },
      }),
    ).rejects.toThrow("RPC failure");
  });

  it("runs all four refetches in parallel for click-path latency", async () => {
    const splitParamsCallStarted = vi.fn();
    const positionCallStarted = vi.fn();
    const priceCallStarted = vi.fn();
    const drawnIndexCallStarted = vi.fn();

    const refetchSplitParams = vi.fn(async () => {
      splitParamsCallStarted();
      await Promise.resolve();
      return {
        THF: 1.1,
        expectedHF: 0.95,
        CF: 0.75,
        LB: 1.05,
        bonusCurve: FLAT_BONUS_CURVE,
        lbUnavailableReason: null,
        maxLB: 1.05,
      };
    });
    const refetchPosition = vi.fn(async () => {
      positionCallStarted();
      return makePosition(1000n * USD_COLLATERAL, 0n);
    });
    vi.mocked(getReservesPrices).mockImplementation(async () => {
      priceCallStarted();
      return [PRICE_1USD_RAW];
    });
    vi.mocked(getAssetDrawnIndex).mockImplementation(async () => {
      drawnIndexCallStarted();
      return RAY;
    });

    await validateBorrowPreSign({
      ...BORROW_ASSET,
      borrowAmountRaw: 100n,
      liquidationThresholdBps: 7500,
      refetchSplitParams,
      refetchPosition,
      chainMaxBorrowReserves: { status: "loaded", limit: null },
    });

    expect(splitParamsCallStarted).toHaveBeenCalledTimes(1);
    expect(positionCallStarted).toHaveBeenCalledTimes(1);
    expect(priceCallStarted).toHaveBeenCalledTimes(1);
    expect(drawnIndexCallStarted).toHaveBeenCalledTimes(1);
  });

  it("uses fresh debt from refetched position, not stale UI state", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      expectedHF: 0.95,
      CF: 0.75,
      LB: 1.05,
      bonusCurve: FLAT_BONUS_CURVE,
      lbUnavailableReason: null,
      maxLB: 1.05,
    });
    const refetchPosition = vi
      .fn()
      .mockResolvedValue(
        makePosition(1000n * USD_COLLATERAL, 900n * USD_DEBT_RAY),
      );

    await expect(
      validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw: 100n,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
        chainMaxBorrowReserves: { status: "loaded", limit: null },
      }),
    ).rejects.toThrow(/Projected health factor/);
  });
  it("refuses to sign when the Spoke's cap could not be read, even when the position is unavailable", async () => {
    const refetchSplitParams = vi
      .fn()
      .mockResolvedValue({ THF: 1.1, CF: 0.75, LB: 1.05 });
    const refetchPosition = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw: 100n,
        liquidationThresholdBps: 7500,
        refetchSplitParams,
        refetchPosition,
        chainMaxBorrowReserves: {
          status: "unavailable",
          error: new Error("RPC unavailable"),
        },
      }),
    ).rejects.toBeInstanceOf(BorrowReserveCapUnavailableError);
  });

  describe("at a finite cap the account has reached", () => {
    const OWED_RESERVE_ID = 5n;

    function atCapPosition(owedReserveId: bigint): AavePositionWithLiveData {
      return {
        accountData: {
          totalCollateralValue: 1000n * USD_COLLATERAL,
          totalDebtValueRay: 0n,
          borrowCount: 2n,
        },
        debtPositions: new Map([
          [owedReserveId, { reserveId: owedReserveId, drawnShares: 1n }],
        ]),
      } as unknown as AavePositionWithLiveData;
    }

    function validateAtCap(owedReserveId: bigint) {
      return validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw: 100n,
        liquidationThresholdBps: 7500,
        refetchSplitParams: vi
          .fn()
          .mockResolvedValue({ THF: 1.1, CF: 0.75, LB: 1.05 }),
        refetchPosition: vi
          .fn()
          .mockResolvedValue(atCapPosition(owedReserveId)),
        chainMaxBorrowReserves: { status: "loaded", limit: 2 },
      });
    }

    it("refuses a reserve the account does not borrow, with the Spoke's own revert", async () => {
      const rejection = validateAtCap(OWED_RESERVE_ID);
      await expect(rejection).rejects.toBeInstanceOf(ContractError);
      await expect(rejection).rejects.toHaveProperty(
        "reason",
        "MaximumUserReservesExceeded",
      );
    });

    it("allows more of a reserve the account already borrows", async () => {
      await expect(validateAtCap(RESERVE_ID)).resolves.toBeUndefined();
    });
  });

  it("allows a new reserve while the account is below a finite cap", async () => {
    const OWED_RESERVE_ID = 5n;
    const belowCapPosition = {
      accountData: {
        totalCollateralValue: 1000n * USD_COLLATERAL,
        totalDebtValueRay: 0n,
        borrowCount: 1n,
      },
      debtPositions: new Map([
        [OWED_RESERVE_ID, { reserveId: OWED_RESERVE_ID, drawnShares: 1n }],
      ]),
    } as unknown as AavePositionWithLiveData;

    await expect(
      validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw: 100n,
        liquidationThresholdBps: 7500,
        refetchSplitParams: vi
          .fn()
          .mockResolvedValue({ THF: 1.1, CF: 0.75, LB: 1.05 }),
        refetchPosition: vi.fn().mockResolvedValue(belowCapPosition),
        chainMaxBorrowReserves: { status: "loaded", limit: 2 },
      }),
    ).resolves.toBeUndefined();
  });

  it("allows a borrow that leaves health factor at exactly 1.05", async () => {
    // $1,050 collateral at LT 75% against a $750 borrow: HF = 787.5 / 750 = 1.05.
    await expect(
      validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw: 750n,
        liquidationThresholdBps: 7500,
        refetchSplitParams: vi.fn().mockResolvedValue({ CF: 0.75 }),
        refetchPosition: vi
          .fn()
          .mockResolvedValue(makePosition(1050n * USD_COLLATERAL, 0n)),
        chainMaxBorrowReserves: { status: "loaded", limit: null },
      }),
    ).resolves.toBeUndefined();
  });

  describe("market data and amount checks", () => {
    // $1,000 collateral at LT 78% with $500 of debt: a $100 borrow leaves
    // HF = 780 / 600 = 1.3, so only the check under test can reject it.
    function validateBorrow(borrowAmountRaw: bigint) {
      return validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw,
        liquidationThresholdBps: 7800,
        refetchSplitParams: vi.fn().mockResolvedValue({ CF: 0.78 }),
        refetchPosition: vi
          .fn()
          .mockResolvedValue(
            makePosition(1000n * USD_COLLATERAL, 500n * USD_DEBT_RAY),
          ),
        chainMaxBorrowReserves: { status: "loaded", limit: null },
      });
    }

    it("rejects a borrow when the oracle returns no price", async () => {
      vi.mocked(getReservesPrices).mockResolvedValueOnce([]);

      await expect(validateBorrow(100n)).rejects.toThrow(
        "Could not read the current market data for this asset",
      );
    });

    it("rejects a borrow when the oracle price is zero", async () => {
      vi.mocked(getReservesPrices).mockResolvedValueOnce([0n]);

      await expect(validateBorrow(100n)).rejects.toThrow(
        "Could not read the current market data for this asset",
      );
    });

    it("rejects a borrow when the drawn index is zero", async () => {
      vi.mocked(getAssetDrawnIndex).mockResolvedValueOnce(0n);

      await expect(validateBorrow(100n)).rejects.toThrow(
        "Could not read the current market data for this asset",
      );
    });

    it("rejects a zero borrow amount", async () => {
      await expect(validateBorrow(0n)).rejects.toThrow("Amount too small");
    });
  });

  describe("with Safe mode off", () => {
    function validateBorrow(borrowAmountRaw: bigint, tokenDecimals = 0) {
      return validateBorrowPreSign({
        ...BORROW_ASSET,
        borrowAmountRaw,
        tokenDecimals,
        safeMode: false,
        liquidationThresholdBps: 7800,
        refetchSplitParams: vi.fn().mockResolvedValue({ CF: 0.78 }),
        refetchPosition: vi
          .fn()
          .mockResolvedValue(makePosition(1000n * USD_COLLATERAL, 0n)),
        chainMaxBorrowReserves: { status: "loaded", limit: null },
      });
    }

    it("allows a borrow that leaves health factor above 1", async () => {
      await expect(validateBorrow(779_999_999n, 6)).resolves.toBeUndefined();
      expect(getAssetDrawnIndex).toHaveBeenCalledWith(
        BORROW_ASSET.hub,
        BORROW_ASSET.assetId,
      );
    });

    it("rejects a borrow that leaves health factor at exactly 1", async () => {
      await expect(validateBorrow(780n)).rejects.toThrow(/health factor/i);
    });

    it("rejects a borrow that leaves health factor below 1", async () => {
      await expect(validateBorrow(781n)).rejects.toThrow(/health factor/i);
    });

    it("rejects a borrow when rounded debt shares leave health factor at 1", async () => {
      vi.mocked(getAssetDrawnIndex).mockResolvedValueOnce(2n * RAY);

      await expect(validateBorrow(779n)).rejects.toThrow(/health factor/i);
    });
  });
});
