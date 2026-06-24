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

// Pending collateral storage constants
export const PENDING_COLLATERAL_KEY_PREFIX = "vault-pending-collateral";

// Sentry replay sampling rate (5% by default)
export const REPLAYS_ON_ERROR_RATE = Number.parseFloat(
  process.env.NEXT_PUBLIC_REPLAYS_RATE ?? "0.05",
);

// External links surfaced on the pending-withdraw card.
// Support points to the Babylon Discord invite (confirmed).
// TODO(product): swap in the exact withdrawal-latency doc page once confirmed.
export const WITHDRAWAL_LATENCY_DOCS_URL = "https://docs.babylonlabs.io";
export const SUPPORT_URL = "https://discord.com/invite/babylonglobal";

// Two-vault split docs link, surfaced from the split-option description in
// UtxoSplitSelector. Points at the "decide how to split your BTC" step.
export const PARTIAL_LIQUIDATION_DOCS_URL =
  "https://docs.babylonlabs.io/trustless-bitcoin-vault/use-for-lending/create-a-vault/#step-1-decide-how-to-split-your-btc";

// Bitcoin protocol constants
export const BTC_BLOCK_TIME_MINS = 10;
export const MINS_PER_HOUR = 60;
export const MINS_PER_DAY = 1440;
export const FALLBACK_FEE_RATE_SATS_VB = 1;
