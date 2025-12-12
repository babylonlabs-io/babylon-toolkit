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
 * Token icon paths by symbol
 * Used for displaying token icons in the UI
 */
export const TOKEN_ICONS: Record<string, string> = {
  BTC: "/images/btc.png",
  WBTC: "/images/wbtc.png",
  USDC: "/images/usdc.png",
  USDT: "/images/usdt.png",
};

/**
 * Default token icon when symbol not found
 */
export const DEFAULT_TOKEN_ICON = "/images/token.png";
