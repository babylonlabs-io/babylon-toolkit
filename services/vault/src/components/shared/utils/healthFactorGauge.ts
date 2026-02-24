import {
  HEALTH_FACTOR_COLORS,
  type HealthFactorStatus,
} from "@/applications/aave/utils";

export const STATUS_LABELS: Record<
  Exclude<HealthFactorStatus, "no_debt">,
  string
> = {
  safe: "Healthy",
  warning: "At Risk",
  danger: "Liquidatable",
} satisfies Record<string, string>;

/** Maximum health factor value displayed on the gauge (HF >= this maps to 100%). */
export const MAX_DISPLAY_HF = 3;

/** Half-width of the indicator circle in px, used to clamp within the track. */
export const INDICATOR_RADIUS_PX = 8;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// Gradient color stops derived from HEALTH_FACTOR_COLORS: red (0%) → amber (50%) → green (100%)
export const GRADIENT_STOPS: [number, number, number][] = [
  hexToRgb(HEALTH_FACTOR_COLORS.RED),
  hexToRgb(HEALTH_FACTOR_COLORS.AMBER),
  hexToRgb(HEALTH_FACTOR_COLORS.GREEN),
];

/**
 * Interpolate the gradient color at a given 0–100 percentage.
 * Matches the CSS `linear-gradient(to right, RED, AMBER, GREEN)`.
 */
export function getGradientColorAt(percent: number): string {
  const t = Math.min(1, Math.max(0, percent / 100));
  // Two segments: 0→0.5 = red→amber, 0.5→1.0 = amber→green
  let segmentT: number;
  let from: [number, number, number];
  let to: [number, number, number];
  if (t <= 0.5) {
    segmentT = t / 0.5;
    from = GRADIENT_STOPS[0];
    to = GRADIENT_STOPS[1];
  } else {
    segmentT = (t - 0.5) / 0.5;
    from = GRADIENT_STOPS[1];
    to = GRADIENT_STOPS[2];
  }
  const r = Math.round(from[0] + (to[0] - from[0]) * segmentT);
  const g = Math.round(from[1] + (to[1] - from[1]) * segmentT);
  const b = Math.round(from[2] + (to[2] - from[2]) * segmentT);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Map health factor value to a 0–100% position on the gauge.
 * HF 0–MAX_DISPLAY_HF maps linearly to 0–100%, clamped at both ends.
 */
export function healthFactorToPercent(value: number): number {
  return Math.min(100, Math.max(0, (value / MAX_DISPLAY_HF) * 100));
}

/** Aave liquidation threshold: HF = 1.0. Positions below this are liquidatable. */
export const LIQUIDATION_PERCENT = healthFactorToPercent(1.0);
