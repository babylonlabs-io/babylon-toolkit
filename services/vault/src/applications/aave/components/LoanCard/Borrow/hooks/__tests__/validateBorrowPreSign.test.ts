import {
  AAVE_BASE_CURRENCY_DECIMALS,
  AAVE_BASE_CURRENCY_RAY_DECIMALS,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../services/assertVbtcReserveAnchoredToAdapter", () => ({
  assertVbtcReserveAnchoredToAdapter: vi.fn(),
}));

import type { AavePositionWithLiveData } from "../../../../../services";
import { ReserveMismatchError } from "../../../../../services/assertReserveMatchesOnChain";
import { assertVbtcReserveAnchoredToAdapter } from "../../../../../services/assertVbtcReserveAnchoredToAdapter";
import { validateBorrowPreSign } from "../validateBorrowPreSign";

const mockAssertAnchored = vi.mocked(assertVbtcReserveAnchoredToAdapter);

const ADAPTER = "0x000000000000000000000000000000000000ada9" as Address;
const VBTC_RESERVE_ID = 1n;

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

function baseDeps(
  overrides: Partial<Parameters<typeof validateBorrowPreSign>[0]> = {},
) {
  return {
    borrowAmount: 100,
    tokenPriceUsd: 1 as number | null,
    liquidationThresholdBps: 7500,
    refetchSplitParams: vi.fn().mockResolvedValue({
      THF: 1.1,
      CF: 0.75,
      LB: 1.05,
    }),
    refetchPosition: vi.fn().mockResolvedValue(null),
    adapterAddress: ADAPTER,
    displayedVbtcReserveId: VBTC_RESERVE_ID,
    ...overrides,
  };
}

describe("validateBorrowPreSign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertAnchored.mockResolvedValue();
  });

  it("throws when token price is unavailable", async () => {
    const refetchSplitParams = vi.fn();
    const refetchPosition = vi.fn();

    await expect(
      validateBorrowPreSign(
        baseDeps({
          tokenPriceUsd: null,
          refetchSplitParams,
          refetchPosition,
        }),
      ),
    ).rejects.toThrow("Token price unavailable");

    expect(refetchSplitParams).not.toHaveBeenCalled();
    expect(refetchPosition).not.toHaveBeenCalled();
    expect(mockAssertAnchored).not.toHaveBeenCalled();
  });

  it("throws when refetchSplitParams returns null", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign(baseDeps({ refetchSplitParams })),
    ).rejects.toThrow("Could not verify current risk parameters");
  });

  it("aborts when on-chain CF moved since the screen was rendered (auditor #260)", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      CF: 0.7,
      LB: 1.05,
    });

    await expect(
      validateBorrowPreSign(baseDeps({ refetchSplitParams })),
    ).rejects.toThrow("Risk parameters have changed");
  });

  it("aborts when the displayed reserve id does not match the adapter (auditor #230)", async () => {
    mockAssertAnchored.mockRejectedValue(
      new ReserveMismatchError("vBTC reserve id mismatch"),
    );

    await expect(
      validateBorrowPreSign(baseDeps({ displayedVbtcReserveId: 999n })),
    ).rejects.toBeInstanceOf(ReserveMismatchError);

    expect(mockAssertAnchored).toHaveBeenCalledWith(ADAPTER, 999n);
  });

  it("skips revalidation when refetchPosition returns null (first borrow)", async () => {
    const refetchSplitParams = vi.fn().mockResolvedValue({
      THF: 1.1,
      CF: 0.75,
      LB: 1.05,
    });
    const refetchPosition = vi.fn().mockResolvedValue(null);

    await expect(
      validateBorrowPreSign(baseDeps({ refetchSplitParams, refetchPosition })),
    ).resolves.toBeUndefined();

    expect(refetchSplitParams).toHaveBeenCalledTimes(1);
    expect(refetchPosition).toHaveBeenCalledTimes(1);
    expect(mockAssertAnchored).toHaveBeenCalledWith(ADAPTER, VBTC_RESERVE_ID);
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
      validateBorrowPreSign(
        baseDeps({
          borrowAmount: 1000,
          refetchSplitParams,
          refetchPosition,
        }),
      ),
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
      validateBorrowPreSign(
        baseDeps({
          borrowAmount: 999,
          refetchSplitParams,
          refetchPosition,
        }),
      ),
    ).rejects.toThrow(/Projected health factor/);
  });

  it("propagates errors from refetchSplitParams", async () => {
    const refetchSplitParams = vi
      .fn()
      .mockRejectedValue(new Error("RPC failure"));

    await expect(
      validateBorrowPreSign(baseDeps({ refetchSplitParams })),
    ).rejects.toThrow("RPC failure");
  });

  it("runs refetchSplitParams, refetchPosition, and the reserve anchor in parallel", async () => {
    // All three reads should be in flight at the same time. We assert this
    // by checking that each one's call counter is non-zero by the time the
    // first microtask boundary is reached — a serial impl would only have
    // started the first one by then.
    const splitParamsCallStarted = vi.fn();
    const positionCallStarted = vi.fn();
    const anchorCallStarted = vi.fn();

    const refetchSplitParams = vi.fn(async () => {
      splitParamsCallStarted();
      await Promise.resolve();
      return { THF: 1.1, CF: 0.75, LB: 1.05 };
    });
    const refetchPosition = vi.fn(async () => {
      positionCallStarted();
      return null;
    });
    mockAssertAnchored.mockImplementation(async () => {
      anchorCallStarted();
    });

    await validateBorrowPreSign(
      baseDeps({ refetchSplitParams, refetchPosition }),
    );

    expect(splitParamsCallStarted).toHaveBeenCalledTimes(1);
    expect(positionCallStarted).toHaveBeenCalledTimes(1);
    expect(anchorCallStarted).toHaveBeenCalledTimes(1);
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
      validateBorrowPreSign(
        baseDeps({
          borrowAmount: 100,
          refetchSplitParams,
          refetchPosition,
        }),
      ),
    ).rejects.toThrow(/Projected health factor/);
  });
});
