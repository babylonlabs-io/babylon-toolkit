/**
 * AAVE v4 Integration for Babylon Trustless BTC Vault
 *
 * **Pure, reusable SDK for AAVE protocol integration** - Use your BTC as collateral to borrow stablecoins.
 *
 * This module provides transaction builders, query functions, and utilities for:
 * - **Transaction Builders** - Build unsigned txs for add collateral, borrow, repay, withdraw, redeem
 * - **Query Functions** - Fetch live position data, health factor, debt amounts from AAVE spoke
 * - **Utility Functions** - Calculate health factor, select vaults, format values, check safety
 *
 * ## Key Features
 *
 * - ✅ **Pure Functions** - No wallet dependencies, works anywhere (Node.js, browser, serverless)
 * - ✅ **Type-Safe** - Full TypeScript support with viem integration
 *
 * ## Architecture
 *
 * **Transaction Flow:**
 * 1. SDK builds unsigned transaction → 2. Your app executes with wallet → 3. Contract updates state
 *
 * **Separation of Concerns:**
 * - SDK provides pure functions and transaction builders
 * - Your app handles wallet integration and transaction execution
 *
 * @module integrations/aave
 *
 * @example
 * ```typescript
 * import {
 *   buildAddCollateralTx,
 *   buildBorrowTx,
 *   getUserAccountData,
 *   calculateHealthFactor,
 *   HEALTH_FACTOR_WARNING_THRESHOLD
 * } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 *
 * // Add BTC vaults as collateral
 * const addTx = buildAddCollateralTx(controllerAddress, vaultIds, reserveId);
 * await walletClient.sendTransaction({ to: addTx.to, data: addTx.data });
 *
 * // Check position health
 * const accountData = await getUserAccountData(publicClient, spokeAddress, proxyAddress);
 * const hf = Number(accountData.healthFactor) / 1e18;
 * console.log("Health Factor:", hf);
 *
 * // Borrow stablecoins
 * const borrowTx = buildBorrowTx(controllerAddress, positionId, reserveId, amount, receiver);
 * await walletClient.sendTransaction({ to: borrowTx.to, data: borrowTx.data });
 * ```
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

// Export ABIs for application registration
export { default as AaveIntegrationControllerABI } from "./clients/abis/AaveIntegrationController.abi.json";
export { default as AaveSpokeABI } from "./clients/abis/AaveSpoke.abi.json";
