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
  /** Withdraw selected vaults from position (partial withdrawal) */
  WITHDRAW_COLLATERALS: "withdrawCollaterals",
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

/**
 * Mock Core Spoke parameter: Target Health Factor (THF)
 * Per-spoke governance parameter. After liquidation, the protocol targets
 * restoring the position to this health factor.
 * WAD-scaled: 1.10 * 1e18
 *
 * TODO: Replace with real contract read when Core Spoke ABI is available
 */
export const MOCK_TARGET_HEALTH_FACTOR_WAD = 1_100_000_000_000_000_000n;

/**
 * Mock Core Spoke parameter: Collateral Factor (CF)
 * Determines what fraction of collateral value counts toward borrowing power.
 * BPS-scaled: 0.75 * 10000 = 7500
 *
 * TODO: Replace with real contract read when Core Spoke ABI is available
 */
export const MOCK_COLLATERAL_FACTOR_BPS = 7500n;

/**
 * Mock Core Spoke parameter: Liquidation Bonus (LB)
 * Bonus multiplier awarded to liquidators. Fixed at 1.05 (5% bonus),
 * min = max (no Dutch auction).
 * WAD-scaled: 1.05 * 1e18
 *
 * TODO: Replace with real contract read when Core Spoke ABI is available
 */
export const MOCK_LIQUIDATION_BONUS_WAD = 1_050_000_000_000_000_000n;
