/**
 * Aave Protocol Constants
 *
 * Constants for interacting with Aave v4 protocol.
 * Reference: https://github.com/aave/aave-v4 ISpoke.sol
 */

/**
 * BTC token decimals (satoshis)
 * 1 BTC = 100,000,000 satoshis
 */
export const BTC_DECIMALS = 8;

/**
 * USDC token decimals
 * Used for debt calculations
 */
export const USDC_DECIMALS = 6;

/**
 * Divisor to convert basis points (BPS) to percentage
 *
 * In Aave v4, risk parameters like collateralRisk are stored in BPS
 * where 10000 BPS = 100%.
 *
 * Example: 8000 BPS / 100 = 80%
 *
 * Reference: ISpoke.sol - "collateralRisk The risk associated with a
 * collateral asset, expressed in BPS"
 */
export const BPS_TO_PERCENT_DIVISOR = 100;

/**
 * Full basis points scale (10000 BPS = 100%)
 *
 * Use this when converting BPS directly to decimal:
 * Example: 8000 BPS / 10000 = 0.80
 */
export const BPS_SCALE = 10000;

/**
 * Stale time for config queries (5 minutes)
 * Config data (reserves, contract addresses) rarely changes
 */
export const CONFIG_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Refetch interval for position data (30 seconds)
 * Positions need to be refreshed regularly for live debt/health data
 */
export const POSITION_REFETCH_INTERVAL_MS = 30 * 1000;

/**
 * Aave base currency decimals
 * Account data values (collateral, debt) use 1e26 = $1 USD
 *
 * Reference: ISpoke.sol UserAccountData
 */
export const AAVE_BASE_CURRENCY_DECIMALS = 26;

/**
 * WAD decimals (1e18 = 1.0)
 * Used for health factor and collateral factor values
 *
 * Reference: ISpoke.sol - "healthFactor expressed in WAD. 1e18 represents a health factor of 1.00"
 */
export const WAD_DECIMALS = 18;

/**
 * Health factor warning threshold
 * Positions below this are considered at risk of liquidation
 */
export const HEALTH_FACTOR_WARNING_THRESHOLD = 1.5;

/**
 * Minimum health factor allowed for borrowing
 * Prevents users from borrowing if resulting health factor would be below this.
 */
export const MIN_HEALTH_FACTOR_FOR_BORROW = 1.2;

/**
 * Minimum slider max value to prevent division by zero
 * when no vaults or borrow capacity available
 */
export const MIN_SLIDER_MAX = 0.0001;

/**
 * Tolerance for detecting full repayment
 * If repay amount is within this tolerance of max, treat as full repay
 * Uses maxUint256 to ensure all debt including accrued interest is repaid
 */
export const FULL_REPAY_TOLERANCE = 0.01;

/**
 * BTC token display constants
 */
export const BTC_TOKEN = {
  icon: "/images/btc.png",
  name: "Bitcoin",
  symbol: "BTC",
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
