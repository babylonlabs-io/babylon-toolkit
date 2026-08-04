/**
 * Detection of user-cancelled wallet prompts, for deciding what NOT to report.
 *
 * Deliberately dependency-free: `sentry.client.config.ts` imports this at
 * telemetry-init time, and pulling COPY or the SDK in there would put more
 * module-init surface ahead of `Sentry.init` than the report path can afford.
 */

/** EIP-1193 `userRejectedRequest`. */
export const EIP1193_USER_REJECTED = 4001;

/**
 * Wallet-connector error code emitted by BTC providers when the user rejects
 * a signing prompt. Mirrors `ERROR_CODES.CONNECTION_REJECTED` from
 * `@babylonlabs-io/wallet-connector`. Inlined to avoid pulling the full
 * wallet-connector bundle into this file (and its test transform); the
 * constant is the public contract - if it ever changes upstream, this string
 * must change too.
 */
export const WALLET_CONNECTION_REJECTED_CODE = "CONNECTION_REJECTED";

/**
 * Wallet cancellation wording.
 *
 * A depositor closing a wallet popup is routine drop-off, not a fault, but
 * wallets express it in at least four vocabularies (rejected / cancelled /
 * canceled / denied) plus WalletConnect's "Proposal expired". The previous
 * bare `includes("rejected")` caught only one of them, which is why
 * cancellations were the single largest category of captured errors.
 *
 * Deliberately narrow: each alternative anchors on wallet-interaction phrasing
 * rather than the bare word, so a genuine failure like "transaction was
 * rejected by the node" is still reported. Connection *timeouts* are excluded
 * on purpose - those are not user actions and may be real defects.
 */
const USER_CANCELLATION_PATTERN =
  /user (?:rejected|denied|cancell?ed)|rejected by the wallet|rejected the \w+ (?:approval|request)|connection (?:cancell?ed|rejected)|connection to .+ was (?:cancell?ed|rejected)|denied request signature|proposal expired/i;

/** How far to walk a `cause` chain before giving up. */
const MAX_CAUSE_DEPTH = 10;

/**
 * True when the error is the user declining or dismissing a wallet prompt.
 * Checks the typed signals first (EIP-1193 4001, viem's
 * `UserRejectedRequestError`, the wallet-connector `CONNECTION_REJECTED`
 * code), then falls back to wording for the wallets that only throw strings.
 */
export function isUserCancellation(error: unknown): boolean {
  // Some wallet adapters reject with a bare string rather than an Error.
  if (typeof error === "string") return USER_CANCELLATION_PATTERN.test(error);

  let cur: unknown = error;

  for (
    let depth = 0;
    depth <= MAX_CAUSE_DEPTH && cur && typeof cur === "object";
    depth++
  ) {
    const { code, name, message, cause } = cur as {
      code?: unknown;
      name?: unknown;
      message?: unknown;
      cause?: unknown;
    };

    if (code === EIP1193_USER_REJECTED) return true;
    if (code === WALLET_CONNECTION_REJECTED_CODE) return true;
    if (name === "UserRejectedRequestError") return true;
    if (
      typeof message === "string" &&
      USER_CANCELLATION_PATTERN.test(message)
    ) {
      return true;
    }

    cur = cause;
  }

  return false;
}
