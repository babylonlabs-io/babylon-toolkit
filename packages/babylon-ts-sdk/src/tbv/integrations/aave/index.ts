/**
 * AAVE v4 Integration for Babylon Trustless BTC Vault
 *
 * **Pure, reusable SDK for AAVE protocol integration** - Use your BTC as collateral to borrow stablecoins.
 *
 * This module provides transaction builders, query functions, and utilities for:
 * - **Transaction Builders** - Build unsigned txs for borrow, repay, and withdraw
 * - **Query Functions** - Fetch live position data, health factor, debt amounts from AAVE spoke
 * - **Utility Functions** - Calculate health factor, select vaults, check safety
 *
 * ## Key Features
 *
 * - **Pure Functions** - No wallet dependencies, works anywhere (Node.js, browser, serverless)
 * - **Type-Safe** - Full TypeScript support with viem integration
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
 *   buildBorrowTx,
 *   getUserAccountData,
 *   calculateHealthFactor,
 *   HEALTH_FACTOR_WARNING_THRESHOLD
 * } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
 *
 * // Check position health
 * const accountData = await getUserAccountData(publicClient, spokeAddress, proxyAddress);
 * const hf = Number(accountData.healthFactor) / 1e18;
 * console.log("Health Factor:", hf);
 *
 * // Borrow stablecoins (adapter resolves proxy from msg.sender)
 * const borrowTx = buildBorrowTx(adapterAddress, reserveId, amount, receiver);
 * await walletClient.sendTransaction({ to: borrowTx.to, data: borrowTx.data });
 * ```
 */

// Constants
export {
  AAVE_BASE_CURRENCY_DECIMALS,
  AAVE_BASE_CURRENCY_RAY_DECIMALS,
  AAVE_FUNCTION_NAMES,
  BPS_SCALE,
  FULL_REPAY_BUFFER_DIVISOR,
  HEALTH_FACTOR_WARNING_THRESHOLD,
  MIN_HEALTH_FACTOR_FOR_BORROW,
} from "./constants.js";

// Types
export type {
  AaveMarketPosition,
  AaveSpokeUserAccountData,
  AaveSpokeUserPosition,
  PositionSizeParams,
  TransactionParams,
} from "./types.js";

// Contract clients (queries and transaction builders)
export {
  buildBorrowTx,
  buildReorderVaultsTx,
  buildRepayTx,
  buildWithdrawCollateralsTx,
  getAssetDrawnRatesSafe,
  getDynamicReserveConfig,
  getOracleAddress,
  getPosition,
  getPositionSizeParams,
  getReserve,
  getReservesPrices,
  getReservesPricesSafe,
  getTargetHealthFactor,
  getUserAccountData,
  getUserPosition,
  getPositionReserveTotalDebt,
  getUserPositionAndAccountData,
  getUserPositions,
  getUserTotalDebt,
  getUserTotalDebts,
  type AssetDrawnRateRequest,
  type AssetDrawnRateResult,
  type ReservePriceResult,
} from "./clients/index.js";

// Utilities
export {
  MAX_GROUPS,
  MIN_DEBT_THRESHOLD,
  SEIZURE_TOL,
  aaveRayValueToUsd,
  aaveValueToUsd,
  calculateHealthFactor,
  computeMinDepositForSplit,
  computeOptimalOrder,
  computeOptimalSplit,
  computeSeizedFraction,
  computeSeizedFractionDetailed,
  getGroup1FromOrder,
  getHealthFactorStatus,
  getHealthFactorStatusFromValue,
  hasDebtFromPosition,
  MAX_DP_N,
  simulateCascade,
  wadToNumber,
} from "./utils/index.js";

export type {
  CascadeVault,
  HealthFactorStatus,
  MinDepositForSplitParams,
  OptimalSplitParams,
  OptimalSplitResult,
} from "./utils/index.js";

// Export ABIs for application registration
export { default as AaveIntegrationAdapterABI } from "./clients/abis/AaveIntegrationAdapter.abi.json";
// Reverts on the withdraw/borrow paths originate inside the Aave Core Spoke or
// the per-position proxy, not the adapter. Without these ABIs their custom
// errors decode to nothing, so ordinary conditions (health-factor floor, dust
// rule, frozen reserve) surface as "Execution reverted for an unknown reason."
export { default as AaveSpokeABI } from "./clients/abis/AaveSpoke.abi.json";
export { default as AaveAdapterPositionProxyABI } from "./clients/abis/AaveAdapterPositionProxy.abi.json";
