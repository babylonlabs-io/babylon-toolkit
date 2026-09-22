import {
  computeOptimalOrder,
  computeSeizedFractionDetailed,
  getGroup1FromOrder,
  MAX_DP_N,
  MAX_GROUPS,
  MIN_DEBT_THRESHOLD,
  SEIZURE_TOL,
  simulateCascade,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { COPY } from "@/copy";

import { fmtSuggestedVaultBtc, SUGGESTED_VAULT_BTC_DECIMALS } from "./format";
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

const SUGGESTED_VAULT_BTC_SCALE = 10 ** SUGGESTED_VAULT_BTC_DECIMALS;

/**
 * Float noise allowed before rounding up, so 0.14 × 10_000 =
 * 1400.0000000000002 stays 0.14 instead of becoming 0.1401.
 */
const CEIL_FLOAT_TOLERANCE = 1e-9;

/** Round a suggested vault size up to {@link SUGGESTED_VAULT_BTC_DECIMALS}. */
function ceilSuggestedVaultBtc(btc: number): number {
  return (
    Math.ceil(btc * SUGGESTED_VAULT_BTC_SCALE - CEIL_FLOAT_TOLERANCE) /
    SUGGESTED_VAULT_BTC_SCALE
  );
}

/**
 * Size a suggested new vault: rounded up, and never below the smallest
 * depositable vault.
 */
function sizeSuggestedVaultBtc(
  neededBtc: number,
  minSuggestedVaultBtc: number,
): number {
  return Math.max(ceilSuggestedVaultBtc(neededBtc), minSuggestedVaultBtc);
}

/**
 * Compute the partial-liquidation cascade and position warnings.
 *
 * Liquidation follows the current on-chain vault order, so the group breakdown
 * is computed against that order. Separately, the optimizer is run and — when
 * it finds a strictly better order — `optimalVaultOrder` is returned so the
 * banner can offer a manual "Apply Optimal Order" action.
 *
 * Warnings: `weird-params` (invalid protocol params, soft — suppresses all
 * other advisories), `too-many-vaults` (optimizer fell back past its cap),
 * `urgent` (already liquidatable or within 5%), `cliff` (all vaults consolidate
 * into one liquidation group — partial liquidation impossible), `reorder` (a
 * safer order exists), or `dust`.
 */
export function calculate(params: CalculatorParams): CalculatorResult {
  const {
    btcPrice,
    totalDebtUsd,
    vaults,
    CF,
    THF,
    LB,
    expectedHF,
    minPeginBtc,
  } = params;
  // A suggested vault is never smaller than a depositable one. A larger first
  // vault still covers the seizure; it just protects a little less. Without
  // the peg-in configuration there is no floor: the suggestion is advisory.
  const minSuggestedVaultBtc =
    minPeginBtc === null ? 0 : ceilSuggestedVaultBtc(minPeginBtc);

  const totalBtc = vaults.reduce((s, v) => s + v.btc, 0);
  const nVaults = vaults.length;
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
      optimalVaultOrder: null,
      suggestedNewVaultBtc: null,
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
      optimalVaultOrder: null,
      suggestedNewVaultBtc: null,
    };
  }

  // ── 2. Protocol math ───────────────────────────────────────────

  const { seizedFraction, seizedFractionRaw } = computeSeizedFractionDetailed(
    CF,
    LB,
    THF,
    expectedHF,
  );
  const targetSeizureBtc = totalBtc * seizedFraction;
  const liqPenalty = LB * CF;
  // Invalid governance params: the seizure formula produced a fraction outside
  // [0, 1]. We surface this as a soft advisory and suppress every other
  // advisory (the liq math is meaningless here).
  const seizedParamsInvalid = seizedFractionRaw <= 0 || seizedFractionRaw > 1;

  // ── 3. Group calculation (against the current on-chain order) ──
  //
  // Skipped entirely when params are invalid: with a clamped seizedFraction the
  // prefix walk consumes no vaults, so the cascade would otherwise emit a run of
  // empty, debt-unchanged groups. We leave `groups` empty and let the soft
  // advisory carry the message instead.

  let remainingVaults: Vault[] = [...vaults];
  let remainingDebt = totalDebtUsd;
  let remainingBtc = totalBtc;
  let groupIndex = 1;

  while (
    !seizedParamsInvalid &&
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
      const fairCollateralUsd = debtToRepay * LB;
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
      const overSeizureVal = (overSeizureBtc * pLiq) / LB;
      const maxDebtRepayable = Math.max(0, remainingDebt - debtToRepay);
      fairnessDebtRepay = Math.min(overSeizureVal, maxDebtRepayable);
      const leftoverOverSeizure = overSeizureVal - fairnessDebtRepay;
      fairnessPaymentUsd =
        leftoverOverSeizure > 0 ? leftoverOverSeizure * LB : 0;
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
      liquidatorProfitUsd: debtToRepay * (LB - 1),
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

  const firstGroup = groups[0];
  const isCliff =
    firstGroup != null && firstGroup.vaults.length === nVaults && nVaults > 1;

  // ── 4. weird-params advisory (exclusive) ───────────────────────
  //
  // Protocol params are set by governance — the user can't change them — so
  // this is advisory and suppresses every other warning.
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

    return {
      groups,
      currentHF,
      collateralValue,
      targetSeizureBtc,
      warnings,
      optimalVaultOrder: null,
      suggestedNewVaultBtc: null,
    };
  }

  // ── 5. Optimal-order analysis (manual "Apply Optimal Order") ──
  //
  // We never reorder automatically. Score the current order against the
  // optimizer's best order; only when the optimizer strictly improves the
  // cascade do we surface the optimal order for the user to apply.

  const {
    order: globalOptimalOrder,
    sumBtcAfterEvents: optimalSum,
    btcAfterG1: optimalBtcAfterG1,
  } = computeOptimalOrder(
    vaults,
    totalDebtUsd,
    seizedFraction,
    SEIZURE_TOL,
    CF,
    THF,
    LB,
    expectedHF,
  );
  const { sumBtcAfterEvents: currentSum, btcAfterG1: currentBtcAfterG1 } =
    simulateCascade(
      vaults,
      totalDebtUsd,
      seizedFraction,
      SEIZURE_TOL,
      CF,
      THF,
      LB,
      expectedHF,
    );

  // Past the DP cap the optimizer returns a largest-first heuristic, not a
  // guaranteed optimum — don't trust reorder comparisons in that mode.
  const optimizerReliable = nVaults <= MAX_DP_N;
  const sumImproves =
    optimizerReliable && optimalSum > currentSum + REORDER_TOL;
  const afterG1Improves =
    optimizerReliable &&
    !sumImproves &&
    optimalBtcAfterG1 > currentBtcAfterG1 + REORDER_TOL;
  let reorderWouldHelp = sumImproves || afterG1Improves;
  const globalOptimalOrderStr = globalOptimalOrder
    .map((v) => v.name)
    .join(" → ");

  const optimalG1Vaults = getGroup1FromOrder(
    globalOptimalOrder,
    seizedFraction,
    SEIZURE_TOL,
  );
  const optimalG1Btc = optimalG1Vaults.reduce((s, v) => s + v.btc, 0);
  const currentGroup1Btc = firstGroup?.combinedBtc ?? Infinity;
  const group1ReorderWouldHelp =
    reorderWouldHelp && currentGroup1Btc > optimalG1Btc + REORDER_TOL;

  // Don't suggest a reorder that would newly introduce an over-seizure
  // condition (Group 1 loses more in excess than it protects) that the current
  // order doesn't already have — a reorder should never make the position
  // worse. Cliff cases are exempt: for a cliff, reordering is always an
  // improvement even if the result over-seizes.
  if (reorderWouldHelp && nVaults >= 2 && !isCliff) {
    const currentOverSeizure = firstGroup ? firstGroup.overSeizureBtc : 0;
    const currentProtected = firstGroup ? firstGroup.btcRemainingAfter : 0;
    const currentHasOverSeizure = currentOverSeizure > currentProtected;

    const optTarget = totalBtc * seizedFraction;
    const optOver = Math.max(0, optimalG1Btc - optTarget);
    const optProtected = totalBtc - optimalG1Btc;
    const optIsCliff = optimalG1Vaults.length === nVaults;
    const optWouldOverSeize = optOver > optProtected && !optIsCliff;

    if (!currentHasOverSeizure && optWouldOverSeize) {
      reorderWouldHelp = false;
    }
  }

  const optimalVaultOrder: Vault[] | null = reorderWouldHelp
    ? globalOptimalOrder
    : null;

  // ── 6. Warnings: too-many-vaults / urgent ──────────────────────

  // Too many vaults — optimizer fell back to largest-first, so the suggested
  // order is no longer guaranteed optimal.
  if (nVaults > MAX_DP_N) {
    warnings.push({
      type: "too-many-vaults",
      title: COPY.liquidationWarnings.tooManyVaults.title,
      detail: COPY.liquidationWarnings.tooManyVaults.detail(nVaults, MAX_DP_N),
      suggestion: COPY.liquidationWarnings.tooManyVaults.suggestion,
    });
  }

  // urgent: position already liquidatable (distancePct >= 0) or within 5%.
  if (firstGroup) {
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
        detail: urgent.approachingDetail(liqPriceStr),
        suggestion: urgent.approachingSuggestion,
      });
    }
  }

  // ── 7. Warnings: cliff / reorder ───────────────────────────────

  const { cliff, reorder } = COPY.liquidationWarnings;

  // Single reorder notification (per Figma) reused across every case that wants
  // to suggest a safer order; the order itself renders as chips from
  // `optimalVaultOrder`, so no per-case suggestion text is needed.
  const reorderWarning: Warning = {
    type: "reorder",
    title: reorder.title,
    detail: reorder.detail,
  };

  // CASE 1: Single vault — always fully seized. Figma CLIFF A (#1948):
  // suggest adding a sacrificial vault sized so the existing vault becomes
  // protected, s = existingBtc × seizedFraction / (1 − seizedFraction). That
  // vault is smaller than the existing one exactly when seizedFraction < 0.5,
  // which the split target health factor keeps true for every CF up to 86%.
  // Otherwise the add would exceed the position and the only advice is to add
  // collateral or repay: re-depositing the same BTC as two vaults would need
  // the first vault to be the larger one, a split the deposit form refuses.
  let suggestedNewVaultBtc: number | null = null;
  if (nVaults === 1) {
    if (seizedFraction < 1) {
      const suggested = sizeSuggestedVaultBtc(
        (vaults[0].btc * seizedFraction) / (1 - seizedFraction),
        minSuggestedVaultBtc,
      );
      // Actionable only if positive AND strictly smaller than the existing
      // vault, which becomes the protected one.
      if (suggested > 0 && suggested < totalBtc) {
        suggestedNewVaultBtc = suggested;
      }
    }

    warnings.push({
      type: "cliff",
      title: cliff.title,
      detail: cliff.body,
      suggestion:
        suggestedNewVaultBtc !== null
          ? cliff.addSacrificialSuggestion(
              fmtSuggestedVaultBtc(suggestedNewVaultBtc),
            )
          : cliff.noSplitSuggestion,
    });
  }

  // CASE 2: Exactly two vaults — shared shell, keep the structural suggestion.
  else if (nVaults === 2) {
    if (isCliff && group1ReorderWouldHelp && optimalVaultOrder) {
      // Cliff that swapping the order fixes — surfaced as the reorder
      // notification (the order itself renders as chips).
      warnings.push(reorderWarning);
    } else if (isCliff) {
      // Informational deficit text (no actionable button for 2 vaults).
      const largest = vaults.reduce((a, b) => (a.btc > b.btc ? a : b));
      let enablePartialStr = "";
      if (seizedFraction < 1 && totalBtc * seizedFraction > largest.btc) {
        const deficit =
          (totalBtc * seizedFraction - largest.btc) / (1 - seizedFraction);
        const rounded = sizeSuggestedVaultBtc(deficit, minSuggestedVaultBtc);
        if (rounded <= totalBtc) {
          enablePartialStr = cliff.twoVault.enablePartial(
            fmtSuggestedVaultBtc(rounded),
            largest.name,
          );
        }
      }
      warnings.push({
        type: "cliff",
        title: cliff.title,
        detail: cliff.body,
        suggestion: cliff.twoVault.suggestion(
          fmtSuggestedVaultBtc(targetSeizureBtc),
          enablePartialStr,
        ),
      });
    } else if (reorderWouldHelp) {
      warnings.push(reorderWarning);
    }
  }

  // CASE 3+: three or more vaults — shared shell, keep the structural suggestion.
  else if (nVaults >= 3) {
    if (isCliff) {
      const cliffReorderFix =
        group1ReorderWouldHelp && optimalVaultOrder !== null;
      warnings.push({
        type: "cliff",
        title: cliff.title,
        detail: cliff.body,
        suggestion: cliff.multiVault.suggestion(
          nVaults,
          cliffReorderFix,
          globalOptimalOrderStr,
        ),
      });
    } else if (reorderWouldHelp) {
      warnings.push(reorderWarning);
    }
  }

  // ── 8. Return ──────────────────────────────────────────────────

  return {
    groups,
    currentHF,
    collateralValue,
    targetSeizureBtc,
    warnings,
    optimalVaultOrder,
    suggestedNewVaultBtc,
  };
}
