import {
  formatHealthFactor,
  getHealthFactorColor,
  getHealthFactorStatusFromValue,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared/icons/HeartIcon";

interface HealthFactorDeltaProps {
  /** Current on-chain health factor, or null when the user has no debt. */
  current: number | null;
  /** Projected health factor after the action. Infinity when no debt. */
  projected: number;
}

/**
 * Compact "current → projected" health factor rendering shared by the
 * withdraw selector and review steps.
 *
 * Per Figma 10088-38704 the outgoing value and the arrow read as secondary
 * text while the projected value carries the position's colour and its heart.
 * The colour comes from the projected value's own status, so a withdrawal that
 * moves the position into warning or danger is not painted healthy green.
 */
export function HealthFactorDelta({
  current,
  projected,
}: HealthFactorDeltaProps) {
  const projectedColor = getHealthFactorColor(
    getHealthFactorStatusFromValue(projected),
  );

  return (
    <span className="flex items-center gap-1">
      <span className="text-accent-secondary">
        {formatHealthFactor(current)}
      </span>
      <span className="text-accent-secondary">&rarr;</span>
      <span style={{ color: projectedColor }}>
        {Number.isFinite(projected) ? formatHealthFactor(projected) : "∞"}
      </span>
      <HeartIcon color={projectedColor} className="size-[18px]" />
    </span>
  );
}
