import {
  computeOptimalOrder,
  computeSeizedFractionDetailed,
  MAX_GROUPS,
  MIN_DEBT_THRESHOLD,
  SEIZURE_TOL,
  simulateCascade,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { COPY } from "@/copy";

import { EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION } from "../constants";

import type {
  CalculatorParams,
  CalculatorResult,
  LiquidationGroup,
  Vault,
  Warning,
} from "./types";

/** Minimum position value (USD) for meaningful multi-event analysis */
const DUST_THRESHOLD_USD = 1000;

/** Distance to liquidation (%) below which we raise an urgent warning */
const URGENT_DISTANCE_PCT = 5;

/**
 * Minimum cascade-score improvement (in BTC) before we suggest a reorder.
 * Guards against flagging tie-shuffles where the optimizer returns a different
 * sequence with no real protection gain.
 */
const REORDER_TOL = 0.001;

/**
 * Compute the partial-liquidation cascade and position warnings.
 *
 * Liquidation follows the current on-chain vault order, so the group breakdown
 * is computed against that order. Separately, the optimizer is run and — when
 * it finds a strictly better order — `suggestedVaultOrder` is returned so the
 * banner can offer a manual "Apply Suggested Order" action. Warnings are limited
 * to three types: `weird-params` (invalid protocol params, soft), `urgent`
 * (already liquidatable or within 5% of the trigger), or `dust`.
 */
export function calculate(params: CalculatorParams): CalculatorResult {
  const {
    btcPrice,
    totalDebtUsd,
    vaults,
    CF,
    THF,
    maxLB,
    expectedHF = EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
  } = params;

  const totalBtc = vaults.reduce((s, v) => s + v.btc, 0);
  const collateralValue = totalBtc * btcPrice;
  const currentHF =
    totalDebtUsd > 0 ? (collateralValue * CF) / totalDebtUsd : Infinity;

  const warnings: Warning[] = [];
  const groups: LiquidationGroup[] = [];

  // ── 1. Early exits ─────────────────────────────────────────────

  // Zero debt means no liquidation risk — return healthy.
  if (totalDebtUsd <= 0) {
    return {
      groups,
      currentHF: Infinity,
      collateralValue,
      targetSeizureBtc: 0,
      warnings,
      suggestedVaultOrder: null,
    };
  }

  // Dust check — force a single group (only when there IS debt but it's tiny).
  const isDust =
    totalDebtUsd < DUST_THRESHOLD_USD || collateralValue < DUST_THRESHOLD_USD;
  if (isDust) {
    const liqPrice = totalDebtUsd / (totalBtc * CF);
    const distancePct = ((liqPrice - btcPrice) / btcPrice) * 100;
    return {
      groups: [
        {
          index: 1,
          vaults: [...vaults],
          combinedBtc: totalBtc,
          liquidationPrice: liqPrice,
          distancePct,
          targetSeizureBtc: totalBtc,
          overSeizureBtc: 0,
          isFullLiquidation: true,
          debtToRepay: totalDebtUsd,
          liquidatorProfitUsd: 0,
          debtRepaid: totalDebtUsd,
          fairnessDebtRepay: 0,
          fairnessPaymentUsd: 0,
          debtRemainingAfter: 0,
          btcRemainingAfter: 0,
        },
      ],
      currentHF,
      collateralValue,
      targetSeizureBtc: totalBtc,
      warnings: [
        {
          type: "dust",
          title: COPY.liquidationWarnings.dust.title,
          detail: COPY.liquidationWarnings.dust.detail,
        },
      ],
      suggestedVaultOrder: null,
    };
  }

  // ── 2. Protocol math ───────────────────────────────────────────

  const { seizedFraction, seizedFractionRaw } = computeSeizedFractionDetailed(
    CF,
    maxLB,
    THF,
    expectedHF,
  );
  const targetSeizureBtc = totalBtc * seizedFraction;
  const liqPenalty = maxLB * CF;
  // Invalid governance params: the seizure formula produced a fraction outside
  // [0, 1]. We surface this as a soft advisory and suppress both the urgent
  // signal and the reorder suggestion (liq math is meaningless here).
  const seizedParamsInvalid = seizedFractionRaw <= 0 || seizedFractionRaw > 1;

  // ── 3. Group calculation (against the current on-chain order) ──

  let remainingVaults: Vault[] = [...vaults];
  let remainingDebt = totalDebtUsd;
  let remainingBtc = totalBtc;
  let groupIndex = 1;

  while (
    remainingVaults.length > 0 &&
    remainingDebt > MIN_DEBT_THRESHOLD &&
    groupIndex <= MAX_GROUPS
  ) {
    const pLiq = remainingDebt / (remainingBtc * CF);
    const distancePct = ((pLiq - btcPrice) / btcPrice) * 100;
    const curTargetSeizure = remainingBtc * seizedFraction;

    let prefixSum = 0;
    let i = 0;
    while (
      i < remainingVaults.length &&
      prefixSum < curTargetSeizure * (1 - SEIZURE_TOL)
    ) {
      prefixSum += remainingVaults[i].btc;
      i++;
    }

    const isGroupFull = i >= remainingVaults.length;
    const seizedVaults = remainingVaults.slice(0, i);
    const seizedBtc = prefixSum;
    const overSeizureBtc = Math.max(0, seizedBtc - curTargetSeizure);
    const debtDenominator = THF - liqPenalty;
    const debtToRepay =
      debtDenominator === 0
        ? remainingDebt
        : remainingDebt * ((THF - expectedHF) / debtDenominator);

    let fairnessDebtRepay = 0;
    let fairnessPaymentUsd = 0;
    let debtRepaid: number;
    let debtRemainingAfter: number;
    const btcRemainingAfter = Math.max(0, remainingBtc - seizedBtc);

    if (isGroupFull) {
      const collateralAtLiqPrice = remainingDebt / CF;
      const fairCollateralUsd = debtToRepay * maxLB;
      const remainingCollateralAfterFair =
        collateralAtLiqPrice - fairCollateralUsd;
      const remainingDebtAfterFair = remainingDebt - debtToRepay;
      fairnessPaymentUsd = Math.max(
        0,
        remainingCollateralAfterFair - remainingDebtAfterFair,
      );
      debtRepaid = remainingDebt;
      debtRemainingAfter = 0;
    } else {
      const overSeizureVal = (overSeizureBtc * pLiq) / maxLB;
      const maxDebtRepayable = Math.max(0, remainingDebt - debtToRepay);
      fairnessDebtRepay = Math.min(overSeizureVal, maxDebtRepayable);
      const leftoverOverSeizure = overSeizureVal - fairnessDebtRepay;
      fairnessPaymentUsd =
        leftoverOverSeizure > 0 ? leftoverOverSeizure * maxLB : 0;
      debtRepaid = debtToRepay + fairnessDebtRepay;
      debtRemainingAfter = Math.max(0, remainingDebt - debtRepaid);
    }

    groups.push({
      index: groupIndex,
      vaults: seizedVaults,
      combinedBtc: seizedBtc,
      liquidationPrice: pLiq,
      distancePct,
      targetSeizureBtc: curTargetSeizure,
      overSeizureBtc,
      isFullLiquidation: isGroupFull,
      debtToRepay,
      liquidatorProfitUsd: debtToRepay * (maxLB - 1),
      debtRepaid,
      fairnessDebtRepay,
      fairnessPaymentUsd,
      debtRemainingAfter,
      btcRemainingAfter,
    });

    remainingVaults = remainingVaults.slice(i);
    remainingDebt = debtRemainingAfter;
    remainingBtc = btcRemainingAfter;
    groupIndex++;
  }

  // ── 4. Optimal-order analysis (manual "Apply Suggested Order") ──
  //
  // We never reorder automatically. Score the current order against the
  // optimizer's best order; only when the optimizer strictly improves the
  // cascade (more BTC surviving across events, tie-broken by BTC after the
  // first event) do we surface a suggested order for the user to apply.
  // Skipped under invalid params — the cascade scores are meaningless there.

  let suggestedVaultOrder: Vault[] | null = null;
  if (!seizedParamsInvalid) {
    const current = simulateCascade(
      vaults,
      totalDebtUsd,
      seizedFraction,
      SEIZURE_TOL,
      CF,
      THF,
      maxLB,
      expectedHF,
    );
    const optimal = computeOptimalOrder(
      vaults,
      totalDebtUsd,
      seizedFraction,
      SEIZURE_TOL,
      CF,
      THF,
      maxLB,
      expectedHF,
    );
    const sumImproves =
      optimal.sumBtcAfterEvents > current.sumBtcAfterEvents + REORDER_TOL;
    const afterG1Improves =
      Math.abs(optimal.sumBtcAfterEvents - current.sumBtcAfterEvents) <=
        REORDER_TOL && optimal.btcAfterG1 > current.btcAfterG1 + REORDER_TOL;
    if (sumImproves || afterG1Improves) suggestedVaultOrder = optimal.order;
  }

  // ── 5. Warnings ────────────────────────────────────────────────

  const firstGroup = groups[0];

  // weird-params: seizedFraction raw value was outside [0, 1]. Protocol params
  // are set by governance — the user can't change them — so this is advisory.
  if (seizedParamsInvalid) {
    const { weirdParams } = COPY.liquidationWarnings;
    let detail: string;
    if (THF - liqPenalty <= 0) {
      detail = weirdParams.causeLiqPenalty(liqPenalty.toFixed(3), String(THF));
    } else if (THF <= expectedHF) {
      detail = weirdParams.causeThfTooLow(String(THF), String(expectedHF));
    } else if (seizedFractionRaw > 1) {
      detail = weirdParams.causeFractionOver(
        (seizedFractionRaw * 100).toFixed(1),
      );
    } else {
      detail = weirdParams.causeGeneric((seizedFractionRaw * 100).toFixed(1));
    }
    warnings.push({
      type: "weird-params",
      title: weirdParams.title,
      detail,
      tone: "soft",
    });
  }

  const hasWeirdParams = warnings.some((w) => w.type === "weird-params");

  // urgent: position already liquidatable (distancePct >= 0) or within 5%.
  // Skip when weird-params fired — liq-price math is meaningless under invalid
  // params.
  if (!hasWeirdParams && firstGroup) {
    const { urgent } = COPY.liquidationWarnings;
    const liqPriceStr = firstGroup.liquidationPrice.toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });
    const distAbs = Math.abs(firstGroup.distancePct);
    if (firstGroup.distancePct >= 0) {
      warnings.push({
        type: "urgent",
        title: urgent.liquidatableTitle,
        detail: urgent.liquidatableDetail(liqPriceStr),
        suggestion: urgent.liquidatableSuggestion,
      });
    } else if (distAbs < URGENT_DISTANCE_PCT) {
      warnings.push({
        type: "urgent",
        title: urgent.approachingTitle(distAbs.toFixed(1)),
        detail: urgent.approachingDetail(liqPriceStr, distAbs.toFixed(2)),
        suggestion: urgent.approachingSuggestion,
      });
    }
  }

  // ── 6. Return ──────────────────────────────────────────────────

  return {
    groups,
    currentHF,
    collateralValue,
    targetSeizureBtc,
    warnings,
    suggestedVaultOrder,
  };
}
