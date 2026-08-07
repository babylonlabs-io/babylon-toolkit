/**
 * Detection of user-cancelled wallet prompts.
 *
 * The single definition of "the depositor declined this prompt", used for both
 * decisions that depend on it: what NOT to report to Sentry, and which
 * user-facing copy to render. `classifyError` and `mapDepositError` both call
 * in here rather than carrying their own wording lists, so the two cannot drift
 * apart — they had, and a cancellation that was correctly dropped from
 * telemetry could still surface generic error copy to the depositor.
 *
 * Deliberately dependency-free: `sentry.client.config.ts` imports this at
 * telemetry-init time, and pulling COPY or the SDK in there would put more
 * module-init surface ahead of `Sentry.init` than the report path can afford.
 * Nothing in this module may import from `formatting.ts` or `depositErrors.ts`;
 * the dependency runs the other way.
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
 * wallets express it in several vocabularies (rejected / cancelled / canceled /
 * denied), in both word orders ("user rejected" and "rejected by user"), plus
 * WalletConnect's "Proposal expired" and "User closed modal". The previous bare
 * `includes("rejected")` caught only one of them, which is why cancellations
 * were the single largest category of captured errors.
 *
 * Every alternative requires a wallet-interaction subject rather than the bare
 * verb, so a genuine failure keeps reporting. Two arms are worth spelling out
 * because they are the ones that previously over-matched:
 *
 * - The `rejected the <noun> approval/request` arm is anchored on
 *   `wallet|user|you`. Unanchored it matched any actor rejecting any noun
 *   request, so `The contract rejected the borrow request` and `The node
 *   rejected the signing request` were both suppressed as cancellations.
 * - The `connection to <name> was cancelled` arm bounds the wallet name to at
 *   most three words. With `.+` it spanned unrelated clauses, so
 *   `Connection to indexer failed after the tx was rejected by the network`
 *   matched.
 *
 * Connection *timeouts* are excluded on purpose - those are not user actions
 * and may be real defects.
 *
 * Known residue: `rejected by the wallet` also matches a hardware-wallet
 * *policy* rejection (Ledger with blind signing off), which is a real UX defect
 * worth seeing. The arm is kept because it backs a captured production wording
 * where the user did decline - `borrow from Aave Core position was rejected by
 * the wallet` - and the two are not separable by wording alone. The typed
 * signals below are what carry the coded paths.
 */
const USER_CANCELLATION_PATTERN =
  /(?:user|you) (?:rejected|denied|cancell?ed)|(?:rejected|denied|cancell?ed) by (?:the )?user|rejected by the wallet|(?:wallet|user|you) rejected the \w+ (?:approval|request)|user closed (?:the )?modal|connection (?:cancell?ed|rejected)|connection to \w+(?: \w+){0,2} was (?:cancell?ed|rejected)|denied request signature|proposal expired/i;

/** How far to walk a `cause` chain before giving up. */
const MAX_CAUSE_DEPTH = 10;

/**
 * True when `error` carries the wallet-connector `CONNECTION_REJECTED` code.
 *
 * Lives here rather than in `formatting.ts` so the code constant and the
 * predicate that reads it stay in the same dependency-free module.
 */
export function isWalletRejectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code: unknown }).code === WALLET_CONNECTION_REJECTED_CODE
  );
}

/**
 * True when this single error frame is a user cancellation - typed signals
 * (EIP-1193 4001, viem's `UserRejectedRequestError`, the wallet-connector
 * `CONNECTION_REJECTED` code) first, then wording.
 *
 * Deliberately does NOT walk `cause`. Callers that classify per frame need to
 * decide precedence across frames themselves: `classifyError` is depth-first
 * with the outermost match winning, so a walking predicate there would let an
 * inner cancellation shadow an outer category. Use {@link isUserCancellation}
 * when you want the whole chain.
 */
export function isUserCancellationFrame(frame: unknown): boolean {
  if (typeof frame === "string") return USER_CANCELLATION_PATTERN.test(frame);
  if (!frame || typeof frame !== "object") return false;

  const { code, name, message } = frame as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
  };

  if (code === EIP1193_USER_REJECTED) return true;
  if (code === WALLET_CONNECTION_REJECTED_CODE) return true;
  if (name === "UserRejectedRequestError") return true;
  return typeof message === "string" && USER_CANCELLATION_PATTERN.test(message);
}

/**
 * True when the error - or anything in its `cause` chain - is the user
 * declining or dismissing a wallet prompt.
 */
export function isUserCancellation(error: unknown): boolean {
  let cur: unknown = error;

  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && cur != null; depth++) {
    if (isUserCancellationFrame(cur)) return true;

    // The string check is inside the loop, not only ahead of it: some wallet
    // adapters reject with a bare string, and that string can be the `cause`
    // of a wrapper Error rather than the top-level throw. A `typeof === object`
    // loop guard stopped the walk at the first string cause and missed those.
    if (typeof cur !== "object") return false;

    cur = (cur as { cause?: unknown }).cause;
  }

  return false;
}
