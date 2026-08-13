/**
 * Pure chart helpers shared by the Aave market-data charts: the borrow-APR
 * history card (C3, Figma node 10088-61052) and the interest-rate-model card
 * (C2, Figma node 10088-61091). Kept free of React so the domain/tick/date
 * math is testable without rendering `LineChart`.
 */

import type { ChartAxisTick } from "@babylonlabs-io/core-ui";

import type { IrmCurvePoint } from "@/applications/aave/clients/aaveIrm";
import type { BorrowRateHistoryPoint } from "@/clients/indexer/aaveHistoryClient";
import { formatAprPercent } from "@/utils/formatting";

/** Headroom added to a non-flat domain, as a fraction of its span. */
const RATE_DOMAIN_PAD_FRACTION = 0.05;

/**
 * Minimum band half-width (in APR percent) for a flat series, so an
 * exactly-zero rate still gets a visible, non-degenerate y domain.
 */
const FLAT_SERIES_MIN_BAND_PERCENT = 0.1;

/**
 * Explicit fitted domain for C3 so app-computed ticks always match: [min,max]
 * padded 5% of span; flat series padded to a visible band. Never zero-based
 * for a series clear of zero — but a borrow rate can never be negative, so
 * the lower bound is clamped at 0 rather than let a low/flat series pad into
 * negative territory (which also collapses distinct low ticks onto the same
 * "0%" label, since `formatAprPercent` treats every non-positive input as 0).
 */
export function fittedRateDomain(
  points: BorrowRateHistoryPoint[],
): [number, number] {
  if (points.length === 0) {
    throw new Error("fittedRateDomain requires at least one point");
  }

  const rates = points.map((p) => p.ratePercent);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const span = max - min;

  const padding =
    span > 0
      ? span * RATE_DOMAIN_PAD_FRACTION
      : Math.max(min * RATE_DOMAIN_PAD_FRACTION, FLAT_SERIES_MIN_BAND_PERCENT);

  return [Math.max(0, min - padding), max + padding];
}

/** `count` evenly spaced ticks across a domain, labels via formatAprPercent. */
export function rateTicks(
  domain: [number, number],
  count: number,
): ChartAxisTick[] {
  const [lo, hi] = domain;
  if (count <= 1) {
    return [{ value: lo, label: formatAprPercent(lo) }];
  }

  const step = (hi - lo) / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const value = lo + i * step;
    return { value, label: formatAprPercent(value) };
  });
}

/**
 * Y-axis domain and ticks for the IRM chart: the top is the on-chain max
 * rounded UP to a multiple of `count - 1`, so every tick is a distinct whole
 * percent and the highest gridline never lands outside the domain (D4 — the
 * axis tops at the on-chain max, never a hardcoded figure).
 */
export function percentAxis(
  maxAprPercent: number,
  count: number,
): { domain: [number, number]; ticks: ChartAxisTick[] } {
  if (count <= 1) {
    return {
      domain: [0, maxAprPercent],
      ticks: [{ value: 0, label: "0%" }],
    };
  }

  const steps = count - 1;
  const top = Math.ceil(maxAprPercent / steps) * steps;
  const ticks = Array.from({ length: count }, (_, i) => {
    const value = (top * i) / steps;
    return { value, label: `${value}%` };
  });
  return { domain: [0, top], ticks };
}

/**
 * Borrow APR at `utilizationPercent`, linearly interpolated between the two
 * neighboring samples (exact for the on-chain piecewise-linear strategy,
 * whose kink is always an exact sample). Clamped to the curve's ends.
 */
export function aprAtUtilization(
  curve: IrmCurvePoint[],
  utilizationPercent: number,
): number {
  if (curve.length === 0) {
    throw new Error("aprAtUtilization requires a non-empty curve");
  }
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (utilizationPercent <= first.utilizationPercent) return first.aprPercent;
  if (utilizationPercent >= last.utilizationPercent) return last.aprPercent;
  for (let i = 1; i < curve.length; i++) {
    const b = curve[i];
    if (utilizationPercent > b.utilizationPercent) continue;
    const a = curve[i - 1];
    const span = b.utilizationPercent - a.utilizationPercent;
    if (span === 0) return b.aprPercent;
    const t = (utilizationPercent - a.utilizationPercent) / span;
    return a.aprPercent + t * (b.aprPercent - a.aprPercent);
  }
  return last.aprPercent;
}

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/**
 * True when any adjacent samples sit less than a day apart — a date-only
 * tooltip would render identical labels for neighboring points, so the
 * tooltip must show the time. Spacing-driven rather than range-driven: the
 * indexer's `resolution=auto` decides the bucket size, not the range button.
 */
export function hasSubDailySpacing(points: BorrowRateHistoryPoint[]): boolean {
  return points.some(
    (point, i) => i > 0 && point.timeMs - points[i - 1].timeMs < MS_PER_DAY,
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Tooltip date: sub-daily buckets → "Jul 4, 14:00"; daily+ → "Jul 4, 2026". */
export function historyTooltipDate(timeMs: number, withTime: boolean): string {
  const date = new Date(timeMs);
  const monthDay = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  if (withTime) {
    return `${monthDay}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  return `${monthDay}, ${date.getFullYear()}`;
}
