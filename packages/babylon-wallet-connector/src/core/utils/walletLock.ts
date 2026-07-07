/**
 * Interval between non-interactive lock-detection polls while the tab is
 * visible. Injected BTC extensions (notably UniSat) re-lock on an idle timer
 * and emit no event, so a cached session keeps reporting `connected`/`address`
 * indefinitely. A short interval surfaces the lock proactively without waiting
 * for the user to attempt a signing call. The probe is a cheap, non-network
 * extension round-trip (`getAccounts`), so polling this often is inexpensive;
 * the poll also fires immediately on tab focus / visibility, making this value
 * a backstop for the idle-but-visible case rather than the primary trigger.
 */
export const BTC_WALLET_LOCK_POLL_INTERVAL_MS = 10_000;

/**
 * Whether a non-interactive accounts read indicates a locked (or
 * de-authorized) BTC wallet.
 *
 * UniSat returns an empty array from `getAccounts()` when the wallet is locked
 * — without surfacing the unlock popup — while a stale cached `getAddress()`
 * still reports the last-known address. An empty list is therefore the
 * silent-lock signal. A non-array, or an array carrying no usable string
 * address (a malformed response), is also treated as locked: a wallet that
 * stops reporting a valid account should be surfaced to the user, not silently
 * hidden. (OKX and OneKey are deliberately not polled — their non-interactive
 * accounts read isn't a reliable lock signal; see their providers.)
 */
export function areBtcAccountsLocked(accounts: unknown): boolean {
  if (!Array.isArray(accounts)) return true;
  return !accounts.some((entry) => typeof entry === "string" && entry.length > 0);
}

/**
 * Classification of a non-interactive accounts read taken on tab focus /
 * visibility, used to decide how the visibility check should react WITHOUT
 * firing the interactive `connectWallet()` (which would surface an unlock
 * popup on a locked wallet and, on rejection, escalate to a disconnect):
 *
 * - `"locked"`  — empty / malformed: the wallet is locked or de-authorized.
 *                 Flag it (show the unlock banner); do not prompt or disconnect.
 * - `"current"` — the cached address is still among the live accounts: nothing
 *                 changed, so the interactive round-trip can be skipped entirely.
 * - `"changed"` — accounts are present but the cached address is gone: the user
 *                 switched accounts, so fall through to the interactive refresh.
 */
export type BtcAccountsProbe = "locked" | "current" | "changed";

export function classifyBtcAccountsProbe(
  accounts: unknown,
  cachedAddress: string,
): BtcAccountsProbe {
  if (areBtcAccountsLocked(accounts)) return "locked";
  // `areBtcAccountsLocked` guarantees an array with at least one usable string;
  // narrow to string entries so a wallet that returns account descriptors (or
  // other non-string shapes) can't slip past `includes` and be misread as a
  // spurious account change.
  const addresses = (accounts as unknown[]).filter(
    (entry): entry is string => typeof entry === "string",
  );
  return addresses.includes(cachedAddress) ? "current" : "changed";
}
