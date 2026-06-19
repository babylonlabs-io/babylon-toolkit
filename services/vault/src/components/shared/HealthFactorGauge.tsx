/**
 * HealthFactorGauge Component
 * Displays a read-only rainbow gauge visualizing health factor status
 * with a gradient track (red → amber → green), a ring indicator at the
 * current value, and a liquidation threshold marker at HF=1.0. The
 * "Liquidation Risk" / status labels sit above the shaded card; inside the
 * card the gradient track is flush at the top, with an optional row of stats
 * (e.g. liquidation price, BTC price, % to liquidation) below it.
 */

import {
  HEALTH_FACTOR_COLORS,
  type HealthFactorStatus,
} from "@/applications/aave/utils";

import {
  GAUGE_TRACK_GRADIENT,
  getGradientColorAt,
  healthFactorToPercent,
  INDICATOR_RADIUS_PX,
  MAX_DISPLAY_HF,
  STATUS_LABELS,
} from "./utils/healthFactorGauge";

export interface HealthFactorGaugeStat {
  label: string;
  value: string;
}

interface HealthFactorGaugeProps {
  value: number | null;
  status: HealthFactorStatus;
  stats?: HealthFactorGaugeStat[];
  className?: string;
}

export function HealthFactorGauge({
  value,
  status,
  stats,
  className = "",
}: HealthFactorGaugeProps) {
  if (status === "no_debt" || value === null) return null;

  const percent = healthFactorToPercent(value);
  const gradientColor = getGradientColorAt(percent);

  return (
    <div
      className={className}
      role="meter"
      aria-label="Health factor"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={MAX_DISPLAY_HF}
    >
      {/* Labels — sit above the gauge card, outside the shaded box */}
      <div className="mb-3 flex items-center justify-between">
        <span
          className="text-xs leading-[1.66] tracking-[0.4px]"
          style={{ color: HEALTH_FACTOR_COLORS.RED }}
        >
          Liquidation Risk
        </span>
        <span
          className="text-xs font-normal leading-[1.66] tracking-[0.4px]"
          style={{ color: gradientColor }}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>
      {/* Shaded card: the gradient track spans the full width and sits flush
          at the very top edge. The track's top corners are rounded to match
          the card (rounded-t-lg ↔ rounded-lg) so it reads as clipped without
          an overflow-hidden that would crop the indicator ring. The stats row
          carries its own horizontal padding so it stays inset from the edges. */}
      <div className="rounded-lg bg-primary-contrast pb-4">
        {/* Gauge track */}
        <div
          className="relative h-1 w-full rounded-t-lg"
          style={{ background: GAUGE_TRACK_GRADIENT }}
        >
          {/* Current value indicator — ring whose center matches the container background */}
          <div
            className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-primary-contrast"
            style={{
              border: `3px solid ${gradientColor}`,
              left: `clamp(${INDICATOR_RADIUS_PX}px, ${percent}%, calc(100% - ${INDICATOR_RADIUS_PX}px))`,
            }}
          />
        </div>
        {/* Optional stats row. Columns are separated by a short centered
            divider (matching the design) rather than a full-height border. */}
        {stats && stats.length > 0 && (
          <div className="mt-4 grid grid-cols-3 px-4">
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={`relative flex flex-col items-center ${i > 0 ? "before:absolute before:left-0 before:top-1/2 before:h-[30px] before:w-px before:-translate-y-1/2 before:bg-secondary-strokeLight before:content-[''] dark:before:bg-secondary-strokeDark" : ""}`}
              >
                <span className="text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
                  {stat.label}
                </span>
                <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
