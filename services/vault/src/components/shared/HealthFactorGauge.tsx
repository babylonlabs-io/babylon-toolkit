/**
 * HealthFactorGauge Component
 * Displays a read-only rainbow gauge visualizing health factor status
 * with a gradient track (red → amber → green), a ring indicator at the
 * current value, and a liquidation threshold marker at HF=1.0.
 */

import {
  HEALTH_FACTOR_COLORS,
  type HealthFactorStatus,
} from "@/applications/aave/utils";

const STATUS_LABELS: Record<Exclude<HealthFactorStatus, "no_debt">, string> = {
  safe: "Healthy",
  warning: "At Risk",
  danger: "Liquidatable",
} satisfies Record<string, string>;

/** Maximum health factor value displayed on the gauge (HF >= this maps to 100%). */
const MAX_DISPLAY_HF = 3;

/** Half-width of the indicator circle in px, used to clamp within the track. */
const INDICATOR_RADIUS_PX = 8;

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

/**
 * Interpolate the gradient color at a given 0–100 percentage.
 * Matches the CSS `linear-gradient(to right, RED, AMBER, GREEN)`.
 */
function getGradientColorAt(percent: number): string {
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
function healthFactorToPercent(value: number): number {
  return Math.min(100, Math.max(0, (value / MAX_DISPLAY_HF) * 100));
}

/** Aave liquidation threshold: HF = 1.0. Positions below this are liquidatable. */
const LIQUIDATION_PERCENT = healthFactorToPercent(1.0);

interface HealthFactorGaugeProps {
  value: number | null;
  status: HealthFactorStatus;
  className?: string;
}

export function HealthFactorGauge({
  value,
  status,
  className = "",
}: HealthFactorGaugeProps) {
  if (status === "no_debt" || value === null) return null;

  const percent = healthFactorToPercent(value);
  const gradientColor = getGradientColorAt(percent);

  return (
    <div
      className={`rounded-xl bg-primary-contrast px-4 pb-4 pt-5 ${className}`}
      role="meter"
      aria-label="Health factor"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={MAX_DISPLAY_HF}
    >
      {/* Gauge track */}
      <div
        className="relative h-1 w-full rounded-full"
        style={{
          background: `linear-gradient(to right, ${HEALTH_FACTOR_COLORS.RED}, ${HEALTH_FACTOR_COLORS.AMBER}, ${HEALTH_FACTOR_COLORS.GREEN})`,
        }}
      >
        {/* Liquidation threshold marker at HF=1.0 */}
        <div
          className="absolute top-1/2 h-4 w-px -translate-y-1/2 border-l border-dashed border-white"
          style={{ left: `${LIQUIDATION_PERCENT}%` }}
        />
        {/* Current value indicator — ring whose center matches the container background */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-primary-contrast"
          style={{
            border: `3px solid ${gradientColor}`,
            left: `clamp(${INDICATOR_RADIUS_PX}px, ${percent}%, calc(100% - ${INDICATOR_RADIUS_PX}px))`,
          }}
        />
      </div>
      {/* Labels */}
      <div className="mt-2 flex items-center justify-between">
        <span
          className="tracking-wide text-xs"
          style={{ color: HEALTH_FACTOR_COLORS.RED }}
        >
          Liquidation Risk
        </span>
        <span
          className="tracking-wide text-xs font-normal"
          style={{ color: gradientColor }}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>
    </div>
  );
}
