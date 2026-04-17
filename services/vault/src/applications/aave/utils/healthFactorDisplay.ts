import type { HealthFactorStatus } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

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

export function formatHealthFactor(healthFactor: number | null): string {
  if (healthFactor === null) {
    return "-";
  }
  return healthFactor.toFixed(2);
}
