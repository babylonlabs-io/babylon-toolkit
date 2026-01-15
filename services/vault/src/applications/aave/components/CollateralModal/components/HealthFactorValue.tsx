/**
 * Health Factor value display component
 * Renders health factor with optional transition (current → projected)
 */

import { HeartIcon } from "@/components/shared";

import {
  formatHealthFactor,
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
} from "../../../utils";

interface HealthFactorValueProps {
  /** Current health factor value (Infinity when no debt) */
  current: number;
  /** Projected health factor value (optional, for transition display) */
  projected?: number;
}

export function HealthFactorValue({
  current,
  projected,
}: HealthFactorValueProps) {
  const currentStatus = getHealthFactorStatusFromValue(current);
  const currentColor = getHealthFactorColor(currentStatus);
  const currentFormatted = formatHealthFactor(
    isFinite(current) ? current : null,
  );

  // Show transition only if projected is provided and differs from current
  const showTransition = projected !== undefined && projected !== current;

  if (showTransition) {
    const projectedStatus = getHealthFactorStatusFromValue(projected);
    const projectedColor = getHealthFactorColor(projectedStatus);
    const projectedFormatted = formatHealthFactor(
      isFinite(projected) ? projected : null,
    );

    return (
      <span className="flex items-center gap-2 text-base">
        <span className="flex items-center gap-1 text-accent-secondary">
          <HeartIcon color={currentColor} />
          {currentFormatted}
        </span>
        <span className="text-accent-secondary">→</span>
        <span className="flex items-center gap-1 text-accent-primary">
          <HeartIcon color={projectedColor} />
          {projectedFormatted}
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2 text-base text-accent-primary">
      <HeartIcon color={currentColor} />
      {currentFormatted}
    </span>
  );
}
