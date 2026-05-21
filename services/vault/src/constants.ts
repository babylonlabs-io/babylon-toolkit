// Time constants
const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;

// Polling intervals
export const FAST_POLL_INTERVAL = 15 * ONE_SECOND; // 15 seconds for "Processing" status
export const NORMAL_POLL_INTERVAL = ONE_MINUTE; // 1 minute for other statuses

// Storage constants
export const STORAGE_KEY_PREFIX = "vault-pending-pegins";
export const STORAGE_UPDATE_EVENT = "vault-pending-pegins-updated";
export const MAX_PENDING_DURATION = 24 * 60 * 60 * 1000; // 24 hours - cleanup stale items

// UTXO reservation constants (early reservation before ETH registration)
export const UTXO_RESERVATION_KEY_PREFIX = "vault-utxo-reservations";
export const UTXO_RESERVATION_TTL = 5 * ONE_MINUTE; // 5 minutes — auto-expire stale reservations from crashed tabs

// Pending collateral storage constants
export const PENDING_COLLATERAL_KEY_PREFIX = "vault-pending-collateral";

// Sentry replay sampling rate (5% by default)
export const REPLAYS_ON_ERROR_RATE = Number.parseFloat(
  process.env.NEXT_PUBLIC_REPLAYS_RATE ?? "0.05",
);

// Bitcoin protocol constants
export const BTC_BLOCK_TIME_MINS = 10;
export const MINS_PER_HOUR = 60;
export const FALLBACK_FEE_RATE_SATS_VB = 1;
