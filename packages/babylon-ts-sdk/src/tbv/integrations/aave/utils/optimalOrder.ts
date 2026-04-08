/**
 * Optimal Vault Ordering for Liquidation Protection
 *
 * Finds the vault ordering that maximizes collateral surviving a multi-group
 * liquidation cascade. Uses exhaustive bitmask enumeration (2^n for n ≤ 20)
 * to find the minimum-BTC subset covering the target seizure for Group 1,
 * then greedy for subsequent groups.
 *
 * The iterative refinement loop re-runs the optimizer on its own output,
 * converging in ≤3 iterations in practice.
 */

import { simulateCascade, type CascadeVault } from "./cascadeSimulation.js";

/** Convergence threshold for iterative refinement */
const EPS = 0.0001;

/** Max refinement iterations for optimizer */
const MAX_ITER = 5;

/** Max vaults for exhaustive bitmask search */
const MAX_VAULTS_FOR_EXHAUSTIVE = 20;

/**
 * Greedy sub-order: arrange remaining vaults by finding minimum BTC subset
 * covering target for each group, using exhaustive search when feasible.
 */
function greedyOrder<T extends CascadeVault>(
  vaults: T[],
  seizedFraction: number,
  seizureTol: number,
): T[] {
  const result: T[] = [];
  let remaining = [...vaults];

  while (remaining.length > 0) {
    const totalBtc = remaining.reduce((s, v) => s + v.btc, 0);
    const coverThreshold = totalBtc * seizedFraction * (1 - seizureTol);
    let optSubset: T[] = [...remaining];
    let optSum = totalBtc;
    const m = remaining.length;

    if (m <= MAX_VAULTS_FOR_EXHAUSTIVE) {
      for (let mask = 1; mask < 1 << m; mask++) {
        let sum = 0;
        const subset: T[] = [];
        for (let bit = 0; bit < m; bit++) {
          if (mask & (1 << bit)) {
            sum += remaining[bit].btc;
            subset.push(remaining[bit]);
          }
        }
        if (sum >= coverThreshold && sum < optSum) {
          optSum = sum;
          optSubset = subset;
        }
      }
    }

    const ids = new Set(optSubset.map((v) => v.id));
    result.push(...[...optSubset].sort((a, b) => b.btc - a.btc));
    remaining = remaining.filter((v) => !ids.has(v.id));
  }

  return result;
}

/**
 * Single-pass optimizer: enumerate all possible Group 1 subsets,
 * use greedy for remaining groups, pick the order that maximizes
 * collateral surviving the cascade.
 */
function computeOptimalOrderSinglePass<T extends CascadeVault>(
  vaults: T[],
  totalDebt: number,
  seizedFraction: number,
  seizureTol: number,
  CF: number,
  THF: number,
  maxLB: number,
  expectedHF: number,
): { order: T[]; sumBtcAfterEvents: number; btcAfterG1: number } {
  if (vaults.length === 0)
    return { order: [], sumBtcAfterEvents: 0, btcAfterG1: 0 };
  if (vaults.length > MAX_VAULTS_FOR_EXHAUSTIVE) {
    throw new Error(
      `Too many vaults for exhaustive search: ${vaults.length} exceeds maximum of ${MAX_VAULTS_FOR_EXHAUSTIVE}`,
    );
  }
  if (vaults.length === 1) {
    const sim = simulateCascade(
      vaults,
      totalDebt,
      seizedFraction,
      seizureTol,
      CF,
      THF,
      maxLB,
      expectedHF,
    );
    return { order: [...vaults], ...sim };
  }

  const n = vaults.length;
  const totalBtc = vaults.reduce((s, v) => s + v.btc, 0);
  const coverThreshold = totalBtc * seizedFraction * (1 - seizureTol);

  let bestOrder = [...vaults];
  let bestSum = -Infinity;
  let bestAfterG1 = -Infinity;

  for (let mask = 1; mask < 1 << n; mask++) {
    let g1Btc = 0;
    const g1: T[] = [];
    const rest: T[] = [];
    for (let bit = 0; bit < n; bit++) {
      if (mask & (1 << bit)) {
        g1Btc += vaults[bit].btc;
        g1.push(vaults[bit]);
      } else {
        rest.push(vaults[bit]);
      }
    }
    if (g1Btc < coverThreshold) continue;

    g1.sort((a, b) => b.btc - a.btc);
    const candidate = [...g1, ...greedyOrder(rest, seizedFraction, seizureTol)];
    const { sumBtcAfterEvents, btcAfterG1 } = simulateCascade(
      candidate,
      totalDebt,
      seizedFraction,
      seizureTol,
      CF,
      THF,
      maxLB,
      expectedHF,
    );

    if (
      sumBtcAfterEvents > bestSum + EPS ||
      (Math.abs(sumBtcAfterEvents - bestSum) <= EPS &&
        btcAfterG1 > bestAfterG1 + EPS)
    ) {
      bestSum = sumBtcAfterEvents;
      bestAfterG1 = btcAfterG1;
      bestOrder = candidate;
    }
  }

  return {
    order: bestOrder,
    sumBtcAfterEvents: bestSum,
    btcAfterG1: bestAfterG1,
  };
}

/**
 * Main optimizer: iterative refinement until stable.
 * Re-running with the improved order lets the next pass find better
 * G1 subsets. Converges in ≤3 iterations in practice.
 */
export function computeOptimalOrder<T extends CascadeVault>(
  vaults: T[],
  totalDebt: number,
  seizedFraction: number,
  seizureTol: number,
  CF: number,
  THF: number,
  maxLB: number,
  expectedHF: number,
): { order: T[]; sumBtcAfterEvents: number; btcAfterG1: number } {
  let result = computeOptimalOrderSinglePass(
    vaults,
    totalDebt,
    seizedFraction,
    seizureTol,
    CF,
    THF,
    maxLB,
    expectedHF,
  );

  for (let i = 0; i < MAX_ITER; i++) {
    const refined = computeOptimalOrderSinglePass(
      result.order,
      totalDebt,
      seizedFraction,
      seizureTol,
      CF,
      THF,
      maxLB,
      expectedHF,
    );
    const primaryImproves =
      refined.sumBtcAfterEvents > result.sumBtcAfterEvents + EPS;
    const primaryTied =
      Math.abs(refined.sumBtcAfterEvents - result.sumBtcAfterEvents) <= EPS;
    const tiebreakerImproves =
      primaryTied && refined.btcAfterG1 > result.btcAfterG1 + EPS;
    if (!primaryImproves && !tiebreakerImproves) {
      break;
    }
    result = refined;
  }

  return result;
}
