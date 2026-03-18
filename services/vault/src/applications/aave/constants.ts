/**
 * Aave Protocol Constants (Vault-specific)
 *
 * This file contains vault-specific constants.
 * Protocol constants are imported from @babylonlabs-io/ts-sdk.
 */

import { getNetworkConfigBTC } from "@/config";

// Re-export SDK constants for backwards compatibility
export {
  AAVE_BASE_CURRENCY_DECIMALS,
  BPS_SCALE,
  BPS_TO_PERCENT_DIVISOR,
  BTC_DECIMALS,
  FULL_REPAY_BUFFER_DIVISOR,
  HEALTH_FACTOR_WARNING_THRESHOLD,
  MIN_HEALTH_FACTOR_FOR_BORROW,
  USDC_DECIMALS,
  WAD_DECIMALS,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

/**
 * Stale time for config queries (5 minutes)
 * Config data (reserves, contract addresses) rarely changes
 */
export const CONFIG_STALE_TIME_MS = 5 * 60 * 1000;

/** Number of retries for config/parameter queries */
export const CONFIG_RETRY_COUNT = 3;

/**
 * Expected health factor at liquidation (worst-case assumption).
 * Used in vault split calculations to determine how much collateral
 * would be seized. 0.95 means we assume HF drops to 0.95 before
 * liquidation triggers.
 */
export const EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION = 0.95;

/**
 * Safety margin multiplier for sacrificial vault sizing.
 * 1.05 means the sacrificial vault is sized 5% larger than the
 * computed target seizure to account for price movements between
 * split computation and actual liquidation.
 */
export const VAULT_SPLIT_SAFETY_MARGIN = 1.05;

/**
 * Refetch interval for position data (30 seconds)
 * Positions need to be refreshed regularly for live debt/health data
 */
export const POSITION_REFETCH_INTERVAL_MS = 30 * 1000;

/**
 * Minimum slider max value to prevent division by zero
 * when no vaults or borrow capacity available
 */
export const MIN_SLIDER_MAX = 0.0001;

/**
 * Tolerance for detecting full repayment
 * If repay amount is within this tolerance of max, treat as full repay
 */
export const FULL_REPAY_TOLERANCE = 0.01;

/**
 * BTC token display constants
 * Uses network-aware config (BTC for mainnet, sBTC for signet)
 */
const btcConfig = getNetworkConfigBTC();
export const BTC_TOKEN = {
  icon: btcConfig.icon,
  name: btcConfig.name,
  symbol: btcConfig.coinSymbol,
} as const;

/**
 * Loan tab identifiers
 * Used for URL params and tab switching
 */
export const LOAN_TAB = {
  BORROW: "borrow",
  REPAY: "repay",
} as const;

export type LoanTab = (typeof LOAN_TAB)[keyof typeof LOAN_TAB];

/**
 * Shared input className for AmountSlider across Aave components
 */
export const AMOUNT_INPUT_CLASS_NAME =
  "w-auto min-w-32 rounded-md border border-gray-300 px-2 py-1 dark:border-[#3a3a3a]";
