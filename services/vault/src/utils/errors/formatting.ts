/**
 * Error message formatting utilities
 * Transform errors to user-friendly messages
 */

import {
  JSON_RPC_ERROR_CODES,
  JsonRpcError,
  RpcErrorCode,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { COPY } from "@/copy";

/**
 * Wallet-connector error code emitted by BTC providers when the user rejects
 * a signing prompt. Mirrors `ERROR_CODES.CONNECTION_REJECTED` from
 * `@babylonlabs-io/wallet-connector`. Inlined to avoid pulling the full
 * wallet-connector bundle into this file (and its test transform); the
 * constant is the public contract - if it ever changes upstream, this string
 * must change too.
 */
const WALLET_CONNECTION_REJECTED_CODE = "CONNECTION_REJECTED";

export function isWalletRejectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code: unknown }).code === WALLET_CONNECTION_REJECTED_CODE
  );
}

/** EIP-1193 provider error codes used by the classifier below. */
const EIP1193 = {
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  PROVIDER_DISCONNECTED: 4900,
  CHAIN_DISCONNECTED: 4901,
  CHAIN_SWITCH_FAILED: 4902,
} as const;

/** viem `ExecutionRevertedError.code` — a node revert even without `0x` data. */
const EXECUTION_REVERTED_RPC_CODE = 3;

// viem `NonceTooLowError.nodeMessage`: the tx is already in the mempool (or
// mined), so a retry just re-sends and reproduces it. Raw providers surface
// this unwrapped, so match the message as well as the viem class name.
const ALREADY_SUBMITTED_PATTERN =
  /nonce too low|transaction already imported|already known/i;

// ETH-side insufficient-funds wording. Mirrors viem's own
// `InsufficientFundsError.nodeMessage` regex; callers must first filter out
// the BTC selector's "Insufficient funds: need N sats" via the sats/pegin
// guard below.
const INSUFFICIENT_GAS_FUNDS_PATTERN =
  /insufficient funds|exceeds transaction sender account balance|exceeds the balance of the account/i;

// BTC-side selectUtxosForPegin produces "Insufficient funds: need N sats
// (X pegin + Y fee), have Z sats" — exclude it from the ETH match so we
// don't collapse the sats info the user needs.
const BTC_FUNDS_GUARD_PATTERN = /\bsats\b|\bpegin\b/i;

// revm's `HaltReason::OutOfFunds` — "Out of funds to pay for the call"
// (revm crates/context/interface/src/result.rs) — reaches us through the
// Babylon EVM RPC as `Details: EVM error: OutOfFunds` on eth_estimateGas.
// It means the sender can't cover value + gas, but shares no wording with the
// geth-style messages above, so without this it classifies as a transient
// `rpc-error` and the user is told to wait and retry. Kept out of
// `matchesInsufficientGasFundsMessage` because the BTC sats guard is
// irrelevant here — this string never appears in the UTXO selector's error.
const EVM_OUT_OF_FUNDS_PATTERN = /\bout ?of ?funds?\b/i;

export function matchesInsufficientGasFundsMessage(msg: string): boolean {
  if (BTC_FUNDS_GUARD_PATTERN.test(msg)) return false;
  return INSUFFICIENT_GAS_FUNDS_PATTERN.test(msg);
}

// Browser-emitted error strings when a dynamically-imported Vite chunk
// 404s (common after a redeploy invalidates the old chunk hashes).
// Chrome/Edge string confirmed in the wild; Firefox/Safari strings are
// from Vite's documented community patterns.
const STALE_DEPLOY_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

/**
 * `"TimeoutError"` and `"RpcRequestError"` are generic names that collide
 * with `AbortSignal.timeout()`, the `ky` HTTP library, and others. Require
 * a viem-shape signal (its `BaseError.walk` method) before treating those
 * by name alone.
 */
function isViemShape(obj: { walk?: unknown }): boolean {
  return typeof obj.walk === "function";
}

/**
 * Recognised error categories. Names mirror viem's class names where
 * applicable; codes are EIP-1193. Verified against viem 2.38.2 source in
 * `node_modules/viem/_esm/errors/{rpc,node,transaction,request}.js`.
 */
type ErrorKind =
  | "user-rejection" // EIP-1193 4001 / viem UserRejectedRequestError / wallet CONNECTION_REJECTED
  | "insufficient-funds" // viem InsufficientFundsError (gas * fee + value > balance)
  | "wallet-disconnected" // EIP-1193 4900/4901 / Provider+ChainDisconnectedError
  | "unauthorized" // EIP-1193 4100 / UnauthorizedProviderError
  | "chain-switch-failed" // EIP-1193 4902 / viem SwitchChainError
  | "receipt-timeout" // viem WaitForTransactionReceiptTimeoutError
  | "network" // transport failure: HttpRequestError / WebSocketRequestError / SocketClosedError / viem TimeoutError
  | "rpc-error" // node/provider JSON-RPC failure via RpcRequestError — not the user's connection
  | "already-submitted" // nonce-too-low / "already known" — the tx is already in the mempool
  | "stale-deploy"; // Vite dynamic-import 404 after redeploy

const FRIENDLY_MESSAGES: Record<ErrorKind, string> = {
  "user-rejection": COPY.common.classifiedErrors.userRejection,
  "insufficient-funds": COPY.common.classifiedErrors.insufficientFunds,
  "wallet-disconnected": COPY.common.classifiedErrors.walletDisconnected,
  unauthorized: COPY.common.classifiedErrors.unauthorized,
  "chain-switch-failed": COPY.common.classifiedErrors.chainSwitchFailed,
  "receipt-timeout": COPY.common.classifiedErrors.receiptTimeout,
  network: COPY.common.classifiedErrors.network,
  "rpc-error": COPY.common.classifiedErrors.rpcError,
  "already-submitted": COPY.common.classifiedErrors.alreadySubmitted,
  "stale-deploy": COPY.common.classifiedErrors.staleDeploy,
};

/**
 * Walk the `.cause` chain looking for a recognised error category. Returns
 * the first match (depth-first, top of chain wins). `null` if no match.
 *
 * Two precedence properties are load-bearing:
 *  (a) Within a frame: user-rejection is checked first, so it wins over
 *      every other category at the same depth. New broad checks (e.g.
 *      message-substring matches) must stay below the user-rejection block,
 *      otherwise an inner `UserRejectedRequestError` shadowed by an outer
 *      broad match would silently surface as the outer category's copy.
 *  (b) Across frames: depth-first, outermost match wins. The walker returns
 *      on the first hit and never inspects deeper causes once a frame
 *      classifies.
 */
export function classifyError(err: unknown): ErrorKind | null {
  let cur: unknown = err;
  for (let depth = 0; depth <= 10 && cur && typeof cur === "object"; depth++) {
    const obj = cur as {
      code?: unknown;
      name?: unknown;
      message?: unknown;
      cause?: unknown;
      walk?: unknown;
    };

    // User rejection — MUST stay first within the frame; see precedence (a).
    if (
      obj.code === EIP1193.USER_REJECTED ||
      obj.name === "UserRejectedRequestError"
    ) {
      return "user-rejection";
    }
    if (isWalletRejectionError(cur)) return "user-rejection";

    // Insufficient ETH for gas + value
    if (obj.name === "InsufficientFundsError") return "insufficient-funds";
    if (
      typeof obj.message === "string" &&
      matchesInsufficientGasFundsMessage(obj.message)
    ) {
      return "insufficient-funds";
    }
    if (
      typeof obj.message === "string" &&
      EVM_OUT_OF_FUNDS_PATTERN.test(obj.message)
    ) {
      return "insufficient-funds";
    }

    // Wallet disconnected from chain / all chains
    if (
      obj.code === EIP1193.PROVIDER_DISCONNECTED ||
      obj.code === EIP1193.CHAIN_DISCONNECTED ||
      obj.name === "ProviderDisconnectedError" ||
      obj.name === "ChainDisconnectedError"
    ) {
      return "wallet-disconnected";
    }

    // Site not authorized in wallet
    if (
      obj.code === EIP1193.UNAUTHORIZED ||
      obj.name === "UnauthorizedProviderError"
    ) {
      return "unauthorized";
    }

    // Wallet refused / failed to switch chain. The deposit flow's wagmi
    // helper catches this locally (ethereumSubmit.ts), but cover the
    // escape path in case it surfaces from elsewhere.
    if (
      obj.code === EIP1193.CHAIN_SWITCH_FAILED ||
      obj.name === "SwitchChainError"
    ) {
      return "chain-switch-failed";
    }

    // Tx accepted but receipt didn't arrive in time
    if (obj.name === "WaitForTransactionReceiptTimeoutError") {
      return "receipt-timeout";
    }

    // Nonce-too-low / "already known" — the tx is already in the mempool (or
    // mined). "Retry" would re-send and reproduce it, so point the user at
    // their wallet / an explorer. viem folds these into NonceTooLowError; raw
    // providers surface the message unwrapped. (NonceTooHigh is a gap, not a
    // duplicate, so it stays in the generic rpc-error retry bucket.)
    if (
      obj.name === "NonceTooLowError" ||
      (typeof obj.message === "string" &&
        ALREADY_SUBMITTED_PATTERN.test(obj.message))
    ) {
      return "already-submitted";
    }

    // Transport failures — "check your connection" is only honest here.
    //
    // `HttpRequestError` covers TWO cases (viem `utils/rpc/http`): with a
    // numeric `status` the server DID answer (429 rate limit, 5xx outage) —
    // a provider problem, not the user's connection — so route those to
    // `rpc-error`. A status-less HttpRequestError (fetch threw) is a real
    // transport failure. Since the app wires `http()` exclusively, a
    // provider 429/503 is the most likely RPC failure a depositor hits.
    if (obj.name === "HttpRequestError") {
      return typeof (obj as { status?: unknown }).status === "number"
        ? "rpc-error"
        : "network";
    }
    // `WebSocketRequestError` / `SocketClosedError` are genuine transport
    // failures; the names are viem-specific enough not to collide.
    // `SocketClosedError` is forward-looking — the app wires `http()` today,
    // so it only becomes reachable if a WS transport lands later.
    if (
      obj.name === "WebSocketRequestError" ||
      obj.name === "SocketClosedError"
    ) {
      return "network";
    }
    // `TimeoutError` is generic (AbortSignal.timeout, `ky`, DOM APIs) — gate
    // on viem shape.
    if (obj.name === "TimeoutError" && isViemShape(obj)) {
      return "network";
    }

    // `RpcRequestError` wraps a JSON-RPC error the node/provider returned:
    // rate limit (-32005), resource unavailable (-32002), tx rejected
    // (-32003), internal (-32603), and node-execution errors (nonce /
    // "already known") whose inner frame is an RpcRequestError. None of
    // these are the user's connection, so they get their own copy — never
    // "check your connection".
    //
    // Exception: viem also reuses `RpcRequestError` to carry contract reverts.
    // A `0x` payload is a revert; so is `code === 3` even when the provider
    // returns no revert data (some don't). Either is a real revert, not an
    // RPC failure — fall through so the underlying reason bubbles up.
    if (obj.name === "RpcRequestError" && isViemShape(obj)) {
      const data = (obj as { data?: unknown }).data;
      if (
        (typeof data === "string" && data.startsWith("0x")) ||
        obj.code === EXECUTION_REVERTED_RPC_CODE
      ) {
        cur = obj.cause;
        continue;
      }
      return "rpc-error";
    }

    // Vite chunk 404 after a redeploy — the underlying error is a browser
    // TypeError, so match on the message rather than a class name.
    if (
      typeof obj.message === "string" &&
      STALE_DEPLOY_PATTERN.test(obj.message)
    ) {
      return "stale-deploy";
    }

    cur = obj.cause;
  }
  return null;
}

/**
 * Map a vault-provider JSON-RPC error to a user-friendly title + message.
 * Shared by `formatPayoutSignatureError` and the deposit-flow error mapper so
 * the VP error copy stays in one place.
 */
export function mapVpRpcError(error: JsonRpcError): {
  title: string;
  message: string;
} {
  const vp = COPY.deposit.errors.vp;
  if (error.code === RpcErrorCode.PEGIN_NOT_FOUND) {
    return vp.syncing;
  }
  if (error.code === JSON_RPC_ERROR_CODES.TIMEOUT) {
    return vp.requestTimeout;
  }
  // -32001 has three distinct producers. `source` separates the SDK's own
  // network failure (always "local") from the two wire producers; the
  // proxy's single -32001 emitter has one fixed message ("Provider not
  // found"), so anything else arriving over the wire is the daemon
  // rejecting our bearer.
  if (error.code === JSON_RPC_ERROR_CODES.NETWORK) {
    if (error.source !== "wire") {
      return vp.connectionFailed;
    }
    if (error.message.toLowerCase().includes("provider not found")) {
      return vp.providerNotFound;
    }
    return vp.sessionExpired;
  }
  // -32002 / -32003 collide the same way, but undecidably: the proxy sends
  // them for transport failures and the daemon sends them for NonceReplay /
  // UnauthorizedCaller during token issuance, both over the wire and with
  // free-form messages. The proxy's meanings are the common case, so they
  // stay — disambiguating would mean matching message text, which is the
  // classification bug this mapping just stopped doing.
  if (error.code === JSON_RPC_ERROR_CODES.PROXY_TIMEOUT) {
    return vp.providerTimeout;
  }
  if (error.code === JSON_RPC_ERROR_CODES.PROXY_UNAVAILABLE) {
    return vp.providerUnavailable;
  }
  return {
    title: vp.rejected.title,
    message: vp.rejected.message(error.code),
  };
}

/**
 * viem builds `Error.message` by joining `shortMessage`, `metaMessages`, a docs
 * link and `details` (viem `errors/base.ts`). `metaMessages` is the request
 * dump — `TransactionExecutionError` puts "Request Arguments:" with the full
 * calldata there — while `details` carries the node's own text. Read the parts
 * so the user sees the diagnosis without the hex.
 */
function readViemMessage(err: unknown): string | null {
  if (err === null || typeof err !== "object") return null;
  // viem's BaseError constructor defines all three of these, so requiring them
  // together keeps an unrelated SDK error that merely carries a `shortMessage`
  // from having its own (possibly richer) `message` discarded.
  if (
    !("shortMessage" in err) ||
    !("details" in err) ||
    !("metaMessages" in err)
  ) {
    return null;
  }
  const { shortMessage, details, code } = err as {
    shortMessage?: unknown;
    details?: unknown;
    code?: unknown;
  };
  if (typeof shortMessage !== "string" || !shortMessage) return null;

  const parts = [shortMessage];
  if (
    typeof details === "string" &&
    details &&
    !shortMessage.includes(details)
  ) {
    parts.push(details);
  }
  if (typeof code === "number" && Number.isFinite(code)) {
    parts.push(`(code ${code})`);
  }
  return parts.join(" ");
}

/** Upper bound on copied diagnostics; viem messages can run to many KB. */
const MAX_DIAGNOSTICS_CHARS = 4000;

/**
 * The full error text for the "copy details" affordance — everything
 * {@link sanitizeErrorMessage} deliberately withholds from the UI, including
 * viem's request dump, so a reporter can paste one block instead of a
 * screenshot.
 */
export function formatErrorDiagnostics(err: unknown): string {
  if (typeof err === "string") return clampDiagnostics(err);
  if (!(err instanceof Error)) return clampDiagnostics(stringifyUnknown(err));

  const { shortMessage, details, code } = err as {
    shortMessage?: unknown;
    details?: unknown;
    code?: unknown;
  };
  // Summary first, raw message last: viem puts the request dump ahead of
  // `details`, so clamping the raw text alone would drop the very fields a
  // triager reads.
  const summary = [`name: ${err.name}`];
  if (typeof shortMessage === "string" && shortMessage) {
    summary.push(`shortMessage: ${shortMessage}`);
  }
  if (typeof details === "string" && details) {
    summary.push(`details: ${details}`);
  }
  if (typeof code === "number" || typeof code === "string") {
    summary.push(`code: ${code}`);
  }

  return clampDiagnostics([...summary, "", err.message].join("\n"));
}

function stringifyUnknown(err: unknown): string {
  try {
    // JSON.stringify returns undefined for undefined, functions and symbols.
    return JSON.stringify(err) ?? String(err);
  } catch {
    // Circular or otherwise unserializable — String() still identifies it.
    return String(err);
  }
}

function clampDiagnostics(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_DIAGNOSTICS_CHARS
    ? `${trimmed.slice(0, MAX_DIAGNOSTICS_CHARS - 1)}…`
    : trimmed;
}

/**
 * Extract a safe error message from an unknown error value.
 *
 * Known viem / EIP-1193 / wallet-connector failure categories collapse to a
 * single friendly sentence — viem's raw messages dump the full request
 * payload including calldata, RPC URLs, and other noise that's useless and
 * alarming to the user.
 *
 * Falls back to "Unknown error" for empty messages and for the literal
 * "[object Object]" — the latter shows up when upstream code wrapped a
 * plain object via template-literal interpolation.
 */
export function sanitizeErrorMessage(err: unknown): string {
  const kind = classifyError(err);
  if (kind) return FRIENDLY_MESSAGES[kind];
  const viemMessage = readViemMessage(err);
  if (viemMessage) return viemMessage;
  if (err instanceof Error) {
    return err.message && err.message !== "[object Object]"
      ? err.message
      : "Unknown error";
  }
  if (typeof err === "string") {
    return err && err !== "[object Object]" ? err : "Unknown error";
  }
  if (
    err !== null &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    const m = (err as { message: string }).message;
    if (m && m !== "[object Object]") return m;
  }
  return "Unknown error";
}

/**
 * Transform error to user-friendly message
 * @param error - Raw error
 * @returns User-friendly error message
 */
export function formatErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    if (error.message.includes("insufficient")) {
      return "Insufficient balance for this transaction";
    }
    if (error.message.includes("rejected")) {
      return "Transaction was rejected";
    }
    if (error.message.includes("timeout")) {
      return "Request timed out. Please try again";
    }

    return error.message;
  }

  return "An unexpected error occurred";
}

/**
 * Format payout signature errors with user-friendly messages
 */
export function formatPayoutSignatureError(error: unknown): {
  title: string;
  message: string;
} {
  if (error instanceof JsonRpcError) {
    return mapVpRpcError(error);
  }

  if (isWalletRejectionError(error)) {
    return {
      title: "Signing rejected",
      message:
        "You rejected the signing request in your wallet. Approve the request to continue, or click Retry to try again.",
    };
  }

  if (error instanceof Error) {
    if (error.message.includes("Vault provider not found")) {
      return {
        title: "Vault provider not found",
        message:
          "The vault provider for this deposit could not be found. Please contact support.",
      };
    }
    if (error.message.includes("BTC wallet not connected")) {
      return {
        title: "Wallet not connected",
        message: "Please reconnect your Bitcoin wallet to continue.",
      };
    }
    // Produced by the registry reader: "Vault <id> not found on-chain or has
    // no pegin transaction".
    if (error.message.includes("not found on-chain")) {
      return {
        title: "Deposit not found",
        message:
          "The deposit transaction could not be found. It may have been processed already.",
      };
    }
    // Contract call errors (viem) — surface a meaningful message instead of swallowing
    if (error.message.includes("reverted")) {
      return {
        title: "Contract call failed",
        message:
          "A contract call failed during payout signing. The on-chain BTC Vault data may be unavailable. Please try again or contact support.",
      };
    }

    return {
      title: "Payout signing error",
      message:
        "An unexpected error occurred while signing payouts. Please try again or contact support.",
    };
  }

  // WASM panics and some wallet providers throw strings or plain objects.
  // Extract a real string — never let `String(plainObject)` surface as
  // "[object Object]" in the UI.
  let msg = "";
  if (typeof error === "string") {
    msg = error;
  } else if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    msg = (error as { message: string }).message;
  }
  return {
    title: "Payout signing error",
    message:
      msg && msg !== "[object Object]"
        ? msg
        : "An unexpected error occurred while signing payouts.",
  };
}
