import {
  HEALTH_FACTOR_COLORS,
  type HealthFactorStatus,
} from "@/applications/aave/utils";
import { COPY } from "@/copy";

export const STATUS_LABELS: Record<
  Exclude<HealthFactorStatus, "no_debt">,
  string
> = {
  safe: COPY.overview.healthFactorHealthy,
  warning: COPY.overview.healthFactorAtRisk,
  danger: COPY.overview.healthFactorLiquidatable,
} satisfies Record<string, string>;

/** Maximum health factor value displayed on the gauge (HF >= this maps to 100%). */
export const MAX_DISPLAY_HF = 3;

/** Half-width of the indicator circle in px, used to clamp within the track. */
export const INDICATOR_RADIUS_PX = 8;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// Gradient color stops derived from HEALTH_FACTOR_COLORS: red (0%) → amber (50%) → green (100%)
const GRADIENT_STOPS: [number, number, number][] = [
  hexToRgb(HEALTH_FACTOR_COLORS.RED),
  hexToRgb(HEALTH_FACTOR_COLORS.AMBER),
  hexToRgb(HEALTH_FACTOR_COLORS.GREEN),
];

/** Gradient stop positions (0–1) matching the design's gauge track:
 * solid red below 25%, red→amber 25–50%, amber→green 50–75%, solid green
 * above 75%. */
const GRADIENT_STOP_RED = 0.25;
const GRADIENT_STOP_AMBER = 0.5;
const GRADIENT_STOP_GREEN = 0.75;

/** CSS gradient painted on the gauge track. Its stops mirror
 * `getGradientColorAt` so the ring indicator color lines up with the bar
 * directly beneath it. */
export const GAUGE_TRACK_GRADIENT = `linear-gradient(90deg, ${HEALTH_FACTOR_COLORS.RED} ${GRADIENT_STOP_RED * 100}%, ${HEALTH_FACTOR_COLORS.AMBER} ${GRADIENT_STOP_AMBER * 100}%, ${HEALTH_FACTOR_COLORS.GREEN} ${GRADIENT_STOP_GREEN * 100}%)`;

function rgbString([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Interpolate the gradient color at a given 0–100 percentage.
 * Matches the CSS {@link GAUGE_TRACK_GRADIENT}.
 */
export function getGradientColorAt(percent: number): string {
  const t = Math.min(1, Math.max(0, percent / 100));
  if (t <= GRADIENT_STOP_RED) return rgbString(GRADIENT_STOPS[0]);
  if (t >= GRADIENT_STOP_GREEN) return rgbString(GRADIENT_STOPS[2]);
  let segmentT: number;
  let from: [number, number, number];
  let to: [number, number, number];
  if (t <= GRADIENT_STOP_AMBER) {
    segmentT =
      (t - GRADIENT_STOP_RED) / (GRADIENT_STOP_AMBER - GRADIENT_STOP_RED);
    from = GRADIENT_STOPS[0];
    to = GRADIENT_STOPS[1];
  } else {
    segmentT =
      (t - GRADIENT_STOP_AMBER) / (GRADIENT_STOP_GREEN - GRADIENT_STOP_AMBER);
    from = GRADIENT_STOPS[1];
    to = GRADIENT_STOPS[2];
  }
  const r = Math.round(from[0] + (to[0] - from[0]) * segmentT);
  const g = Math.round(from[1] + (to[1] - from[1]) * segmentT);
  const b = Math.round(from[2] + (to[2] - from[2]) * segmentT);
  return rgbString([r, g, b]);
}

/**
 * Map health factor value to a 0–100% position on the gauge.
 * HF 0–MAX_DISPLAY_HF maps linearly to 0–100%, clamped at both ends.
 */
export function healthFactorToPercent(value: number): number {
  return Math.min(100, Math.max(0, (value / MAX_DISPLAY_HF) * 100));
}
