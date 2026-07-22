/**
 * Placeholder cascade for the Liquidation Dashboard while the page is UI-only
 * (issue #2043). It mirrors the Figma mock — three vaults of 0.6 / 0.4 / 0.1
 * BTC at $88,400 — but the numbers are made internally consistent, which the
 * mock is not: the debt chain repays down to zero, distances are derived from
 * the trigger prices, and the health factor matches collateral × CF ÷ debt.
 *
 * This is the whole data seam. The follow-up PR deletes this file and feeds
 * `usePositionNotifications().result` into the same projection.
 */

import type {
  CalculatorResult,
  LiquidationGroup,
} from "@/applications/aave/positionNotifications/types";

export const FIXTURE_BTC_PRICE = 88_400;

/** Collateral factor the live page will read from on-chain params. */
export const FIXTURE_COLLATERAL_FACTOR = 0.5;

const TOTAL_BTC = 1.1;
const COLLATERAL_VALUE_USD = TOTAL_BTC * FIXTURE_BTC_PRICE;
const TOTAL_DEBT_USD = 44_287;

const distanceFrom = (liquidationPrice: number) =>
  (liquidationPrice / FIXTURE_BTC_PRICE - 1) * 100;

const groups: LiquidationGroup[] = [
  {
    index: 0,
    vaults: [{ id: "vault-1", name: "Vault 1", btc: 0.6 }],
    combinedBtc: 0.6,
    liquidationPrice: 77_682,
    distancePct: distanceFrom(77_682),
    targetSeizureBtc: 0.58,
    overSeizureBtc: 0.02,
    isFullLiquidation: false,
    debtToRepay: 28_383,
    liquidatorProfitUsd: 1_419,
    debtRepaid: 28_383,
    fairnessDebtRepay: 798,
    fairnessPaymentUsd: 0,
    debtRemainingAfter: 15_106,
    btcRemainingAfter: 0.5,
  },
  {
    index: 1,
    vaults: [{ id: "vault-2", name: "Vault 2", btc: 0.4 }],
    combinedBtc: 0.4,
    liquidationPrice: 40_283,
    distancePct: distanceFrom(40_283),
    targetSeizureBtc: 0.27,
    overSeizureBtc: 0.13,
    isFullLiquidation: false,
    debtToRepay: 9_681,
    liquidatorProfitUsd: 484,
    debtRepaid: 9_681,
    fairnessDebtRepay: 5_155,
    fairnessPaymentUsd: 0,
    debtRemainingAfter: 270,
    btcRemainingAfter: 0.1,
  },
  {
    index: 2,
    vaults: [{ id: "vault-3", name: "Vault 3", btc: 0.1 }],
    combinedBtc: 0.1,
    liquidationPrice: 3_597,
    distancePct: distanceFrom(3_597),
    targetSeizureBtc: 0.05,
    overSeizureBtc: 0.05,
    isFullLiquidation: true,
    debtToRepay: 270,
    liquidatorProfitUsd: 9,
    debtRepaid: 270,
    fairnessDebtRepay: 0,
    fairnessPaymentUsd: 81,
    debtRemainingAfter: 0,
    btcRemainingAfter: 0,
  },
];

export const FIXTURE_CASCADE: CalculatorResult = {
  groups,
  currentHF:
    (COLLATERAL_VALUE_USD * FIXTURE_COLLATERAL_FACTOR) / TOTAL_DEBT_USD,
  collateralValue: COLLATERAL_VALUE_USD,
  targetSeizureBtc: 0.58,
  warnings: [],
  optimalVaultOrder: null,
  suggestedNewVaultBtc: null,
};

export const FIXTURE_POSITION = {
  collateralBtc: TOTAL_BTC,
  collateralValueUsd: COLLATERAL_VALUE_USD,
  debtUsd: TOTAL_DEBT_USD,
  /** Debt as a share of the maximum borrowable against this collateral. */
  borrowedRatio:
    TOTAL_DEBT_USD / (COLLATERAL_VALUE_USD * FIXTURE_COLLATERAL_FACTOR),
  healthFactor: FIXTURE_CASCADE.currentHF,
};
