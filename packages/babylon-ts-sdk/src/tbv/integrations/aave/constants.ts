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
  /** Reorder vault prefix ordering for liquidation priority */
  REORDER_VAULTS: "reorderVaults",
} as const;

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
 * Aave RAY-scaled base currency decimals
 * Debt values (totalDebtValueRay) use 1e53 = $1 USD
 * (base currency 1e26 scaled by RAY 1e27).
 *
 * Reference: IAaveSpoke.sol UserAccountData.totalDebtValueRay
 */
export const AAVE_BASE_CURRENCY_RAY_DECIMALS = 53;

/**
 * WAD decimals (1e18 = 1.0)
 * Used for health factor and collateral factor values
 *
 * Reference: ISpoke.sol - "healthFactor expressed in WAD. 1e18 represents a health factor of 1.00"
 */
export const WAD_DECIMALS = 18;

/**
 * Health factor risky threshold.
 * A position from 1.0 up to and including this value is "risky".
 */
export const HEALTH_FACTOR_RISKY_THRESHOLD = 1.1;

/**
 * Health factor warning threshold.
 * A position above HEALTH_FACTOR_RISKY_THRESHOLD and up to and including this
 * value is "warning". A position above this value is "safe".
 */
export const HEALTH_FACTOR_WARNING_THRESHOLD = 2.0;

/**
 * Minimum health factor allowed for borrowing. Collateral factor doubles as the
 * liquidation threshold here, so this floor is the only borrow→liquidation cushion.
 */
export const MIN_HEALTH_FACTOR_FOR_BORROW = 1.05;

/**
 * Approval headroom for repay-all, sized against interest accrual between
 * quoting the debt and transaction execution.
 *
 * 0.5% buffer (50 basis points). Sized to absorb hours of execution delay
 * (e.g. Safe-multisig quorum collection). The repay itself sends the
 * repay-all sentinel and the adapter pulls only what's actually owed; the
 * buffer only pads the approval cap, and the cap is additionally bounded by
 * the user's balance, so a larger buffer never blocks a legitimate repay.
 */
export const FULL_REPAY_BUFFER_DIVISOR = 200n; // 1/200 = 0.5% buffer

