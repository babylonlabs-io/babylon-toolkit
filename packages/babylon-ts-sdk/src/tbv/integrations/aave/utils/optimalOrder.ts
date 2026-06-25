/**
 * Optimal Vault Ordering for Liquidation Protection
 *
 * Finds the vault ordering that maximizes collateral surviving a multi-group
 * liquidation cascade.
 *
 * The optimizer is a bitmask DP over seized subsets. 2^n memory and 3^n work
 * blow up past `MAX_DP_N` vaults, so for larger sets the optimizer falls back to
 * a largest-first heuristic — the suggested order is then no longer guaranteed
 * optimal, and `calculate()` surfaces a `too-many-vaults` warning to say so.
 */

import {
  simulateCascade,
  type CascadeVault,
} from "./cascadeSimulation.js";

/**
 * Hard cap on vault count for the bitmask DP optimizer. 2^n memory + 3^n work
 * blow up past this. For n > MAX_DP_N the optimizer falls back to a
 * largest-first heuristic. Benchmark: n=18 ≈ 720ms, n=20 ≈ 5.8s — anything past
 * n=17 is too slow for interactive UI, so we cap here.
 */
export const MAX_DP_N = 17;

/**
 * Main optimizer: bitmask DP over seized subsets.
 *
 * State: T = bitmask of vaults that have already been seized.
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
  const n = vaults.length;
  if (n === 0) return { order: [], sumBtcAfterEvents: 0, btcAfterG1: 0 };
  if (n === 1) {
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

  // Safety cap: 2^n memory and 3^n work blow up past MAX_DP_N vaults. Real
  // users have far fewer — each vault is a separate peg-in with a fixed fee.
  // For the unlikely n > MAX_DP_N, fall back to a largest-first heuristic;
  // calculate() surfaces a 'too-many-vaults' warning to flag the loss of the
  // optimality guarantee.
  if (n > MAX_DP_N) {
    const order = [...vaults].sort((a, b) => b.btc - a.btc);
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
    return { order, ...sim };
  }

  const N = 1 << n;
  const totalBtc = vaults.reduce((s, v) => s + v.btc, 0);
  const coverFraction = seizedFraction * (1 - seizureTol);

  // Precompute btcOf[T] — standard bitmask sum trick in O(2^n).
  const btcOf = new Float64Array(N);
  for (let T = 1; T < N; T++) {
    const lsb = T & -T;
    const bit = 31 - Math.clz32(lsb);
    btcOf[T] = btcOf[T ^ lsb] + vaults[bit].btc;
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
    if (G === -1) break; // unreachable chain — fall back below
    const gVaults: T[] = [];
    for (let bit = 0; bit < n; bit++) {
      if (G & (1 << bit)) gVaults.push(vaults[bit]);
    }
    gVaults.sort((a, b) => b.btc - a.btc); // canonical within-group order
    groupsReversed.push(gVaults);
    T ^= G;
  }
  groupsReversed.reverse();
  const order = groupsReversed.flat();

  // Reconstruction safety: if the chain is incomplete for any reason, fall back
  // to largest-first rather than throwing.
  if (order.length !== n) {
    const fallback = [...vaults].sort((a, b) => b.btc - a.btc);
    const sim = simulateCascade(
      fallback,
      totalDebt,
      seizedFraction,
      seizureTol,
      CF,
      THF,
      maxLB,
      expectedHF,
    );
    return { order: fallback, ...sim };
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
