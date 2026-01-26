/**
 * Storage key for persisting device ID across sessions
 */
export const SENTRY_DEVICE_ID_KEY = "sentry_device_id";

/**
 * Sentry replay sampling rate (5% by default)
 * Can be overridden via NEXT_PUBLIC_REPLAYS_RATE environment variable
 */
export const REPLAYS_ON_ERROR_RATE = Number.parseFloat(
  process.env.NEXT_PUBLIC_REPLAYS_RATE ?? "0.05",
);

/**
 * Default production environments
 */
export const DEFAULT_PROD_ENVS = ["phase-2-mainnet"];
