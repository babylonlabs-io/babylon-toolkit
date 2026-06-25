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
 * Safety buffer applied to the target seizure when recommending a sacrificial
 * vault size, so the sacrificial group reliably covers the seizure at the
 * liquidation moment. Hard-coded per the protocol/liquidation spec.
 */
const SAFETY_MARGIN = 1.05;

/** Format a BTC amount to 2 decimals for user-facing copy. */
const btc2 = (n: number): string => n.toFixed(2);

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
 * safer order exists), `rebalance` (the first group over-seizes), or `dust`.
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
      recommendedSacrificialBtc: 0,
      warnings,
      isFullLiquidation: false,
      optimalVaultOrder: null,
      suggestedNewVaultBtc: null,
      suggestedRebalanceVaultBtc: null,
      suggestedRebalanceOrder: null,
      rebalanceImprovementBtc: 0,
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
      recommendedSacrificialBtc: totalBtc,
      warnings: [
        {
          type: "dust",
          title: COPY.liquidationWarnings.dust.title,
          detail: COPY.liquidationWarnings.dust.detail,
        },
      ],
      isFullLiquidation: true,
      optimalVaultOrder: null,
      suggestedNewVaultBtc: null,
      suggestedRebalanceVaultBtc: null,
      suggestedRebalanceOrder: null,
      rebalanceImprovementBtc: 0,
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
  const recommendedSacrificialBtc = Math.min(
    targetSeizureBtc * SAFETY_MARGIN,
    totalBtc,
  );
  // Combined seizure-with-safety-margin factor, used for vault-sizing advice.
  const liqFactor = seizedFraction * SAFETY_MARGIN;
  const liqPenalty = maxLB * CF;
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
  let isFullLiquidation = false;

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
    if (isGroupFull) isFullLiquidation = true;
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
      recommendedSacrificialBtc,
      warnings,
      isFullLiquidation,
      optimalVaultOrder: null,
      suggestedNewVaultBtc: null,
      suggestedRebalanceVaultBtc: null,
      suggestedRebalanceOrder: null,
      rebalanceImprovementBtc: 0,
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
    maxLB,
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
      maxLB,
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

  // Suppress reorder if it would create a rebalance condition that doesn't exist
  // now (prevents a reorder↔rebalance loop). Cliff cases are exempt — for a
  // cliff, reordering is always an improvement even if it introduces rebalance.
  if (reorderWouldHelp && nVaults >= 2 && !isCliff) {
    const currentOverSeizure = firstGroup ? firstGroup.overSeizureBtc : 0;
    const currentProtected = firstGroup ? firstGroup.btcRemainingAfter : 0;
    const currentHasRebalanceCond = currentOverSeizure > currentProtected;

    const optTarget = totalBtc * seizedFraction;
    const optOver = Math.max(0, optimalG1Btc - optTarget);
    const optProtected = totalBtc - optimalG1Btc;
    const optIsCliff = optimalG1Vaults.length === nVaults;
    const optWouldTriggerRebalance = optOver > optProtected && !optIsCliff;

    if (!currentHasRebalanceCond && optWouldTriggerRebalance) {
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
        detail: urgent.approachingDetail(liqPriceStr, distAbs.toFixed(2)),
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

  // CASE 1: Single vault — always fully seized. To protect it, add a NEW
  // sacrificial vault at position 1. Adding a vault increases total BTC, hence
  // target seizure: s >= existingBtc × liqFactor / (1 − liqFactor).
  let suggestedNewVaultBtc: number | null = null;
  if (nVaults === 1) {
    const canSplit = liqFactor < 1;
    const raw = canSplit
      ? (vaults[0].btc * liqFactor) / (1 - liqFactor)
      : Infinity;
    const rounded = canSplit ? Math.ceil(raw * 100) / 100 : Infinity;
    // Actionable only if positive AND no larger than the existing position.
    if (canSplit && rounded > 0 && rounded <= totalBtc) {
      suggestedNewVaultBtc = rounded;
    }

    let suggestion: string;
    if (suggestedNewVaultBtc !== null) {
      suggestion = cliff.single.actionableSuggestion(
        btc2(suggestedNewVaultBtc),
        btc2(vaults[0].btc),
      );
    } else if (!canSplit) {
      suggestion = cliff.single.noSplitSuggestion;
    } else {
      suggestion = cliff.single.oversizedSuggestion(btc2(raw));
    }

    warnings.push({
      type: "cliff",
      title: cliff.single.title,
      detail: cliff.single.detail,
      suggestion,
    });
  }

  // CASE 2: Exactly two vaults.
  else if (nVaults === 2) {
    if (isCliff && group1ReorderWouldHelp && optimalVaultOrder) {
      // Cliff that swapping the order fixes — surfaced as the reorder
      // notification (the order itself renders as chips).
      warnings.push(reorderWarning);
    } else if (isCliff) {
      // Informational deficit text (no actionable button for 2 vaults).
      const largest = vaults.reduce((a, b) => (a.btc > b.btc ? a : b));
      let enablePartialStr = "";
      if (liqFactor < 1 && totalBtc * liqFactor > largest.btc) {
        const deficit = (totalBtc * liqFactor - largest.btc) / (1 - liqFactor);
        const rounded = Math.ceil(deficit * 100) / 100;
        if (rounded <= totalBtc) {
          enablePartialStr = cliff.twoVault.enablePartial(
            btc2(rounded),
            largest.name,
          );
        }
      }
      warnings.push({
        type: "cliff",
        title: cliff.twoVault.title,
        detail: cliff.twoVault.detail(btc2(targetSeizureBtc)),
        suggestion: cliff.twoVault.suggestion(enablePartialStr),
      });
    } else if (reorderWouldHelp) {
      warnings.push(reorderWarning);
    }
  }

  // CASE 3+: three or more vaults.
  else if (nVaults >= 3) {
    if (isCliff) {
      const cliffReorderFix =
        group1ReorderWouldHelp && optimalVaultOrder !== null;
      warnings.push({
        type: "cliff",
        title: cliff.multiVault.title,
        detail: cliff.multiVault.detail(nVaults, cliffReorderFix),
        ...(cliffReorderFix
          ? { suggestion: cliff.multiVault.suggestion(globalOptimalOrderStr) }
          : {}),
      });
    } else if (reorderWouldHelp) {
      warnings.push(reorderWarning);
    }
  }

  // ── 8. Warning: rebalance ──────────────────────────────────────
  //
  // Over-seizure in Group 1 means vault sizes aren't optimal: you lose more in
  // excess than what survives. A new sacrificial vault (combined with the
  // existing small vaults) protects the largest one.

  const g1OverSeizure = firstGroup ? firstGroup.overSeizureBtc : 0;
  const g1TargetSeizure = firstGroup ? firstGroup.targetSeizureBtc : 0;
  const g1ProtectedBtc = firstGroup ? firstGroup.btcRemainingAfter : 0;
  const rebalanceNeeded =
    g1OverSeizure > g1ProtectedBtc && nVaults >= 2 && !isCliff;

  const idealProtectedBtc = totalBtc - totalBtc * Math.min(liqFactor, 1);
  const currentProtectedBtc = firstGroup
    ? firstGroup.btcRemainingAfter
    : totalBtc;
  const rebalanceImprovementBtc = rebalanceNeeded
    ? Math.max(0, idealProtectedBtc - currentProtectedBtc)
    : 0;

  // Suggested new sacrificial vault: s >= (T × liqFactor − smallVaultsSum) /
  // (1 − liqFactor). Cheaper than a standalone vault because the existing small
  // vaults contribute to covering the target seizure.
  let suggestedRebalanceVaultBtc: number | null = null;
  let suggestedRebalanceOrder: Vault[] | null = null;
  if (rebalanceNeeded && liqFactor < 1) {
    const largest = vaults.reduce((a, b) => (a.btc > b.btc ? a : b));
    const smallVaults = vaults.filter((v) => v.id !== largest.id);
    const smallVaultsSum = smallVaults.reduce((s, v) => s + v.btc, 0);
    const raw = (totalBtc * liqFactor - smallVaultsSum) / (1 - liqFactor);
    const rounded = Math.ceil(Math.max(0, raw) * 100) / 100;
    if (rounded <= totalBtc) {
      suggestedRebalanceVaultBtc = rounded;
      const placeholder: Vault = {
        id: "__new__",
        name: "__new__",
        btc: rounded,
      };
      const allVaults = [placeholder, ...vaults];

      // Deterministic protective order: new + small vaults first, largest last —
      // together the front group covers the target seizure, protecting the
      // largest vault.
      const sortedSmall = [...smallVaults].sort((a, b) => b.btc - a.btc);
      const manualOrder = [placeholder, ...sortedSmall, largest];

      if (allVaults.length > MAX_DP_N) {
        // Adding the placeholder crosses the optimizer cap, so computeOptimalOrder
        // would only return a largest-first heuristic — not a guaranteed optimum.
        // Use the manual protective order directly rather than presenting the
        // heuristic as if it were optimizer-backed.
        suggestedRebalanceOrder = manualOrder;
      } else {
        const { order: optOrder } = computeOptimalOrder(
          allVaults,
          totalDebtUsd,
          seizedFraction,
          SEIZURE_TOL,
          CF,
          THF,
          maxLB,
          expectedHF,
        );

        // If the optimizer order still triggers rebalance, fall back to the
        // manual protective order.
        const allTotal = allVaults.reduce((s, v) => s + v.btc, 0);
        const optG1Btc = getGroup1FromOrder(
          optOrder,
          seizedFraction,
          SEIZURE_TOL,
        ).reduce((s, v) => s + v.btc, 0);
        const optProtected = allTotal - optG1Btc;
        const optOver = optG1Btc - allTotal * seizedFraction;
        suggestedRebalanceOrder =
          optOver > optProtected ? manualOrder : optOrder;
      }
    }
  }

  // Emit the rebalance warning only when no cliff/reorder already covers it;
  // otherwise drop its suggestion data so no orphan action button renders.
  const hasCliffOrReorder = warnings.some(
    (w) => w.type === "cliff" || w.type === "reorder",
  );
  if (rebalanceNeeded && hasCliffOrReorder) {
    suggestedRebalanceVaultBtc = null;
    suggestedRebalanceOrder = null;
  }
  if (rebalanceNeeded && !hasCliffOrReorder) {
    const largest = vaults.reduce((a, b) => (a.btc > b.btc ? a : b));
    const g1CombinedBtc = firstGroup?.combinedBtc ?? 0;
    let suggestion: string;
    if (
      suggestedRebalanceVaultBtc !== null &&
      suggestedRebalanceOrder !== null
    ) {
      const smallNames = vaults
        .filter((v) => v.id !== largest.id)
        .map((v) => v.name)
        .join(" + ");
      suggestion = COPY.liquidationWarnings.rebalance.actionableSuggestion(
        btc2(suggestedRebalanceVaultBtc),
        smallNames,
        largest.name,
        btc2(largest.btc),
      );
    } else {
      suggestion = COPY.liquidationWarnings.rebalance.fallbackSuggestion(
        btc2(totalBtc * Math.min(liqFactor, 1)),
      );
    }
    warnings.push({
      type: "rebalance",
      title: COPY.liquidationWarnings.rebalance.title,
      detail: COPY.liquidationWarnings.rebalance.detail(
        btc2(g1CombinedBtc),
        btc2(g1TargetSeizure),
        btc2(g1OverSeizure),
        btc2(rebalanceImprovementBtc),
      ),
      suggestion,
    });
  }

  // ── 9. Return ──────────────────────────────────────────────────

  return {
    groups,
    currentHF,
    collateralValue,
    targetSeizureBtc,
    recommendedSacrificialBtc,
    warnings,
    isFullLiquidation,
    optimalVaultOrder,
    suggestedNewVaultBtc,
    suggestedRebalanceVaultBtc,
    suggestedRebalanceOrder,
    rebalanceImprovementBtc,
  };
}
