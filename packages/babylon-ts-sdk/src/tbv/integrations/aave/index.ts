/**
 * Aave Integration for Babylon TBV
 *
 * Provides contract interaction utilities for Aave v4 protocol integration.
 * This module contains pure, reusable logic for:
 * - Reading contract state (positions, user data)
 * - Building unsigned transactions
 * - Pure utility functions (health factor, conversions, vault selection)
 *
 * Environment-specific configuration and transaction execution should be
 * handled by the consuming application (e.g., vault service).
 */

// Constants
export {
  AAVE_BASE_CURRENCY_DECIMALS,
  AAVE_FUNCTION_NAMES,
  BPS_SCALE,
  BPS_TO_PERCENT_DIVISOR,
  BTC_DECIMALS,
  FULL_REPAY_BUFFER_BPS,
  HEALTH_FACTOR_WARNING_THRESHOLD,
  MIN_HEALTH_FACTOR_FOR_BORROW,
  USDC_DECIMALS,
  WAD_DECIMALS,
} from "./constants.js";

// Types
export type {
  AaveMarketPosition,
  AaveSpokeUserAccountData,
  AaveSpokeUserPosition,
  DepositorStruct,
  TransactionParams,
} from "./types.js";

// Contract clients (queries and transaction builders)
export {
  buildAddCollateralTx,
  buildBorrowTx,
  buildDepositorRedeemTx,
  buildRepayTx,
  buildWithdrawAllCollateralTx,
  getPosition,
  getUserAccountData,
  getUserPosition,
  getUserTotalDebt,
  hasCollateral,
  hasDebt,
} from "./clients/index.js";

// Utilities
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
} from "./utils/index.js";

export type {
  HealthFactorColor,
  HealthFactorStatus,
  SelectableVault,
  VaultSelectionResult,
} from "./utils/index.js";
