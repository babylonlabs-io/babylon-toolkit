import { describe, expect, it } from "vitest";

import { WAD_DECIMALS } from "@/applications/aave/constants";
import { WithdrawPreSignValidationError } from "@/applications/aave/hooks/withdrawPreSignValidationError";
import type { AavePositionWithLiveData } from "@/applications/aave/services";
import { SATOSHIS_PER_BTC } from "@/utils/btcConversion";

import {
  WITHDRAW_BLOCK_BREACH_MESSAGE,
  validateFreshWithdraw,
} from "../withdrawPreSignValidation";

const WAD = 10n ** BigInt(WAD_DECIMALS);

// 1 BTC of collateral, expressed in satoshis (bigint).
const ONE_BTC_SATOSHIS = SATOSHIS_PER_BTC;

/**
 * Build a minimal `AavePositionWithLiveData` shape for the validator —
 * only the fields the function actually reads need to be populated.
 */
function buildPosition(opts: {
  totalCollateralSatoshis: bigint;
  borrowCount: bigint;
  healthFactorWad: bigint;
}): AavePositionWithLiveData {
  return {
    totalCollateral: opts.totalCollateralSatoshis,
    accountData: {
      borrowCount: opts.borrowCount,
      healthFactor: opts.healthFactorWad,
    },
  } as unknown as AavePositionWithLiveData;
}

describe("validateFreshWithdraw", () => {
  it("returns silently when there is no position", () => {
    expect(() => validateFreshWithdraw(null, 0.5)).not.toThrow();
  });

  it("returns silently when the position has no debt (borrowCount = 0)", () => {
    // No debt → projected HF is +Infinity → no threshold can be breached,
    // even though we're trying to withdraw the whole collateral.
    const fresh = buildPosition({
      totalCollateralSatoshis: ONE_BTC_SATOSHIS,
      borrowCount: 0n,
      healthFactorWad: 0n,
    });
    expect(() => validateFreshWithdraw(fresh, 1)).not.toThrow();
  });

  it("throws WithdrawPreSignValidationError with the block-breach message when projected HF < 1.0", () => {
    // 1 BTC collateral, fresh HF = 1.5. Withdrawing 0.5 BTC leaves 0.5 BTC,
    // so projected HF = 1.5 * 0.5 = 0.75 — below the 1.0 block threshold.
    const fresh = buildPosition({
      totalCollateralSatoshis: ONE_BTC_SATOSHIS,
      borrowCount: 1n,
      healthFactorWad: 15n * (WAD / 10n),
    });
    expect(() => validateFreshWithdraw(fresh, 0.5)).toThrowError(
      WithdrawPreSignValidationError,
    );
    expect(() => validateFreshWithdraw(fresh, 0.5)).toThrowError(
      WITHDRAW_BLOCK_BREACH_MESSAGE,
    );
  });

  it("returns silently in the warn zone (1.0 ≤ projected HF < 1.1) — UI advisory handles it", () => {
    // 1 BTC collateral, fresh HF = 1.5. Withdrawing 0.3 BTC leaves 0.7 BTC,
    // so projected HF = 1.5 * 0.7 = 1.05 — at risk but ≥ 1.0. The pre-sign
    // validator must not throw here; the dialog re-renders with the
    // `isAtRisk` advisory after the cache update, and Confirm stays enabled
    // so the user can deliberately accept the risk.
    const fresh = buildPosition({
      totalCollateralSatoshis: ONE_BTC_SATOSHIS,
      borrowCount: 1n,
      healthFactorWad: 15n * (WAD / 10n),
    });
    expect(() => validateFreshWithdraw(fresh, 0.3)).not.toThrow();
  });

  it("returns silently when projected HF clears the warn threshold", () => {
    // 1 BTC collateral, fresh HF = 2.0. Withdrawing 0.3 BTC leaves 0.7 BTC,
    // so projected HF = 2.0 * 0.7 = 1.4 — well clear of the block threshold.
    const fresh = buildPosition({
      totalCollateralSatoshis: ONE_BTC_SATOSHIS,
      borrowCount: 1n,
      healthFactorWad: 2n * WAD,
    });
    expect(() => validateFreshWithdraw(fresh, 0.3)).not.toThrow();
  });

  it("returns silently when projected HF lands exactly at 1.0 (float-tolerant)", () => {
    // currentHF = 2.0, withdraw 0.5 → projected = 1.0. That's at the block
    // threshold — `isHealthFactorAtOrAbove` accepts it (within float epsilon).
    const fresh = buildPosition({
      totalCollateralSatoshis: ONE_BTC_SATOSHIS,
      borrowCount: 1n,
      healthFactorWad: 2n * WAD,
    });
    expect(() => validateFreshWithdraw(fresh, 0.5)).not.toThrow();
  });
});
