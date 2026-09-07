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

// External links surfaced on the pending-withdraw card.
// Support points to the Babylon Discord invite (confirmed).
// TODO(product): swap in the exact withdrawal-latency doc page once confirmed.
export const WITHDRAWAL_LATENCY_DOCS_URL = "https://docs.babylonlabs.io";
export const SUPPORT_URL = "https://discord.com/invite/babylonglobal";

// Two-vault split docs link, surfaced from the split-option description in
// UtxoSplitSelector. Points at the "decide how to split your BTC" step.
export const TWO_VAULT_SPLIT_DOCS_URL =
  "https://docs.babylonlabs.io/trustless-bitcoin-vault/use-for-lending/create-a-vault/#step-1-decide-how-to-split-your-btc";

// Vault provider docs link, surfaced from the v3 provider picker intro. Null
// until the exact "learn about / create your own vault provider" page exists;
// the picker hides the link (and its clause) while this is null rather than
// pointing the "create your own" copy at a placeholder page.
// TODO(product): set the real vault-provider docs URL, then the link renders.
export const VAULT_PROVIDER_DOCS_URL: string | null = null;

// Bitcoin protocol constants
export const BTC_BLOCK_TIME_MINS = 10;
export const MINS_PER_HOUR = 60;
export const MINS_PER_DAY = 1440;
export const FALLBACK_FEE_RATE_SATS_VB = 1;

// Bitcoin's default minimum relay fee. Anything below this is not forwarded by
// most nodes, so a pre-pegin funded at a lower rate would never broadcast.
export const MIN_RELAY_FEE_RATE_SATS_VB = 1;
