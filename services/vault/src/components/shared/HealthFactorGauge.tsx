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

import {
  getGradientColorAt,
  healthFactorToPercent,
  INDICATOR_RADIUS_PX,
  LIQUIDATION_PERCENT,
  MAX_DISPLAY_HF,
  STATUS_LABELS,
} from "./utils/healthFactorGauge";

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
