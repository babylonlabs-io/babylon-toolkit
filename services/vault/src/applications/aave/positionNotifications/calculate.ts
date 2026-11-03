import {
  computeLiquidationBonusBps,
  computeOptimalOrder,
  computeSeizedFraction,
  computeSeizedFractionDetailed,
  getGroup1FromOrder,
  type LiquidationBonusCurve,
  MAX_DP_N,
  MAX_GROUPS,
  MIN_DEBT_THRESHOLD,
  SEIZURE_TOL,
  simulateCascade,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { COPY } from "@/copy";

import { BPS_SCALE } from "../constants";

import { fmtSuggestedVaultBtc, SUGGESTED_VAULT_BTC_DECIMALS } from "./format";
import type {
  CalculatorParams,
  CalculatorResult,
  LiquidationGroup,
  Vault,
  Warning,
} from "./types";

/** Minimum debt or collateral value (USD) for position advice. */
const DUST_THRESHOLD_USD = 1000;

/** Distance to liquidation (%) below which we raise an urgent warning */
const URGENT_DISTANCE_PCT = 5;

/**
 * Health factor below which the calculator raises `urgent`. The first group's
 * distance is exactly 1/HF − 1 (pLiq = debt / (BTC × CF), HF = BTC × price ×
 * CF / debt), so "liquidatable or within {@link URGENT_DISTANCE_PCT}" is
 * HF < 1 / (1 − 5%) ≈ 1.0526.
 */
export const URGENT_HEALTH_FACTOR = 1 / (1 - URGENT_DISTANCE_PCT / 100);

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

/** Health factor 1.0 in WAD, the unit the bonus curve reads. */
const HEALTH_FACTOR_ONE_WAD = 1e18;

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
 * Whether the next event is already below its trigger, so it is priced at the
 * market. The contract refuses a reorder then (`reorderVaults` reverts below
 * health factor 1), and what the event seizes no longer follows from the order
 * the way the optimizer scores it.
 */
export function isFirstEventGapped(groups: LiquidationGroup[]): boolean {
  const first = groups[0];
  return first != null && first.executionPrice !== first.liquidationPrice;
}

/** Signed distance from `price` to a trigger, % of `price`. Positive once the
 *  price is below the trigger. */
function distanceToTriggerPct(trigger: number, price: number): number {
  return ((trigger - price) / price) * 100;
}

/** What the seizure maths needs to know about the position at one step. */
interface CascadeStep {
  index: number;
  vaults: Vault[];
  debt: number;
  btc: number;
  btcPrice: number;
  seizedFraction: number;
  CF: number;
  THF: number;
  LB: number;
  bonusCurve: LiquidationBonusCurve;
  expectedHF: number;
}

/**
 * One group when the price falls to its trigger gradually: the trigger is
 * where it executes, and the group is the run of vaults that covers the seizure
 * restoring the split target health factor.
 */
function buildPathGroup(step: CascadeStep): LiquidationGroup {
  const {
    index,
    vaults,
    debt,
    btc,
    btcPrice,
    seizedFraction,
    CF,
    THF,
    LB,
    expectedHF,
  } = step;
  const pLiq = debt / (btc * CF);
  const curTargetSeizure = btc * seizedFraction;

  let prefixSum = 0;
  let i = 0;
  while (
    i < vaults.length &&
    prefixSum < curTargetSeizure * (1 - SEIZURE_TOL)
  ) {
    prefixSum += vaults[i].btc;
    i++;
  }

  const isGroupFull = i >= vaults.length;
  const seizedBtc = prefixSum;
  const overSeizureBtc = Math.max(0, seizedBtc - curTargetSeizure);
  const debtDenominator = THF - LB * CF;
  const debtToRepay =
    debtDenominator === 0
      ? debt
      : debt * ((THF - expectedHF) / debtDenominator);

  let fairnessDebtRepay = 0;
  let fairnessPaymentUsd = 0;
  let debtRepaid: number;
  let debtRemainingAfter: number;

  if (isGroupFull) {
    const collateralAtLiqPrice = debt / CF;
    const fairCollateralUsd = debtToRepay * LB;
    const remainingCollateralAfterFair =
      collateralAtLiqPrice - fairCollateralUsd;
    const remainingDebtAfterFair = debt - debtToRepay;
    fairnessPaymentUsd = Math.max(
      0,
      remainingCollateralAfterFair - remainingDebtAfterFair,
    );
    debtRepaid = debt;
    debtRemainingAfter = 0;
  } else {
    const overSeizureVal = (overSeizureBtc * pLiq) / LB;
    const maxDebtRepayable = Math.max(0, debt - debtToRepay);
    fairnessDebtRepay = Math.min(overSeizureVal, maxDebtRepayable);
    const leftoverOverSeizure = overSeizureVal - fairnessDebtRepay;
    fairnessPaymentUsd = leftoverOverSeizure > 0 ? leftoverOverSeizure * LB : 0;
    debtRepaid = debtToRepay + fairnessDebtRepay;
    debtRemainingAfter = Math.max(0, debt - debtRepaid);
  }

  return {
    index,
    vaults: vaults.slice(0, i),
    combinedBtc: seizedBtc,
    liquidationPrice: pLiq,
    executionPrice: pLiq,
    distancePct: distanceToTriggerPct(pLiq, btcPrice),
    targetSeizureBtc: curTargetSeizure,
    overSeizureBtc,
    isFullLiquidation: isGroupFull,
    debtToRepay,
    liquidatorProfitUsd: debtToRepay * (LB - 1),
    debtRepaid,
    fairnessDebtRepay,
    fairnessPaymentUsd,
    debtRemainingAfter,
    btcRemainingAfter: Math.max(0, btc - seizedBtc),
  };
}

/** Health factor at `price`, on the collateral factor as the Spoke computes it. */
function healthFactorAt(
  btc: number,
  price: number,
  CF: number,
  debt: number,
): number {
  return (btc * price * CF) / debt;
}

/** The Spoke's liquidation bonus as a multiplier, at a health factor up to 1. */
function liquidationBonusAt(
  curve: LiquidationBonusCurve,
  healthFactor: number,
): number {
  const healthFactorWad = BigInt(
    Math.floor(Math.max(0, healthFactor) * HEALTH_FACTOR_ONE_WAD),
  );
  return Number(computeLiquidationBonusBps(curve, healthFactorWad)) / BPS_SCALE;
}

/**
 * The group when BTC is already below its trigger: what the Spoke does at the
 * market price. Each call seizes one whole head vault and needs health factor
 * below 1. The vault repays its value less the liquidation bonus, capped at the
 * debt; any surplus is the fairness payment to the borrower. Debt left when the
 * last vault goes is written off.
 *
 * The bonus is read at the health factor before each call, as the Spoke does,
 * not taken from `LB`. Even a small difference matters here: it can move the
 * health factor across 1, which decides whether the next vault is seized too.
 *
 * Every vault seized here is one group. Afterwards either no vault is left or
 * the position is healthy at this price, so the next trigger is at or below it
 * and triggers stay strictly descending, which the Timeline's price scale
 * requires.
 */
function buildGappedGroup(step: CascadeStep): LiquidationGroup {
  const {
    index,
    vaults,
    debt,
    btc,
    btcPrice,
    CF,
    THF,
    bonusCurve,
    expectedHF,
  } = step;
  const pLiq = debt / (btc * CF);

  let debtLeft = debt;
  let btcLeft = btc;
  let seizedBtc = 0;
  let debtRepaid = 0;
  let fairnessPaymentUsd = 0;
  let liquidatorProfitUsd = 0;
  let i = 0;
  while (
    i < vaults.length &&
    debtLeft > MIN_DEBT_THRESHOLD &&
    healthFactorAt(btcLeft, btcPrice, CF, debtLeft) < 1
  ) {
    const bonus = liquidationBonusAt(
      bonusCurve,
      healthFactorAt(btcLeft, btcPrice, CF, debtLeft),
    );
    const vaultValueUsd = vaults[i].btc * btcPrice;
    const coverableDebt = vaultValueUsd / bonus;
    const repaid = Math.min(debtLeft, coverableDebt);
    debtRepaid += repaid;
    fairnessPaymentUsd += coverableDebt - repaid;
    liquidatorProfitUsd += vaultValueUsd - coverableDebt;
    debtLeft -= repaid;
    btcLeft -= vaults[i].btc;
    seizedBtc += vaults[i].btc;
    i++;
  }

  const isGroupFull = i >= vaults.length;
  // The target is what the position needed. The Spoke has no target of its
  // own, so this only splits the seizure: never above it, and capped at the
  // expected health factor so it joins up with the path group at the trigger.
  const targetHealthFactor = Math.min(
    healthFactorAt(btc, btcPrice, CF, debt),
    expectedHF,
  );
  const targetSeizureBtc = Math.min(
    seizedBtc,
    btc *
      computeSeizedFraction(
        CF,
        liquidationBonusAt(bonusCurve, targetHealthFactor),
        THF,
        targetHealthFactor,
      ),
  );
  const overSeizureBtc = seizedBtc - targetSeizureBtc;
  // The over-seized BTC's share of the repayment. When the debt clears first the
  // card shows the fairness payment instead of this figure.
  const fairnessDebtRepay =
    seizedBtc > 0 ? debtRepaid * (overSeizureBtc / seizedBtc) : 0;

  return {
    index,
    vaults: vaults.slice(0, i),
    combinedBtc: seizedBtc,
    liquidationPrice: pLiq,
    executionPrice: btcPrice,
    distancePct: distanceToTriggerPct(pLiq, btcPrice),
    targetSeizureBtc,
    overSeizureBtc,
    isFullLiquidation: isGroupFull,
    debtToRepay: debtRepaid - fairnessDebtRepay,
    liquidatorProfitUsd,
    debtRepaid,
    fairnessDebtRepay,
    fairnessPaymentUsd,
    debtRemainingAfter: isGroupFull ? 0 : Math.max(0, debtLeft),
    btcRemainingAfter: Math.max(0, btc - seizedBtc),
  };
}

/**
 * The same cascade read at another price. Only the distances change: every
 * event stays priced as `calculate()` priced it, so a simulated fall through a
 * trigger reads as a gradual one, not as a gap to the simulated price.
 */
export function withDistancesAt(
  result: CalculatorResult,
  price: number,
): CalculatorResult {
  return {
    ...result,
    groups: result.groups.map((group) => ({
      ...group,
      distancePct: distanceToTriggerPct(group.liquidationPrice, price),
    })),
  };
}

/**
 * Compute the partial-liquidation cascade and position warnings.
 *
 * Liquidation follows the current on-chain vault order, so the group breakdown
 * is computed against that order. Separately, the optimizer is run and — when
 * it finds a strictly better order — `optimalVaultOrder` is returned so the
 * banner can offer a manual "Apply Optimal Order" action.
 *
 * Groups assume the price reaches each trigger gradually. A trigger already
 * above `btcPrice` can no longer execute there, so that group is priced at
 * `btcPrice` instead; the later groups then start from what that leaves. The
 * optimal order describes the vault order rather than this moment's price, so
 * it reads the gradual first group at every price. The advice shown beside the
 * events does not: below a trigger on a position with several vaults there is no
 * reorder advice, and the cliff warning follows the event that happens next.
 *
 * Warnings: `weird-params` (invalid protocol params, soft — suppresses all
 * other advisories), `too-many-vaults` (optimizer fell back past its cap),
 * `urgent` (already liquidatable or within 5%), `cliff` (all vaults consolidate
 * into one liquidation group — partial liquidation impossible), `reorder` (a
 * safer order exists), or `dust` (returned together with any `urgent` warning;
 * suppresses the other advisories).
 */
export function calculate(params: CalculatorParams): CalculatorResult {
  const {
    btcPrice,
    totalDebtUsd,
    vaults,
    CF,
    THF,
    LB,
    bonusCurve,
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

  // Small positions suppress advice, but use the same liquidation calculation.
  const isDust =
    totalDebtUsd < DUST_THRESHOLD_USD || collateralValue < DUST_THRESHOLD_USD;

  // ── 2. Protocol math ───────────────────────────────────────────

  const { seizedFraction, seizedFractionRaw } = computeSeizedFractionDetailed(
    CF,
    LB,
    THF,
    expectedHF,
  );
  const targetSeizureBtc = totalBtc * seizedFraction;
  const liqPenalty = LB * CF;
  const stepParams = {
    btcPrice,
    seizedFraction,
    CF,
    THF,
    LB,
    bonusCurve,
    expectedHF,
  };
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
    const step: CascadeStep = {
      ...stepParams,
      index: groupIndex,
      vaults: remainingVaults,
      debt: remainingDebt,
      btc: remainingBtc,
    };
    const group =
      healthFactorAt(remainingBtc, btcPrice, CF, remainingDebt) < 1
        ? buildGappedGroup(step)
        : buildPathGroup(step);
    groups.push(group);

    remainingVaults = remainingVaults.slice(group.vaults.length);
    remainingDebt = group.debtRemainingAfter;
    remainingBtc = group.btcRemainingAfter;
    groupIndex++;
  }

  const firstGroup = groups[0];
  // The optimal order ends in a transaction: the reorder guard re-runs this
  // calculator at signing time and compares it. It reads this group rather than
  // `firstGroup`, so a price below the trigger can't change it.
  const firstPathGroup =
    firstGroup != null
      ? buildPathGroup({
          ...stepParams,
          index: firstGroup.index,
          vaults,
          debt: totalDebtUsd,
          btc: totalBtc,
        })
      : undefined;
  const isCliff =
    firstPathGroup != null &&
    firstPathGroup.vaults.length === nVaults &&
    nVaults > 1;

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

  // ── 5. Warnings: urgent ────────────────────────────────────────

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

  // Small positions skip order, cliff and reorder advice.
  if (isDust) {
    return {
      groups,
      currentHF,
      collateralValue,
      targetSeizureBtc,
      warnings: [
        {
          type: "dust",
          title: COPY.liquidationWarnings.dust.title,
          detail: COPY.liquidationWarnings.dust.detail,
        },
        ...warnings,
      ],
      optimalVaultOrder: null,
      suggestedNewVaultBtc: null,
    };
  }

  // ── 6. Optimal-order analysis (manual "Apply Optimal Order") ──
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
  const currentGroup1Btc = firstPathGroup?.combinedBtc ?? Infinity;
  const group1ReorderWouldHelp =
    reorderWouldHelp && currentGroup1Btc > optimalG1Btc + REORDER_TOL;

  // Don't suggest a reorder that would newly introduce an over-seizure
  // condition (Group 1 loses more in excess than it protects) that the current
  // order doesn't already have — a reorder should never make the position
  // worse. Cliff cases are exempt: for a cliff, reordering is always an
  // improvement even if the result over-seizes.
  if (reorderWouldHelp && nVaults >= 2 && !isCliff) {
    const currentOverSeizure = firstPathGroup
      ? firstPathGroup.overSeizureBtc
      : 0;
    const currentProtected = firstPathGroup
      ? firstPathGroup.btcRemainingAfter
      : 0;
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

  // ── 7. Warnings: too-many-vaults ───────────────────────────────

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

  // ── 8. Warnings: cliff / reorder ───────────────────────────────

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
  // The add before the minimum peg-in is applied, and the amount a second
  // BTCVault would actually have to be. Both are kept so the two reasons a
  // suggestion can be missing stay distinguishable, and so the advice quotes
  // the real requirement rather than one of its two inputs.
  let unflooredSuggestionBtc = 0;
  let requiredNewVaultBtc = 0;
  if (nVaults === 1) {
    if (seizedFraction < 1) {
      unflooredSuggestionBtc =
        (vaults[0].btc * seizedFraction) / (1 - seizedFraction);
      requiredNewVaultBtc = sizeSuggestedVaultBtc(
        unflooredSuggestionBtc,
        minSuggestedVaultBtc,
      );
      // Actionable only if positive AND strictly smaller than the existing
      // vault, which becomes the protected one.
      if (requiredNewVaultBtc > 0 && requiredNewVaultBtc < totalBtc) {
        suggestedNewVaultBtc = requiredNewVaultBtc;
      }
    }

    // Two different reasons produce no suggestion, and they call for
    // different advice. If the add would have been smaller than the existing
    // vault before it was rounded up and floored at the minimum peg-in, then
    // splitting works fine at these parameters and the position is simply too
    // small. Otherwise the sacrificial vault would have to be the larger of
    // the two, which no deposit size fixes.
    //
    // The amount quoted is the requirement itself, not the minimum peg-in:
    // either the floor or the round-up can be what lifts it to the vault's
    // size, and quoting the minimum would claim a figure that is smaller than
    // the vault — or zero, when the minimum could not be read.
    const isTooSmallToSplit =
      requiredNewVaultBtc > 0 &&
      unflooredSuggestionBtc > 0 &&
      unflooredSuggestionBtc < totalBtc;

    warnings.push({
      type: "cliff",
      title: cliff.title,
      detail: cliff.body,
      suggestion:
        suggestedNewVaultBtc !== null
          ? cliff.addSacrificialSuggestion(
              fmtSuggestedVaultBtc(suggestedNewVaultBtc),
            )
          : isTooSmallToSplit
            ? cliff.tooSmallToSplitSuggestion(
                fmtSuggestedVaultBtc(requiredNewVaultBtc),
              )
            : cliff.noSplitSuggestion,
    });
  }

  // Several vaults with the first event already below its trigger. It is the
  // walk that happens next, so the warning reads that rather than the path
  // group, and it must not contradict the event shown beside it. No reorder
  // advice: the contract would refuse it. `optimalVaultOrder` stays set all the
  // same, for the guard that re-runs this calculator.
  else if (isFirstEventGapped(groups)) {
    if (firstGroup?.vaults.length === nVaults) {
      warnings.push({
        type: "cliff",
        title: cliff.title,
        detail: cliff.body,
        suggestion: cliff.gappedSuggestion(nVaults),
      });
    }
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

  // ── 9. Return ──────────────────────────────────────────────────

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
