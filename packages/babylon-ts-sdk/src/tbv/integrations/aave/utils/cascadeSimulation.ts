/**
 * Cascade Liquidation Simulation
 *
 * Simulates multi-group liquidation cascades for Aave positions backed by
 * indivisible BTC vaults (UTXOs). Each liquidation event seizes a prefix of
 * vaults until the target seizure is covered, then debt is reduced and the
 * cascade continues with remaining vaults.
 *
 * Used by the optimizer to score different vault orderings by how much
 * collateral survives the cascade.
 */

/**
 * Minimal vault shape for cascade simulation.
 * UI layers extend this with display fields (e.g. `name`).
 */
export interface CascadeVault {
  id: string;
  btc: number;
}

/** 1% tolerance for prefix walk coverage — avoids cliff flip at boundary */
export const SEIZURE_TOL = 0.01;

/** Circuit breaker for group cascade loop */
const MAX_GROUPS = 20;

/** Minimum debt threshold to continue cascade (avoids infinite loop on dust) */
const MIN_DEBT_THRESHOLD = 0.01;

/**
 * Prefix walk: consume vaults front-to-back until target seizure is covered.
 * Returns the vaults in the first liquidation group.
 */
export function getGroup1FromOrder<T extends CascadeVault>(
  order: T[],
  seizedFraction: number,
  seizureTol: number,
): T[] {
  if (order.length === 0) return [];
  const totalBtc = order.reduce((s, v) => s + v.btc, 0);
  const coverThreshold = totalBtc * seizedFraction * (1 - seizureTol);
  let prefixSum = 0;
  let i = 0;
  while (i < order.length && prefixSum < coverThreshold) {
    prefixSum += order[i].btc;
    i++;
  }
  return order.slice(0, i);
}

/**
 * Simulate one liquidation group, returning updated debt and remaining BTC.
 * Handles both safe (non-last) and full (last) liquidation paths.
 */
function simulateOneGroup(
  seizedBtc: number,
  totalBtc: number,
  debt: number,
  isLastGroup: boolean,
  seizedFraction: number,
  CF: number,
  THF: number,
  maxLB: number,
  expectedHF: number,
): { debtAfter: number; btcAfter: number } {
  const liqPenalty = maxLB * CF;
  const pLiq = debt / (totalBtc * CF);
  const targetSeizure = totalBtc * seizedFraction;
  const overSeizureBtc = Math.max(0, seizedBtc - targetSeizure);
  const denominator = THF - liqPenalty;
  const debtToRepay =
    denominator === 0 ? debt : debt * ((THF - expectedHF) / denominator);

  let debtAfter: number;
  if (isLastGroup) {
    debtAfter = 0;
  } else {
    const overSeizureVal = (overSeizureBtc * pLiq) / maxLB;
    const fairnessDebtRepay = Math.min(overSeizureVal, debt - debtToRepay);
    debtAfter = Math.max(0, debt - debtToRepay - fairnessDebtRepay);
  }
  return { debtAfter, btcAfter: Math.max(0, totalBtc - seizedBtc) };
}

/**
 * Simulate full liquidation cascade with debt model.
 *
 * PRIMARY score:  sumBtcAfterEvents — sum of BTC remaining after every event.
 *                 Captures how much collateral survives at each stage.
 * TIEBREAKER:     btcAfterG1 — BTC remaining after the first (most likely) event.
 */
export function simulateCascade<T extends CascadeVault>(
  order: T[],
  totalDebt: number,
  seizedFraction: number,
  seizureTol: number,
  CF: number,
  THF: number,
  maxLB: number,
  expectedHF: number,
): { sumBtcAfterEvents: number; btcAfterG1: number } {
  let remaining = [...order];
  let debt = totalDebt;
  const initialTotalBtc = order.reduce((s, v) => s + v.btc, 0);
  let btcAfterG1 = -1;
  let sumBtcAfterEvents = 0;
  let groupCount = 0;

  while (
    remaining.length > 0 &&
    debt > MIN_DEBT_THRESHOLD &&
    groupCount < MAX_GROUPS
  ) {
    const totalBtc = remaining.reduce((s, v) => s + v.btc, 0);
    const coverThreshold = totalBtc * seizedFraction * (1 - seizureTol);
    let prefixSum = 0;
    let i = 0;
    while (i < remaining.length && prefixSum < coverThreshold) {
      prefixSum += remaining[i].btc;
      i++;
    }
    const isLastGroup = i >= remaining.length;
    const { debtAfter } = simulateOneGroup(
      prefixSum,
      totalBtc,
      debt,
      isLastGroup,
      seizedFraction,
      CF,
      THF,
      maxLB,
      expectedHF,
    );
    remaining = remaining.slice(i);
    debt = debtAfter;
    const btcNow = remaining.reduce((s, v) => s + v.btc, 0);
    sumBtcAfterEvents += btcNow;
    if (btcAfterG1 < 0) btcAfterG1 = btcNow;
    groupCount++;
  }

  return {
    sumBtcAfterEvents,
    btcAfterG1:
      btcAfterG1 < 0 ? initialTotalBtc : btcAfterG1,
  };
}
