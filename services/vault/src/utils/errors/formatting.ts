/**
 * Error message formatting utilities
 * Transform errors to user-friendly messages
 */

import {
  JSON_RPC_ERROR_CODES,
  JsonRpcError,
  RpcErrorCode,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

/**
 * Wallet-connector error code emitted by BTC providers when the user rejects
 * a signing prompt. Mirrors `ERROR_CODES.CONNECTION_REJECTED` from
 * `@babylonlabs-io/wallet-connector`. Inlined to avoid pulling the full
 * wallet-connector bundle into this file (and its test transform); the
 * constant is the public contract - if it ever changes upstream, this string
 * must change too.
 */
const WALLET_CONNECTION_REJECTED_CODE = "CONNECTION_REJECTED";

function isWalletRejectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code: unknown }).code === WALLET_CONNECTION_REJECTED_CODE
  );
}

// ETH-side insufficient-funds wording. Deliberately narrower than viem's own
// `/insufficient funds|exceeds transaction sender account balance/` so the
// BTC selector's "Insufficient funds: need N sats" string is not collapsed.
const INSUFFICIENT_GAS_FUNDS_PATTERN =
  /insufficient funds for (gas|transfer)|exceeds transaction sender account balance|exceeds the balance of the account/i;

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
  | "network"; // HttpRequestError / WebSocketRequestError / TimeoutError / RpcRequestError

const FRIENDLY_MESSAGES: Record<ErrorKind, string> = {
  "user-rejection":
    "Transaction rejected in your wallet. No changes were made — try again when you're ready.",
  "insufficient-funds":
    "Not enough ETH to cover the deposit fee and gas. Add ETH to your wallet and try again.",
  "wallet-disconnected":
    "Your wallet was disconnected. Reconnect it and try again.",
  unauthorized:
    "This site isn't authorized in your wallet. Approve the connection and try again.",
  "chain-switch-failed":
    "Couldn't switch your wallet to the required network. Switch chains manually and try again.",
  "receipt-timeout":
    "We couldn't confirm your transaction. Check your wallet or a block explorer for the latest status.",
  network: "Network error. Check your connection and try again.",
};

/**
 * Walk the `.cause` chain looking for a recognised error category. Returns
 * the first match (depth-first, top of chain wins). `null` if no match.
 */
function classifyError(err: unknown): ErrorKind | null {
  let cur: unknown = err;
  for (let depth = 0; depth <= 10 && cur && typeof cur === "object"; depth++) {
    const obj = cur as {
      code?: unknown;
      name?: unknown;
      message?: unknown;
      cause?: unknown;
    };

    // User rejection
    if (obj.code === 4001 || obj.name === "UserRejectedRequestError") {
      return "user-rejection";
    }
    if (isWalletRejectionError(cur)) return "user-rejection";

    // Insufficient ETH for gas + value
    if (obj.name === "InsufficientFundsError") return "insufficient-funds";
    if (
      typeof obj.message === "string" &&
      INSUFFICIENT_GAS_FUNDS_PATTERN.test(obj.message)
    ) {
      return "insufficient-funds";
    }

    // Wallet disconnected from chain / all chains
    if (
      obj.code === 4900 ||
      obj.code === 4901 ||
      obj.name === "ProviderDisconnectedError" ||
      obj.name === "ChainDisconnectedError"
    ) {
      return "wallet-disconnected";
    }

    // Site not authorized in wallet
    if (obj.code === 4100 || obj.name === "UnauthorizedProviderError") {
      return "unauthorized";
    }

    // Wallet refused / failed to switch chain. The deposit flow's wagmi
    // helper catches this locally (ethereumSubmit.ts), but cover the
    // escape path in case it surfaces from elsewhere.
    if (obj.code === 4902 || obj.name === "SwitchChainError") {
      return "chain-switch-failed";
    }

    // Tx accepted but receipt didn't arrive in time
    if (obj.name === "WaitForTransactionReceiptTimeoutError") {
      return "receipt-timeout";
    }

    // RPC / network transport failures
    if (
      obj.name === "HttpRequestError" ||
      obj.name === "WebSocketRequestError" ||
      obj.name === "TimeoutError" ||
      obj.name === "RpcRequestError"
    ) {
      return "network";
    }

    cur = obj.cause;
  }
  return null;
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
    if (error.code === RpcErrorCode.PEGIN_NOT_FOUND) {
      return {
        title: "Vault Provider Syncing",
        message:
          "The vault provider hasn't ingested your peg-in yet. Please wait a moment and try again.",
      };
    }
    if (error.code === JSON_RPC_ERROR_CODES.TIMEOUT) {
      return {
        title: "Request Timeout",
        message:
          "The vault provider took too long to respond. Please try again.",
      };
    }
    // -32001: proxy "Provider not found" (message-specific) vs FE client "Network error" (generic)
    if (
      error.code === JSON_RPC_ERROR_CODES.NETWORK &&
      error.message.toLowerCase().includes("provider not found")
    ) {
      return {
        title: "Provider Not Found",
        message:
          "The vault provider could not be found in the on-chain registry. It may have been deregistered.",
      };
    }
    if (error.code === JSON_RPC_ERROR_CODES.NETWORK) {
      return {
        title: "Connection Failed",
        message:
          "Unable to connect to the vault provider. Please check your connection and try again.",
      };
    }
    // Proxy-specific: VP request timed out at the proxy level
    if (error.code === JSON_RPC_ERROR_CODES.PROXY_TIMEOUT) {
      return {
        title: "Provider Timeout",
        message:
          "The vault provider took too long to respond. Please try again later.",
      };
    }
    // Proxy-specific: VP unreachable, DNS failure, or response too large
    if (error.code === JSON_RPC_ERROR_CODES.PROXY_UNAVAILABLE) {
      return {
        title: "Provider Unavailable",
        message:
          "The vault provider is temporarily unreachable. Please try again later.",
      };
    }
    return {
      title: "Signature Submission Failed",
      message: `The vault provider rejected the request (error code: ${error.code}). Please try again or contact support.`,
    };
  }

  if (isWalletRejectionError(error)) {
    return {
      title: "Signing Rejected",
      message:
        "You rejected the signing request in your wallet. Approve the request to continue, or click Retry to try again.",
    };
  }

  if (error instanceof Error) {
    if (error.message.includes("Vault provider not found")) {
      return {
        title: "Provider Not Found",
        message:
          "The vault provider for this deposit could not be found. Please contact support.",
      };
    }
    if (error.message.includes("BTC wallet not connected")) {
      return {
        title: "Wallet Not Connected",
        message: "Please reconnect your Bitcoin wallet to continue.",
      };
    }
    if (
      error.message.includes("Vault or pegin transaction not found") ||
      error.message.includes("not found on-chain")
    ) {
      return {
        title: "Deposit Not Found",
        message:
          "The deposit transaction could not be found. It may have been processed already.",
      };
    }
    if (error.message.includes("Failed to sign Payout transaction")) {
      return {
        title: "Signing Failed",
        message:
          "Failed to sign the payout transaction. Please try again or reconnect your wallet.",
      };
    }
    if (error.message.includes("Failed to batch sign payout transactions")) {
      return {
        title: "Batch Signing Failed",
        message:
          "Failed to sign payout transactions. Please try again or reconnect your wallet.",
      };
    }
    // Contract call errors (viem) — surface a meaningful message instead of swallowing
    if (error.message.includes("reverted")) {
      return {
        title: "Contract Call Failed",
        message:
          "A contract call failed during payout signing. The on-chain BTC Vault data may be unavailable. Please try again or contact support.",
      };
    }

    return {
      title: "Payout Signing Error",
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
    title: "Payout Signing Error",
    message:
      msg && msg !== "[object Object]"
        ? msg
        : "An unexpected error occurred while signing payouts.",
  };
}
