// Re-export utilities from SDK
export {
  HEALTH_FACTOR_COLORS,
  aaveValueToUsd,
  calculateBorrowRatio,
  calculateHealthFactor,
  calculateTotalVaultAmount,
  formatHealthFactor,
  getHealthFactorColor,
  getHealthFactorStatus,
  getHealthFactorStatusFromValue,
  hasDebtFromPosition,
  isHealthFactorHealthy,
  selectVaultsForAmount,
  wadToNumber,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

export type {
  HealthFactorColor,
  HealthFactorStatus,
  SelectableVault,
  VaultSelectionResult,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
