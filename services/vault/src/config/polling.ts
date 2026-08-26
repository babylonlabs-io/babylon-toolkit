/**
 * Shared polling configuration for vault provider RPC calls.
 *
 * Used by both pegin and pegout polling hooks to ensure
 * consistent intervals and retry behavior.
 * RPC timeout is handled by the SDK's VaultProviderRpcClient (default 60s).
 */

/** Interval between polling attempts (30 seconds) */
export const POLLING_INTERVAL_MS = 30 * 1000;

/** Number of retry attempts on query failure */
export const POLLING_RETRY_COUNT = 3;

/** Delay between retry attempts (5 seconds) */
export const POLLING_RETRY_DELAY_MS = 5 * 1000;
