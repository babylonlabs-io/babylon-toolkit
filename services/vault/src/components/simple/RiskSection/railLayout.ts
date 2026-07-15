import {
  HEALTH_FACTOR_HEALTHY_THRESHOLD,
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
      return "verySafe";
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
const GRADIENT_AMBER_OFFSET = 22;
const GRADIENT_GREEN_OFFSET = 45;

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

  const toPct = (price: number) =>
    Math.min(
      100 - MARKER_EDGE_MARGIN_PCT,
      Math.max(MARKER_EDGE_MARGIN_PCT, ((price - lo) / (hi - lo)) * 100),
    );

  const currentPct = toPct(currentPriceUsd);
  const liquidationPct = hasLiquidation ? toPct(liquidationPriceUsd) : null;

  let gradient: string | null = null;
  if (liquidationPct !== null) {
    const midpoint = (liquidationPct + currentPct) / 2;
    const amber = Math.min(midpoint + GRADIENT_AMBER_OFFSET, 100);
    const green = Math.min(midpoint + GRADIENT_GREEN_OFFSET, 100);
    gradient =
      `linear-gradient(90deg, rgb(var(--risk-red)) ${midpoint}%, ` +
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
