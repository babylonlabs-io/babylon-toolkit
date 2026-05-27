import type { HealthFactorStatus } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { HEALTH_FACTOR_DISPLAY_CAP } from "../constants";


export const HEALTH_FACTOR_COLORS = {
  GREEN: "#00E676",
  AMBER: "#FFC400",
  RED: "#FF1744",
  GRAY: "#5A5A5A",
} as const;

export type HealthFactorColor =
  (typeof HEALTH_FACTOR_COLORS)[keyof typeof HEALTH_FACTOR_COLORS];

export function getHealthFactorColor(
  status: HealthFactorStatus,
): HealthFactorColor {
  switch (status) {
    case "safe":
      return HEALTH_FACTOR_COLORS.GREEN;
    case "warning":
      return HEALTH_FACTOR_COLORS.AMBER;
    case "danger":
      return HEALTH_FACTOR_COLORS.RED;
    case "no_debt":
      return HEALTH_FACTOR_COLORS.GRAY;
  }
}

/** Above this value, the health factor is effectively unbounded. Callers that show
 *  a high-HF label (e.g. the Overview row) use this; numeric before/after deltas
 *  intentionally do not, to preserve the magnitude of the change. */
export const HEALTH_FACTOR_HEALTHY_THRESHOLD = 50;

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
