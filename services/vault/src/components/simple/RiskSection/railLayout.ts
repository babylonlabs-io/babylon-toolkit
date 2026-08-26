import {
  HEALTH_FACTOR_HEALTHY_THRESHOLD,
  HEALTH_FACTOR_WARNING_THRESHOLD,
  type HealthFactorStatus,
} from "@/applications/aave/utils";

export type RiskDisplayState =
  | "noPosition"
  | "verySafe"
  | "safe"
  | "moderate"
  | "liquidatable";

export function getRiskDisplayState(
  status: HealthFactorStatus,
  healthFactor: number | null,
  hasPosition: boolean,
): RiskDisplayState {
  if (!hasPosition) return "noPosition";
  switch (status) {
    case "no_debt":
      return "noPosition";
    case "safe":
      return healthFactor === null ||
        !isFinite(healthFactor) ||
        healthFactor > HEALTH_FACTOR_HEALTHY_THRESHOLD
        ? "verySafe"
        : "safe";
    case "warning":
      return "moderate";
    case "danger":
      return "liquidatable";
  }
}

export interface RailLayout {
  lo: number;
  hi: number;
  ticks: number[];
  currentPct: number | null;
  liquidationPct: number | null;
  gradient: string | null;
}

const MARKER_EDGE_MARGIN_PCT = 1.5;
const MAX_TICKS = 8;
// On this axis the health factor is price / liquidationPrice, so red sits at
// the liquidation price and green at the price clearing the safe threshold.
// Far from liquidation that ramp collapses to a hairline, hence the minimum —
// which trades truthfulness for legibility: once it engages the stops no longer
// mark the HF bands. At HF 9 ($63,488 / $6,962) the honest green stop is 5.3%
// but lands at 45.3%, so ~40pp of rail reads amber for comfortably safe prices.
// The marker keeps its own colour (from `state`), so it still reads green.
const GRADIENT_MIN_RAMP_PCT = 45;

function isUsablePrice(price: number | null): price is number {
  return price !== null && isFinite(price) && price > 0;
}

function computeTicks(lo: number, hi: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [];

  const candidates = [1, 2, 5];
  let step = 1;
  outer: for (let exp = -2; exp <= 12; exp++) {
    const base = 10 ** exp;
    for (const c of candidates) {
      const s = c * base;
      if (span / s <= MAX_TICKS) {
        step = s;
        break outer;
      }
    }
  }

  const ticks: number[] = [];
  const start = Math.ceil(lo / step) * step;
  for (let v = start; v <= hi + step * 1e-6; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

export function computeRailLayout(
  currentPriceUsd: number | null,
  liquidationPriceUsd: number | null,
): RailLayout {
  if (!isUsablePrice(currentPriceUsd)) {
    return {
      lo: 0,
      hi: 0,
      ticks: [],
      currentPct: null,
      liquidationPct: null,
      gradient: null,
    };
  }

  const hasLiquidation = isUsablePrice(liquidationPriceUsd);

  let lo = currentPriceUsd * 0.8;
  let hi = currentPriceUsd * 1.2;
  if (hasLiquidation) {
    lo = Math.min(lo, liquidationPriceUsd * 0.97);
    hi = Math.max(hi, liquidationPriceUsd * 1.03);
  }

  const ticks = computeTicks(lo, hi);

  const pct = (price: number) => ((price - lo) / (hi - lo)) * 100;
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  const toPct = (price: number) =>
    clamp(pct(price), MARKER_EDGE_MARGIN_PCT, 100 - MARKER_EDGE_MARGIN_PCT);

  const currentPct = toPct(currentPriceUsd);
  const liquidationPct = hasLiquidation ? toPct(liquidationPriceUsd) : null;

  // Both stops are derived from the liquidation price, so the red one always
  // lands exactly on the liquidation marker. That deliberately keeps the rail
  // internally consistent rather than agreeing with the health factor labelling
  // the card: the label reads on-chain `accountData.healthFactor` while this
  // price comes from the cascade (indexed vault rows + the BTC feed). When
  // those sources diverge the bands can drift from the label by that much —
  // anchoring the stops on the label instead would move the red stop off the
  // marker, which is the more visible of the two errors.
  let gradient: string | null = null;
  if (hasLiquidation) {
    const stopPct = (price: number) => clamp(pct(price), 0, 100);
    const red = stopPct(liquidationPriceUsd);
    const green = Math.max(
      stopPct(liquidationPriceUsd * HEALTH_FACTOR_WARNING_THRESHOLD),
      Math.min(100, red + GRADIENT_MIN_RAMP_PCT),
    );
    const amber = (red + green) / 2;
    gradient =
      `linear-gradient(90deg, rgb(var(--risk-red)) ${red}%, ` +
      `rgb(var(--risk-amber)) ${amber}%, rgb(var(--risk-green)) ${green}%)`;
  }

  return { lo, hi, ticks, currentPct, liquidationPct, gradient };
}

export function spreadLabelCenters(
  currentPct: number,
  liquidationPct: number,
  widthPx: number,
  labelWidthPx: number,
): { current: number; liquidation: number } {
  const half = labelWidthPx / 2;
  const currentPx = (currentPct / 100) * widthPx;
  const liquidationPx = (liquidationPct / 100) * widthPx;

  const currentIsLeft = currentPx <= liquidationPx;
  let left = currentIsLeft ? currentPx : liquidationPx;
  let right = currentIsLeft ? liquidationPx : currentPx;

  if (right - left < labelWidthPx) {
    const mid = (left + right) / 2;
    left = mid - half;
    right = mid + half;
  }

  const min = half;
  const max = widthPx - half;
  if (left < min) {
    const shift = min - left;
    left += shift;
    right += shift;
  }
  if (right > max) {
    const shift = right - max;
    left -= shift;
    right -= shift;
  }
  left = Math.max(min, left);
  right = Math.min(max, right);

  return currentIsLeft
    ? { current: left, liquidation: right }
    : { current: right, liquidation: left };
}
