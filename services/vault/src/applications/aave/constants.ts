/**
 * Aave Protocol Constants (Vault-specific)
 *
 * This file contains vault-specific constants.
 * Protocol constants are imported from @babylonlabs-io/ts-sdk.
 */

// Re-export SDK constants for backwards compatibility
export {
  BPS_SCALE,
  FULL_REPAY_BUFFER_DIVISOR,
  FULL_REPAY_BUFFER_FRACTION,
  MIN_HEALTH_FACTOR_FOR_BORROW,
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
 * Block threshold for vault withdrawal: if the projected health factor
 * after withdrawing the selected vaults would be below this value, the
 * FE disables the Confirm button to avoid a guaranteed on-chain revert
 * (Aave itself enforces HF >= 1.0 on withdrawal). This is the lowest HF
 * at which the contract would still accept the call.
 */
export const WITHDRAW_HF_BLOCK_THRESHOLD = 1.0;

/**
 * Warning threshold for vault withdrawal: if the projected health factor
 * after withdrawing would fall below this value (but stay above the block
 * threshold), the withdrawal review step shows an inline at-risk warning.
 * Narrower than the general HEALTH_FACTOR_WARNING_THRESHOLD used by the
 * position overview — withdrawal warnings are a separate, per-action
 * surface per product decision.
 */
export const WITHDRAW_HF_WARNING_THRESHOLD = 1.1;

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
 * Threshold (ms) after which position data is considered stale.
 * If the last successful fetch was longer than this ago, the UI
 * warns that oracle-derived values may be outdated.
 * 3 × 30s refetch interval = 90s.
 */
export const POSITION_STALENESS_THRESHOLD_MS = POSITION_REFETCH_INTERVAL_MS * 3;

/**
 * Minimum slider max value to prevent division by zero
 * when no vaults or borrow capacity available
 */
export const MIN_SLIDER_MAX = 0.0001;

/**
 * Number of discrete steps in the amount sliders (the native range input's
 * `step` is `max / SLIDER_STEP_COUNT`). Float rounding of that division can
 * make the far-right position land one step short of max, so "slider at max"
 * detection uses a one-step tolerance keyed off this same count.
 */
export const SLIDER_STEP_COUNT = 1000;

/**
 * Threshold (in USD) below which projected debt is treated as
 * effectively zero for display purposes (showing "-" for health factor
 * instead of an astronomical number). This is a display-only concern
 * and does NOT affect repay routing (full vs partial).
 */
export const NEAR_ZERO_DEBT_DISPLAY_THRESHOLD = 0.01;

/**
 * Display ceiling for the health factor. A position only reaches a value this
 * high with negligible debt relative to collateral — far beyond any realistic
 * liquidation risk — so at or above it the UI shows "-" ("infinitely healthy")
 * rather than a meaningless large number or, above ~1e21, the scientific
 * notation JS `toFixed` produces (e.g. "1.7e+55"). Display-only.
 */
export const HEALTH_FACTOR_DISPLAY_CAP = 1000;

/**
 * Fractional threshold (relative to total debt) below which projected
 * debt is treated as effectively zero for display purposes. Catches
 * cases where the slider snaps one step short of max (~0.1% residual)
 * so the projected health factor doesn't show an astronomical number.
 */
export const NEAR_ZERO_DEBT_RELATIVE_THRESHOLD = 0.005;

/**
 * Absolute ceiling (in USD) on the relative-threshold contribution.
 * Without this cap, a 0.5% relative threshold on a $100k debt would mask
 * a $300 deliberate residual the user intentionally left unpaid. The cap
 * keeps slider-snap masking effective on small positions without hiding
 * meaningful residual debt on large ones.
 */
export const NEAR_ZERO_DEBT_RELATIVE_CAP_USD = 5;

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
  "h-12 w-auto min-w-32 rounded-lg bg-neutral-200 px-4 text-xl text-accent-secondary";

/**
 * Shared Max-button pill styling for AmountSlider across Aave components
 */
export const MAX_BUTTON_CLASS_NAME =
  "bg-neutral-200 text-sm text-accent-secondary dark:bg-neutral-200";

/**
 * Maximum decimal precision JS numbers can faithfully represent for
 * `Number.prototype.toFixed`. Past 15 fractional digits, IEEE 754 doubles
 * start showing artifacts (e.g. `(0.1).toFixed(18) === "0.100000000000000006"`).
 *
 * Both the max-borrow floor and the `parseUnits` conversion inside
 * `useBorrowTransaction` must cap at this value, otherwise the UI can
 * advertise a max that the execution path turns into 0 (and the borrow
 * gets rejected as zero or as a different amount than displayed).
 */
export const SAFE_TOFIXED_PRECISION = 15;
