import { formatHealthFactor } from "@/applications/aave/utils";

interface HealthFactorDeltaProps {
  /** Current on-chain health factor, or null when the user has no debt. */
  current: number | null;
  /** Projected health factor after the action. Infinity when no debt. */
  projected: number;
}

/**
 * Compact "current → projected" health factor rendering shared by the
 * withdraw selector and review steps.
 */
export function HealthFactorDelta({
  current,
  projected,
}: HealthFactorDeltaProps) {
  return (
    <span>
      {formatHealthFactor(current)}
      <span className="mx-1 text-accent-secondary">&rarr;</span>
      {Number.isFinite(projected) ? formatHealthFactor(projected) : "∞"}
    </span>
  );
}
