/**
 * Optimal Vault Ordering for Liquidation Protection
 *
 * Finds the vault ordering that maximizes collateral surviving a multi-group
 * liquidation cascade.
 *
 * The optimizer is a bitmask DP over seized subsets. To keep 2^n memory and
 * 3^n work bounded, vault sets larger than MAX_DP_N are first compressed into
 * pre-joint groups (the smallest vaults merged together), so the DP always runs
 * on ≤ MAX_DP_N states and never throws regardless of vault count.
 */

import {
  simulateCascade,
  type CascadeVault,
  type PreJointVaults,
} from "./cascadeSimulation.js";

/**
 * Hard cap on the number of states for the bitmask DP optimizer.
 * 2^n memory + 3^n work blow up past this, so larger vault sets are first
 * compressed into pre-joint groups by merging the smallest vaults together.
 */
export const MAX_DP_N = 10;

/**
 * Reduce a vault list to at most `maxSize` pre-joint groups for DP optimization.
 *
 * Starts with one group per vault, then repeatedly merges the two smallest
 * groups until the group count fits the DP cap. Groups are kept sorted by
 * descending BTC sum, and vaults inside each group are sorted by descending BTC
 * before returning.
 */
function groupByPreJoints<T extends CascadeVault>(
  vaults: T[],
  maxSize: number,
): PreJointVaults<T>[] {
  const preJoints: PreJointVaults<T>[] = vaults.map((v) => ({
    vaults: [v],
    sum: v.btc,
  }));

  preJoints.sort((a, b) => b.sum - a.sum);

  while (preJoints.length > maxSize) {
    const first = preJoints.pop()!;
    const second = preJoints.pop()!;
    const combined: PreJointVaults<T> = {
      vaults: [...first.vaults, ...second.vaults],
      sum: first.sum + second.sum,
    };

    let inserted = false;
    for (let i = 0; i < preJoints.length; i++) {
      if (combined.sum > preJoints[i].sum) {
        preJoints.splice(i, 0, combined);
        inserted = true;
        break;
      }
    }
    if (!inserted) preJoints.push(combined);
  }

  for (const pj of preJoints) {
    pj.vaults.sort((a, b) => b.btc - a.btc);
  }

  return preJoints;
}

/**
 * Main optimizer: bitmask DP over seized subsets.
 *
 * State: T = bitmask of pre-joint groups that have already been seized.
 * Transition: for each valid "last group" G ⊆ T, dp[T] = dp[T\G] + btcAfter
 *   where btcAfter = totalBtc − btcOf(T)   (BTC remaining after T is seized).
 * Validation: btcOf(G) must cover target seizure at the moment G fires, i.e.
 *   btcOf(G) ≥ (totalBtc − btcOf(T\G)) × seizedFraction × (1 − seizureTol).
 *
 * Complexity: O(3^n) — the subset-of-subset enumeration visits exactly
 * Σ C(n,k) × 2^k = 3^n state-transition pairs. Single pass, no refinement loop.
 *
 * Objective: maximize sumBtcAfterEvents assuming all events fire. Debt is not
 * part of the DP state — it is used only when computing final metrics via
 * simulateCascade() on the reconstructed order.
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
  if (vaults.length === 0)
    return { order: [], sumBtcAfterEvents: 0, btcAfterG1: 0 };
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

  const preJoints = groupByPreJoints(vaults, MAX_DP_N);
  const n = preJoints.length;

  const N = 1 << n;
  const totalBtc = preJoints.reduce((s, v) => s + v.sum, 0);
  const coverFraction = seizedFraction * (1 - seizureTol);

  // Precompute btcOf[T] — standard bitmask sum trick in O(2^n).
  const btcOf = new Float64Array(N);
  for (let T = 1; T < N; T++) {
    const lsb = T & -T;
    const bit = 31 - Math.clz32(lsb);
    btcOf[T] = btcOf[T ^ lsb] + preJoints[bit].sum;
  }

  // dpSum[T] = best sumBtcAfterEvents to reach state T (T = seized subset).
  // dpG1[T]  = among the paths achieving dpSum[T], the largest BTC remaining
  //            after the FIRST event — the tiebreaker, so a tie on total
  //            cascade survival prefers the order that survives the first
  //            (most likely) liquidation event best. Matches what calculate()
  //            uses to decide whether a reorder is worth suggesting.
  // prev[T]  = the "last group" G chosen when reaching T (for reconstruction).
  const dpSum = new Float64Array(N);
  const dpG1 = new Float64Array(N);
  const prev = new Int32Array(N);
  dpSum.fill(-Infinity);
  prev.fill(-1);
  dpSum[0] = 0;
  // dpG1[0] is never read: when Tprev === 0 the first event is scored directly.

  const EPS = 1e-9;

  for (let T = 1; T < N; T++) {
    const btcAfter = totalBtc - btcOf[T]; // BTC remaining after the last group brings us to state T
    let bestSum = -Infinity;
    let bestG1 = -Infinity;
    let bestG = -1;

    // Enumerate non-empty subsets G ⊆ T. Across all T this visits exactly 3^n pairs.
    for (let G = T; G > 0; G = (G - 1) & T) {
      const Tprev = T ^ G;
      const prevSum = dpSum[Tprev];
      if (prevSum === -Infinity) continue;

      // Validate: G covers target seizure when fired from state Tprev.
      const remainingBeforeG = totalBtc - btcOf[Tprev];
      if (btcOf[G] < remainingBeforeG * coverFraction) continue;

      const candSum = prevSum + btcAfter;
      // First-event remainder along this path: if Tprev is empty, G itself is
      // the first event; otherwise it was fixed earlier in the subpath.
      const candG1 = Tprev === 0 ? totalBtc - btcOf[G] : dpG1[Tprev];

      if (
        candSum > bestSum + EPS ||
        (Math.abs(candSum - bestSum) <= EPS && candG1 > bestG1 + EPS)
      ) {
        bestSum = candSum;
        bestG1 = candG1;
        bestG = G;
      }
    }

    dpSum[T] = bestSum;
    dpG1[T] = bestG1;
    prev[T] = bestG;
  }

  // Reconstruct firing order by walking prev[] from fullMask back to 0.
  const fullMask = N - 1;
  const groupsReversed: T[][] = [];
  for (let T = fullMask; T > 0; ) {
    const G = prev[T];
    if (G === -1) break; // unreachable chain; length assertion below will fail
    const gVaults: T[] = [];
    for (let bit = 0; bit < n; bit++) {
      if (G & (1 << bit)) gVaults.push(...preJoints[bit].vaults);
    }
    gVaults.sort((a, b) => b.btc - a.btc); // canonical within-group order
    groupsReversed.push(gVaults);
    T ^= G;
  }
  groupsReversed.reverse();
  const order = groupsReversed.flat();

  if (order.length !== vaults.length) {
    throw new Error(
      `DP reconstruction failed — expected ${vaults.length} vaults in order, got ${order.length}.`,
    );
  }

  // Compute real metrics via cascade simulation (debt-aware, matches what
  // calculate() produces for the group breakdown shown in the UI).
  const sim = simulateCascade(
    order,
    totalDebt,
    seizedFraction,
    seizureTol,
    CF,
    THF,
    maxLB,
    expectedHF,
  );
  return {
    order,
    sumBtcAfterEvents: sim.sumBtcAfterEvents,
    btcAfterG1: sim.btcAfterG1,
  };
}
