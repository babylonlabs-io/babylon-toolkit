import type { HealthFactorStatus } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { HEALTH_FACTOR_DISPLAY_CAP } from "../constants";

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
  return healthFactor.toFixed(2);
}
