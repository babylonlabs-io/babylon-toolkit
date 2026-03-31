/**
 * Shared polling configuration for vault provider RPC calls.
 *
 * Used by both pegin and pegout polling hooks to ensure
 * consistent timeouts, intervals, and retry behavior.
 */

/** Timeout for a single RPC request to a vault provider (60 seconds) */
export const RPC_TIMEOUT_MS = 60 * 1000;

/** Interval between polling attempts (30 seconds) */
export const POLLING_INTERVAL_MS = 30 * 1000;

/** Number of retry attempts on query failure */
export const POLLING_RETRY_COUNT = 3;

/** Delay between retry attempts (5 seconds) */
export const POLLING_RETRY_DELAY_MS = 5 * 1000;

/** Max consecutive poll failures before treating a vault's pegout as timed out (10 × 30s = 5 min) */
export const PEGOUT_MAX_CONSECUTIVE_FAILURES = 10;

/** Max consecutive polls returning an unknown status before treating as terminal (20 × 30s = 10 min) */
export const PEGOUT_MAX_UNKNOWN_STATUS_POLLS = 20;
