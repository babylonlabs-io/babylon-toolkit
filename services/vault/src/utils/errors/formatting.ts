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

function matchesInsufficientGasFundsMessage(msg: string): boolean {
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
  | "network" // HttpRequestError / WebSocketRequestError / TimeoutError / RpcRequestError
  | "stale-deploy"; // Vite dynamic-import 404 after redeploy

const FRIENDLY_MESSAGES: Record<ErrorKind, string> = {
  "user-rejection": COPY.common.classifiedErrors.userRejection,
  "insufficient-funds": COPY.common.classifiedErrors.insufficientFunds,
  "wallet-disconnected": COPY.common.classifiedErrors.walletDisconnected,
  unauthorized: COPY.common.classifiedErrors.unauthorized,
  "chain-switch-failed": COPY.common.classifiedErrors.chainSwitchFailed,
  "receipt-timeout": COPY.common.classifiedErrors.receiptTimeout,
  network: COPY.common.classifiedErrors.network,
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

    // RPC / network transport failures.
    //
    // `RpcRequestError` is a special case: viem also uses it to wrap
    // node-level errors that carry contract-revert data (the node returns
    // `{ code: 3, data: "0x..." }`, viem forwards it on the wrapper's
    // `.data` field). Those aren't transport failures and should fall
    // through so the underlying revert message bubbles up.
    if (obj.name === "RpcRequestError" && isViemShape(obj)) {
      const data = (obj as { data?: unknown }).data;
      if (typeof data === "string" && data.startsWith("0x")) {
        // Contract revert dressed as RPC error — don't classify as network.
        cur = obj.cause;
        continue;
      }
      return "network";
    }
    // `HttpRequestError` / `WebSocketRequestError` names are viem-specific
    // enough not to collide; `TimeoutError` is generic (AbortSignal.timeout,
    // `ky`, DOM APIs) and must be gated on viem shape.
    if (
      obj.name === "HttpRequestError" ||
      obj.name === "WebSocketRequestError"
    ) {
      return "network";
    }
    if (obj.name === "TimeoutError" && isViemShape(obj)) {
      return "network";
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
  // -32001: proxy "Provider not found" (message-specific) vs FE client "Network error" (generic)
  if (
    error.code === JSON_RPC_ERROR_CODES.NETWORK &&
    error.message.toLowerCase().includes("provider not found")
  ) {
    return vp.providerNotFound;
  }
  if (error.code === JSON_RPC_ERROR_CODES.NETWORK) {
    return vp.connectionFailed;
  }
  // Proxy-specific: VP request timed out at the proxy level
  if (error.code === JSON_RPC_ERROR_CODES.PROXY_TIMEOUT) {
    return vp.providerTimeout;
  }
  // Proxy-specific: VP unreachable, DNS failure, or response too large
  if (error.code === JSON_RPC_ERROR_CODES.PROXY_UNAVAILABLE) {
    return vp.providerUnavailable;
  }
  return {
    title: vp.rejected.title,
    message: vp.rejected.message(error.code),
  };
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
    if (
      error.message.includes("Vault or pegin transaction not found") ||
      error.message.includes("not found on-chain")
    ) {
      return {
        title: "Deposit not found",
        message:
          "The deposit transaction could not be found. It may have been processed already.",
      };
    }
    if (error.message.includes("Failed to sign Payout transaction")) {
      return {
        title: "Signing failed",
        message:
          "Failed to sign the payout transaction. Please try again or reconnect your wallet.",
      };
    }
    if (error.message.includes("Failed to batch sign payout transactions")) {
      return {
        title: "Batch signing failed",
        message:
          "Failed to sign payout transactions. Please try again or reconnect your wallet.",
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
