// Time constants
export const ONE_SECOND = 1000;
export const ONE_MINUTE = 60 * ONE_SECOND;
export const ONE_DAY = 24 * 60 * ONE_MINUTE;

// Polling intervals
export const FAST_POLL_INTERVAL = 15 * ONE_SECOND; // 15 seconds for "Processing" status
export const NORMAL_POLL_INTERVAL = ONE_MINUTE; // 1 minute for other statuses

// Storage constants
export const STORAGE_KEY_PREFIX = "vault-pending-pegins";
export const STORAGE_UPDATE_EVENT = "vault-pending-pegins-updated";
export const MAX_PENDING_DURATION = 24 * 60 * 60 * 1000; // 24 hours - cleanup stale items

// Ethereum constants
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;
export const MAX_UINT256 = 2n ** 256n - 1n;

// Sentry replay sampling rate (5% by default)
export const REPLAYS_ON_ERROR_RATE = Number.parseFloat(
  process.env.NEXT_PUBLIC_REPLAYS_RATE ?? "0.05",
);
