import {
  computeOptimalOrder,
  computeSeizedFractionDetailed,
  getGroup1FromOrder,
  MAX_GROUPS,
  MIN_DEBT_THRESHOLD,
  SEIZURE_TOL,
  simulateCascade,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import {
  EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
  VAULT_SPLIT_SAFETY_MARGIN,
} from "../constants";

import { fmt } from "./format";
import type {
  CalculatorParams,
  CalculatorResult,
  LiquidationGroup,
  Vault,
  Warning,
} from "./types";
import {
  buildCliff2VaultWarning,
  buildCliff3PlusWarning,
  buildCliffSingleVaultWarning,
  buildRebalanceWarning,
  buildReorderDetail,
} from "./warningBuilders";

/** Minimum position value for meaningful analysis */
const DUST_THRESHOLD_USD = 1000;

/** Distance to liquidation for critical warning */
const URGENT_DISTANCE_PCT = 5;

/** Threshold for detecting meaningful reorder improvement */
const REORDER_TOL = 0.001;

/** Placeholder ID for a hypothetical new vault in rebalance suggestions */
const PLACEHOLDER_VAULT_ID = "__new__";

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

  if (totalDebtUsd <= 0) {
    return buildEmptyResult(groups, collateralValue, warnings);
  }

  // Dust check — force single group
  const isDust =
    totalDebtUsd < DUST_THRESHOLD_USD || collateralValue < DUST_THRESHOLD_USD;
  if (isDust) {
    return buildDustResult(
      vaults,
      totalBtc,
      btcPrice,
      CF,
      totalDebtUsd,
      currentHF,
      collateralValue,
    );
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
    targetSeizureBtc * VAULT_SPLIT_SAFETY_MARGIN,
    totalBtc,
  );
  const liqFactor = seizedFraction * VAULT_SPLIT_SAFETY_MARGIN;

  // ── 3. Group calculation ───────────────────────────────────────

  let remainingVaults: Vault[] = [...vaults];
  let remainingDebt = totalDebtUsd;
  let remainingBtc = totalBtc;
  let groupIndex = 1;
  let isFullLiquidation = false;
  const liqPenalty = maxLB * CF;

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
      fairnessDebtRepay = Math.min(overSeizureVal, remainingDebt - debtToRepay);
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

  // ── 4. Optimal order analysis ──────────────────────────────────

  const firstGroup = groups[0];
  const nVaults = vaults.length;
  const isCliff =
    firstGroup != null && firstGroup.vaults.length === nVaults && nVaults > 1;

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

  // Optimizer throws for >20 vaults (bitmask overflow). Fall back to current
  // order so structural warnings still fire but reorder suggestions are skipped.
  let globalOptimalOrder: Vault[];
  let optimalSum: number;
  let optimalBtcAfterG1: number;
  try {
    const optimized = computeOptimalOrder(
      vaults,
      totalDebtUsd,
      seizedFraction,
      SEIZURE_TOL,
      CF,
      THF,
      maxLB,
      expectedHF,
    );
    globalOptimalOrder = optimized.order;
    optimalSum = optimized.sumBtcAfterEvents;
    optimalBtcAfterG1 = optimized.btcAfterG1;
  } catch {
    globalOptimalOrder = [...vaults];
    optimalSum = currentSum;
    optimalBtcAfterG1 = currentBtcAfterG1;
  }

  const sumImproves = optimalSum > currentSum + REORDER_TOL;
  const afterG1Improves =
    !sumImproves && optimalBtcAfterG1 > currentBtcAfterG1 + REORDER_TOL;
  let reorderWouldHelp = sumImproves || afterG1Improves;
  const globalOptimalOrderStr = globalOptimalOrder
    .map((v) => `${v.name} (${fmt(v.btc)} BTC)`)
    .join(" → ");

  const optimalG1Vaults = getGroup1FromOrder(
    globalOptimalOrder,
    seizedFraction,
    SEIZURE_TOL,
  );
  const optimalG1Btc = optimalG1Vaults.reduce((s, v) => s + v.btc, 0);
  const currentGroup1Btc = firstGroup?.combinedBtc ?? 0;
  const group1ReorderWouldHelp =
    reorderWouldHelp && currentGroup1Btc > optimalG1Btc + REORDER_TOL;

  const savedSum = optimalSum - currentSum;
  const savedBtcAfterG1 = optimalBtcAfterG1 - currentBtcAfterG1;

  // Suppress reorder if it would create a rebalance condition that doesn't exist now.
  // Skip for cliffs — going from cliff to rebalance is always an improvement.
  if (reorderWouldHelp && nVaults >= 2 && !isCliff) {
    const currentOverSeizure = firstGroup ? firstGroup.overSeizureBtc : 0;
    const currentProtected = firstGroup ? firstGroup.btcRemainingAfter : 0;
    const currentIsCliff = firstGroup
      ? firstGroup.vaults.length === nVaults
      : false;
    const currentHasRebalanceCond =
      currentOverSeizure > currentProtected && !currentIsCliff;

    const optTarget = totalBtc * seizedFraction;
    const optOver = Math.max(0, optimalG1Btc - optTarget);
    const optProtected = totalBtc - optimalG1Btc;
    const optIsCliff = optimalG1Vaults.length === nVaults;
    const optWouldTriggerRebalance = optOver > optProtected && !optIsCliff;

    if (!currentHasRebalanceCond && optWouldTriggerRebalance) {
      reorderWouldHelp = false;
    }
  }

  const suggestedVaultOrder: Vault[] | null = reorderWouldHelp
    ? globalOptimalOrder
    : null;

  // ── 5. Warning: weird-params ─────────────────────────────────

  if (seizedFractionRaw <= 0 || seizedFractionRaw > 1) {
    warnings.push({
      type: "weird-params",
      title: "Unusual protocol parameters",
      detail: `Seizure fraction computed as ${(seizedFractionRaw * 100).toFixed(1)}% — outside the valid range. Results may be unreliable. Check CF, THF, maxLB and expectedHF values.`,
    });
  }

  // ── 6. Warning: urgent ───────────────────────────────────────

  if (firstGroup && firstGroup.distancePct >= 0) {
    warnings.push({
      type: "urgent",
      title: "Position already liquidatable",
      detail: `Health Factor is below 1.0 — liquidation can be triggered now. Liq price $${firstGroup.liquidationPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })} is above current BTC price.`,
      suggestion:
        "Add collateral or repay debt immediately to restore Health Factor above 1.0.",
    });
  } else if (
    firstGroup &&
    Math.abs(firstGroup.distancePct) < URGENT_DISTANCE_PCT
  ) {
    warnings.push({
      type: "urgent",
      title: `Critical — liquidation in ${Math.abs(firstGroup.distancePct).toFixed(1)}%`,
      detail: `BTC needs to drop only ${Math.abs(firstGroup.distancePct).toFixed(2)}% to trigger liquidation at $${firstGroup.liquidationPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}.`,
      suggestion:
        "Add collateral or repay part of the debt to increase your safety margin.",
    });
  }

  // ── 7. Warning: cliff / reorder ──────────────────────────────

  let suggestedNewVaultBtc: number | null = null;

  if (nVaults === 1) {
    // Single vault — always a cliff
    let rawSacrificial = 0;
    if (liqFactor < 1) {
      rawSacrificial = (vaults[0].btc * liqFactor) / (1 - liqFactor);
      const rounded = Math.ceil(rawSacrificial * 100) / 100;
      if (rounded <= totalBtc) suggestedNewVaultBtc = rounded;
    }
    warnings.push(
      buildCliffSingleVaultWarning(
        vaults[0],
        suggestedNewVaultBtc,
        rawSacrificial,
      ),
    );
  } else if (nVaults === 2) {
    if (isCliff && group1ReorderWouldHelp && suggestedVaultOrder) {
      const best = optimalG1Vaults[0];
      const other = vaults.find((v) => v.id !== best.id);
      if (!other) {
        throw new Error(
          "Expected 2 vaults but could not find the non-best vault",
        );
      }
      warnings.push({
        type: "cliff",
        title: "Swap vault order to unlock partial protection",
        detail: `${best.name} (${best.btc.toFixed(2)} BTC) covers the target seizure alone. Right now both vaults are seized together because ${vaults[0].name} is first and too small.`,
        suggestion: `Suggested order: ${best.name} (${fmt(best.btc)} BTC) → ${other.name} (${fmt(other.btc)} BTC)`,
      });
    } else if (isCliff) {
      const largest = vaults.reduce((a, b) => (a.btc > b.btc ? a : b));
      let enablePartialStr = "";
      if (liqFactor < 1 && totalBtc * liqFactor > largest.btc) {
        const deficit = (totalBtc * liqFactor - largest.btc) / (1 - liqFactor);
        const rounded = Math.ceil(deficit * 100) / 100;
        if (rounded <= totalBtc) {
          enablePartialStr = `To enable partial liquidation, add ≥ ${fmt(rounded)} BTC alongside ${largest.name}. `;
        }
      }
      warnings.push(
        buildCliff2VaultWarning(targetSeizureBtc, enablePartialStr),
      );
    } else if (group1ReorderWouldHelp) {
      warnings.push({
        type: "reorder",
        title: "Better vault ordering reduces first-event seizure",
        detail: buildReorderDetail(
          sumImproves,
          savedSum,
          savedBtcAfterG1,
          currentGroup1Btc,
          optimalG1Btc,
        ),
        suggestion: `Suggested order: ${globalOptimalOrderStr}`,
      });
    } else if (reorderWouldHelp) {
      warnings.push({
        type: "reorder",
        title: "Better vault ordering deepens cascade protection",
        detail: buildReorderDetail(sumImproves, savedSum, savedBtcAfterG1),
        suggestion: `Suggested order: ${globalOptimalOrderStr}`,
      });
    }
  } else {
    // 3+ vaults
    if (isCliff) {
      const cliffReorderFix =
        group1ReorderWouldHelp && suggestedVaultOrder !== null;
      warnings.push(
        buildCliff3PlusWarning(nVaults, cliffReorderFix, globalOptimalOrderStr),
      );
    } else if (group1ReorderWouldHelp) {
      warnings.push({
        type: "reorder",
        title: "Better vault ordering reduces first-event seizure",
        detail: buildReorderDetail(
          sumImproves,
          savedSum,
          savedBtcAfterG1,
          currentGroup1Btc,
          optimalG1Btc,
        ),
        suggestion: `Suggested order: ${globalOptimalOrderStr}`,
      });
    } else if (reorderWouldHelp) {
      warnings.push({
        type: "reorder",
        title: "Better vault ordering deepens cascade protection",
        detail: buildReorderDetail(sumImproves, savedSum, savedBtcAfterG1),
        suggestion: `Suggested order: ${globalOptimalOrderStr}`,
      });
    }
  }

  // ── 8. Warning: rebalance ──────────────────────────────────────

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
        id: PLACEHOLDER_VAULT_ID,
        name: PLACEHOLDER_VAULT_ID,
        btc: rounded,
      };
      const allVaults = [placeholder, ...vaults];

      // Optimizer may throw for >20 vaults — fall back to manual order
      let useManualOrder = false;
      try {
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

        // Verify the optimized order doesn't still trigger rebalance
        const optG1Btc = getGroup1FromOrder(
          optOrder,
          seizedFraction,
          SEIZURE_TOL,
        ).reduce((s, v) => s + v.btc, 0);
        const allBtc = allVaults.reduce((s, v) => s + v.btc, 0);
        const optProtected = allBtc - optG1Btc;
        const optTarget = allBtc * seizedFraction;
        const optOver = optG1Btc - optTarget;

        if (optOver > optProtected) {
          useManualOrder = true;
        } else {
          suggestedRebalanceOrder = optOrder;
        }
      } catch {
        useManualOrder = true;
      }

      if (useManualOrder) {
        const sortedSmall = [...smallVaults].sort((a, b) => b.btc - a.btc);
        suggestedRebalanceOrder = [placeholder, ...sortedSmall, largest];
      }
    }
  }

  // Suppress rebalance data when cliff/reorder already covers it
  const hasCliffOrReorder = warnings.some(
    (w) => w.type === "cliff" || w.type === "reorder",
  );
  if (rebalanceNeeded && hasCliffOrReorder) {
    suggestedRebalanceVaultBtc = null;
    suggestedRebalanceOrder = null;
  }
  if (rebalanceNeeded && !hasCliffOrReorder) {
    warnings.push(
      buildRebalanceWarning(
        firstGroup?.combinedBtc ?? 0,
        g1TargetSeizure,
        g1OverSeizure,
        rebalanceImprovementBtc,
        suggestedRebalanceVaultBtc,
        suggestedRebalanceOrder,
        vaults,
        totalBtc,
        liqFactor,
      ),
    );
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
    suggestedVaultOrder,
    suggestedNewVaultBtc,
    suggestedRebalanceVaultBtc,
    suggestedRebalanceOrder,
    rebalanceImprovementBtc,
  };
}

function buildEmptyResult(
  groups: LiquidationGroup[],
  collateralValue: number,
  warnings: Warning[],
): CalculatorResult {
  return {
    groups,
    currentHF: Infinity,
    collateralValue,
    targetSeizureBtc: 0,
    recommendedSacrificialBtc: 0,
    warnings,
    isFullLiquidation: false,
    suggestedVaultOrder: null,
    suggestedNewVaultBtc: null,
    suggestedRebalanceVaultBtc: null,
    suggestedRebalanceOrder: null,
    rebalanceImprovementBtc: 0,
  };
}

function buildDustResult(
  vaults: Vault[],
  totalBtc: number,
  btcPrice: number,
  CF: number,
  totalDebtUsd: number,
  currentHF: number,
  collateralValue: number,
): CalculatorResult {
  const liqPrice = totalDebtUsd > 0 ? totalDebtUsd / (totalBtc * CF) : 0;
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
        title: "Dust position",
        detail:
          "Position or collateral value is below $1,000. All vaults are treated as a single liquidation group.",
      },
    ],
    isFullLiquidation: true,
    suggestedVaultOrder: null,
    suggestedNewVaultBtc: null,
    suggestedRebalanceVaultBtc: null,
    suggestedRebalanceOrder: null,
    rebalanceImprovementBtc: 0,
  };
}
