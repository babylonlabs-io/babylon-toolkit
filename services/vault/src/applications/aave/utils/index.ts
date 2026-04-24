// Re-export utilities from SDK
export {
  aaveRayValueToUsd,
  aaveValueToUsd,
  calculateBorrowRatio,
  calculateHealthFactor,
  calculateTotalVaultAmount,
  getHealthFactorStatus,
  getHealthFactorStatusFromValue,
  hasDebtFromPosition,
  isHealthFactorHealthy,
  selectVaultsForAmount,
  wadToNumber,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

export type {
  HealthFactorStatus,
  SelectableVault,
  VaultSelectionResult,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

// Display utilities (frontend-only, not in SDK)
export {
  HEALTH_FACTOR_COLORS,
  formatHealthFactor,
  getHealthFactorColor,
} from "./healthFactorDisplay";

export type { HealthFactorColor } from "./healthFactorDisplay";

// Withdrawal eligibility helpers (frontend-only)
export {
  canWithdrawAnyVault,
  computeProjectedHealthFactor,
  getWithdrawHfWarningState,
  isHealthFactorAtOrAbove,
  isVaultIndividuallyWithdrawable,
} from "./withdrawEligibility";

export type {
  PositionSnapshot,
  WithdrawHfWarningState,
} from "./withdrawEligibility";

// Withdraw selection normalization (frontend-only)
export { getEffectiveVaultSelection } from "./withdrawSelection";

export type { EffectiveVaultSelection } from "./withdrawSelection";
