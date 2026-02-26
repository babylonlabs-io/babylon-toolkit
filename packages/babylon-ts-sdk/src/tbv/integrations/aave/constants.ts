/**
 * Aave Protocol Constants
 *
 * Constants for interacting with Aave v4 protocol.
 * Reference: https://github.com/aave/aave-v4 ISpoke.sol
 */

/**
 * Aave contract function names
 * Centralized constants for contract interactions
 */
export const AAVE_FUNCTION_NAMES = {
  /** Withdraw all collateral from Core Spoke position (also redeems vaults) */
  WITHDRAW_ALL_COLLATERAL: "withdrawAllCollateralFromCorePosition",
  /** Borrow from Core Spoke position */
  BORROW: "borrowFromCorePosition",
  /** Repay debt to Core Spoke position */
  REPAY: "repayToCorePosition",
} as const;

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
 * Buffer for full repayment to account for interest accrual
 * between fetching debt and transaction execution.
 * 0.01% buffer (1 basis point) - the contract only takes what's owed.
 */
export const FULL_REPAY_BUFFER_DIVISOR = 10000n; // 1/10000 = 0.01% buffer
