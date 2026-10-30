import type { HealthFactorStatus } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { HEALTH_FACTOR_DISPLAY_CAP } from "../constants";

const HEALTH_FACTOR_DECIMALS = 2;
const HEALTH_FACTOR_SCALE = 10 ** HEALTH_FACTOR_DECIMALS;

export const HEALTH_FACTOR_COLORS = {
  GREEN: "#15B768",
  AMBER: "#F7931A",
  RED: "#FF1744",
  DARK_RED: "#C62828",
  GRAY: "#5A5A5A",
} as const;

export type HealthFactorColor =
  (typeof HEALTH_FACTOR_COLORS)[keyof typeof HEALTH_FACTOR_COLORS];

export function getHealthFactorColor(
  status: HealthFactorStatus,
): HealthFactorColor {
  switch (status) {
    case "safe":
    case "no_debt":
      return HEALTH_FACTOR_COLORS.GREEN;
    case "warning":
      return HEALTH_FACTOR_COLORS.AMBER;
    case "risky":
      return HEALTH_FACTOR_COLORS.RED;
    case "danger":
      return HEALTH_FACTOR_COLORS.DARK_RED;
  }
}

export function formatHealthFactor(healthFactor: number | null): string {
  // null = no debt; non-finite or absurdly high = negligible debt. All render
  // as "-" ("infinitely healthy") rather than "Infinity" or the scientific
  // notation `toFixed` produces above ~1e21 (e.g. "1.7e+55").
  if (
    healthFactor === null ||
    !isFinite(healthFactor) ||
    healthFactor > HEALTH_FACTOR_DISPLAY_CAP
  ) {
    return "-";
  }
  // Round down, never to nearest: the status bands are hundredths, so a value
  // rounded up can read as a safer band than its color (a liquidatable 0.996
  // would print "1.00"). Taking the largest hundredth that does not exceed the
  // value, rather than flooring `healthFactor * 100`, keeps a value that is
  // already a hundredth whole: 1.15 is stored as 1.1499…, and
  // `1.15 * 100 === 114.99999999999999`.
  const nearest = Math.round(healthFactor * HEALTH_FACTOR_SCALE);
  const roundedDown =
    nearest / HEALTH_FACTOR_SCALE > healthFactor ? nearest - 1 : nearest;
  return (roundedDown / HEALTH_FACTOR_SCALE).toFixed(HEALTH_FACTOR_DECIMALS);
}
