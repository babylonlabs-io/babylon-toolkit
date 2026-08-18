/**
 * Tests for error formatting utilities
 */

import {
  JsonRpcError,
  RpcErrorCode,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  EstimateGasExecutionError,
  HttpRequestError,
  InsufficientFundsError,
  RpcRequestError,
  TransactionRejectedRpcError,
  UserRejectedRequestError,
} from "viem";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import {
  formatErrorDiagnostics,
  formatErrorMessage,
  formatPayoutSignatureError,
  mapVpRpcError,
  sanitizeErrorMessage,
} from "../formatting";

class FakeWalletError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

describe("Error Formatting", () => {
  describe("formatErrorMessage", () => {
    it("should handle string errors", () => {
      expect(formatErrorMessage("Test error")).toBe("Test error");
    });

    it("should handle Error objects", () => {
      const error = new Error("Test error message");
      expect(formatErrorMessage(error)).toBe("Test error message");
    });

    it("should transform specific error messages", () => {
      const insufficientError = new Error("insufficient funds for transaction");
      expect(formatErrorMessage(insufficientError)).toBe(
        "Insufficient balance for this transaction",
      );

      const rejectedError = new Error("User rejected the request");
      expect(formatErrorMessage(rejectedError)).toBe(
        "Transaction was rejected",
      );

      const timeoutError = new Error("Request timeout exceeded");
      expect(formatErrorMessage(timeoutError)).toBe(
        "Request timed out. Please try again",
      );
    });

    it("should handle unknown error types", () => {
      expect(formatErrorMessage(null)).toBe("An unexpected error occurred");
      expect(formatErrorMessage(undefined)).toBe(
        "An unexpected error occurred",
      );
      expect(formatErrorMessage(123)).toBe("An unexpected error occurred");
      expect(formatErrorMessage({})).toBe("An unexpected error occurred");
    });

    it("should preserve original message for unrecognized errors", () => {
      const customError = new Error("Custom error message");
      expect(formatErrorMessage(customError)).toBe("Custom error message");
    });
  });

  describe("sanitizeErrorMessage", () => {
    it("extracts message from Error instances", () => {
      expect(sanitizeErrorMessage(new Error("some error"))).toBe("some error");
    });

    it("returns string errors as-is", () => {
      expect(sanitizeErrorMessage("a string error")).toBe("a string error");
    });

    it("omits viem's request dump and keeps the node's detail and code", () => {
      // Shape of viem's TransactionExecutionError: the calldata lives in
      // `metaMessages`, which `message` concatenates but the user must not see.
      const err = Object.assign(
        new Error(
          "An unknown RPC error occurred.\n\nRequest Arguments:\n  chain: Sepolia (id: 11155111)\n  data: 0x68d177ac0000000000000000\n\nDetails: header not found",
        ),
        {
          shortMessage: "An unknown RPC error occurred.",
          details: "header not found",
          metaMessages: ["Request Arguments:", "  data: 0x68d177ac000000"],
          code: -32000,
        },
      );

      const message = sanitizeErrorMessage(err);

      expect(message).toBe(
        "An unknown RPC error occurred. header not found (code -32000)",
      );
      expect(message).not.toContain("0x68d177ac");
      expect(message).not.toContain("Request Arguments");
    });

    it("does not repeat details already contained in the short message", () => {
      const err = Object.assign(new Error("ignored"), {
        shortMessage: "Execution reverted: insufficient balance.",
        details: "insufficient balance",
        metaMessages: undefined,
      });

      expect(sanitizeErrorMessage(err)).toBe(
        "Execution reverted: insufficient balance.",
      );
    });

    it("reads a real captured Babylon testnet estimateGas failure as insufficient ETH", () => {
      // Rebuilt from a console capture (viem@2.38.2) with the real viem
      // classes so the shape can't drift: EstimateGasExecutionError →
      // TransactionRejectedRpcError → RpcRequestError, carrying
      // `Details: EVM error: OutOfFunds`. revm's HaltReason::OutOfFunds means
      // "out of funds to pay for the call", so this must not read as a
      // transient RPC blip the user should wait out.
      const calldata: `0x${string}` = `0x68d177ac${"00".repeat(1600)}`;
      const rpc = new RpcRequestError({
        body: { method: "eth_estimateGas", params: [{ data: calldata }] },
        error: { code: -32003, message: "EVM error: OutOfFunds" },
        url: "https://eth-rpc-dapp.testnet.babylonlabs.io",
      });
      const err = new EstimateGasExecutionError(
        new TransactionRejectedRpcError(rpc),
        {
          account: {
            address: "0x6E5D5AEFf3850940A6F15c4835521F5C56E38555",
          } as never,
          to: "0xE976a4f2B90E64A9A9374453bC526e67625cC750",
          value: 10000000000000002n,
          data: calldata,
        },
      );

      // The raw message is thousands of characters of request dump.
      expect(err.message.length).toBeGreaterThan(3000);
      expect(sanitizeErrorMessage(err)).toMatch(/Not enough ETH/);
    });

    it("keeps the full message of a non-viem error that carries a shortMessage", () => {
      // Only viem's BaseError shape (shortMessage + details + metaMessages)
      // gets trimmed; anything else keeps whatever context it wrote.
      const err = Object.assign(new Error("Vault X failed because of Y"), {
        shortMessage: "Request failed",
      });

      expect(sanitizeErrorMessage(err)).toBe("Vault X failed because of Y");
    });

    it("returns 'Unknown error' for non-Error objects without string message", () => {
      expect(sanitizeErrorMessage({ key: "value" })).toBe("Unknown error");
      expect(sanitizeErrorMessage(42)).toBe("Unknown error");
      expect(sanitizeErrorMessage(null)).toBe("Unknown error");
      expect(sanitizeErrorMessage(undefined)).toBe("Unknown error");
    });

    it("extracts .message from plain objects with a string message", () => {
      expect(sanitizeErrorMessage({ message: "wallet rejected" })).toBe(
        "wallet rejected",
      );
    });

    it("returns 'Unknown error' when message is '[object Object]'", () => {
      // Guards against an upstream wrap that did `new Error(\`...: ${obj}\`)`.
      expect(sanitizeErrorMessage(new Error("[object Object]"))).toBe(
        "Unknown error",
      );
      expect(sanitizeErrorMessage("[object Object]")).toBe("Unknown error");
      expect(sanitizeErrorMessage({ message: "[object Object]" })).toBe(
        "Unknown error",
      );
    });

    it("collapses viem UserRejectedRequestError nested in cause to a friendly message", () => {
      // Reproduces the shape viem produces when MetaMask cancels a writeContract:
      // TransactionExecutionError → ContractFunctionExecutionError → ... →
      // UserRejectedRequestError (code 4001). Without the walker we'd surface the
      // outer message which dumps the full request payload + calldata.
      const inner = Object.assign(
        new Error("User denied transaction signature"),
        {
          code: 4001,
          name: "UserRejectedRequestError",
        },
      );
      const middle = Object.assign(
        new Error("ContractFunctionExecutionError"),
        {
          cause: inner,
        },
      );
      const outer = Object.assign(
        new Error(
          "TransactionExecutionError: chain: ..., from: 0x..., to: 0x..., value: 0.002 ETH, data: 0x68d177ac...",
        ),
        { cause: middle },
      );
      expect(sanitizeErrorMessage(outer)).toMatch(/Transaction rejected/);
    });

    it("matches user-rejection by EIP-1193 code 4001 alone (no name)", () => {
      const err = Object.assign(new Error("anything"), { code: 4001 });
      expect(sanitizeErrorMessage(err)).toMatch(/Transaction rejected/);
    });

    it("matches BTC wallet-connector CONNECTION_REJECTED at top level", () => {
      const err = Object.assign(new Error("Connection rejected"), {
        code: "CONNECTION_REJECTED",
      });
      expect(sanitizeErrorMessage(err)).toMatch(/Transaction rejected/);
    });

    it.each(["Connection to Keystone was canceled", "Proposal expired"])(
      "classifies the telemetry-suppressed wording %#: %s",
      (message) => {
        // These were dropped from Sentry as cancellations while the classifier
        // still returned null, so the depositor got generic copy for an error
        // we had already decided was a cancellation. One shared vocabulary now.
        expect(sanitizeErrorMessage(new Error(message))).toMatch(
          /Transaction rejected/,
        );
      },
    );

    it("keeps the outermost category when an inner frame is a cancellation", () => {
      // Precedence (b): depth-first, outermost wins. The shared predicate is
      // per-frame precisely so it cannot reach past this.
      const err = Object.assign(new Error("Insufficient funds for gas"), {
        cause: new Error("User rejected the request"),
      });

      expect(sanitizeErrorMessage(err)).not.toMatch(/Transaction rejected/);
    });

    it("does not collapse non-rejection errors", () => {
      const err = new Error("execution reverted: bad signature");
      expect(sanitizeErrorMessage(err)).toBe(
        "execution reverted: bad signature",
      );
    });

    it("collapses viem InsufficientFundsError by name", () => {
      const err = Object.assign(
        new Error(
          "The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.",
        ),
        { name: "InsufficientFundsError" },
      );
      expect(sanitizeErrorMessage(err)).toMatch(/Not enough ETH/);
    });

    it("collapses InsufficientFundsError nested in cause", () => {
      const inner = Object.assign(
        new Error("exceeds the balance of the account"),
        { name: "InsufficientFundsError" },
      );
      const outer = Object.assign(
        new Error(
          "TransactionExecutionError: chain: ..., from: 0x..., to: 0x..., value: 0.002 ETH",
        ),
        { cause: inner },
      );
      expect(sanitizeErrorMessage(outer)).toMatch(/Not enough ETH/);
    });

    it("collapses raw RPC 'insufficient funds' message without viem name", () => {
      // Some wallets / providers surface only the raw RPC string with no
      // viem class wrapping.
      const err = new Error(
        "insufficient funds for gas * price + value: balance 0",
      );
      expect(sanitizeErrorMessage(err)).toMatch(/Not enough ETH/);
    });

    it("does not collapse generic execution-revert errors", () => {
      const err = new Error("execution reverted: DuplicateHashlock");
      expect(sanitizeErrorMessage(err)).toBe(
        "execution reverted: DuplicateHashlock",
      );
    });

    it("does not collapse the BTC selector's insufficient-funds message", () => {
      // The SDK's `selectUtxosForPegin` throws "Insufficient funds: need N
      // sats, have M sats" — we must keep that verbatim (it carries the
      // sats info the user needs), not replace with the ETH-side hint.
      const err = new Error(
        "Insufficient funds: need 1000000 sats (900000 pegin + 100000 fee), have 1000 sats",
      );
      expect(sanitizeErrorMessage(err)).toBe(err.message);
    });

    it("collapses ProviderDisconnectedError (EIP-1193 4900)", () => {
      const err = Object.assign(
        new Error("The Provider is disconnected from all chains."),
        { code: 4900, name: "ProviderDisconnectedError" },
      );
      expect(sanitizeErrorMessage(err)).toMatch(/wallet was disconnected/i);
    });

    it("collapses ChainDisconnectedError (EIP-1193 4901) nested in cause", () => {
      const inner = Object.assign(
        new Error("The Provider is not connected to the requested chain."),
        { code: 4901, name: "ChainDisconnectedError" },
      );
      const outer = Object.assign(new Error("outer wrapper"), { cause: inner });
      expect(sanitizeErrorMessage(outer)).toMatch(/wallet was disconnected/i);
    });

    it("collapses UnauthorizedProviderError (EIP-1193 4100)", () => {
      const err = Object.assign(
        new Error(
          "The requested method and/or account has not been authorized by the user.",
        ),
        { code: 4100, name: "UnauthorizedProviderError" },
      );
      expect(sanitizeErrorMessage(err)).toMatch(/isn't authorized/i);
    });

    it("collapses WaitForTransactionReceiptTimeoutError", () => {
      const err = Object.assign(
        new Error(
          'Timed out while waiting for transaction with hash "0xabc" to be confirmed.',
        ),
        { name: "WaitForTransactionReceiptTimeoutError" },
      );
      expect(sanitizeErrorMessage(err)).toMatch(/couldn't confirm/i);
    });

    it("collapses SwitchChainError (EIP-1193 4902)", () => {
      const err = Object.assign(
        new Error("An error occurred when attempting to switch chain."),
        { code: 4902, name: "SwitchChainError" },
      );
      expect(sanitizeErrorMessage(err)).toMatch(/switch your wallet/i);
    });

    it("collapses bare 'insufficient funds' RPC string (no for-gas qualifier)", () => {
      // Some providers emit a shorter RPC string that viem's nodeMessage
      // regex catches but our older narrower one missed.
      const err = new Error("insufficient funds");
      expect(sanitizeErrorMessage(err)).toMatch(/Not enough ETH/);
    });

    it("does NOT classify a contract revert wrapped in RpcRequestError as network", () => {
      // Reproduces viem's chain when a contract reverts: the inner
      // `RpcRequestError` carries `.data = "0x70f7d5e2"` (the revert
      // selector). Without the .data guard, the walker would hit the
      // RpcRequestError name match and wrongly say "Network error".
      const revertRpc = Object.assign(new Error("RPC Request failed."), {
        name: "RpcRequestError",
        code: 3,
        data: "0x70f7d5e2",
        walk: () => {},
      });
      const revertWrap = Object.assign(
        new Error("ContractFunctionRevertedError"),
        {
          name: "ContractFunctionRevertedError",
          cause: revertRpc,
          walk: () => {},
        },
      );
      const outer = Object.assign(new Error("execution reverted"), {
        name: "ContractFunctionExecutionError",
        cause: revertWrap,
        walk: () => {},
      });
      // Pin the fall-through: the `0x` guard sends the walker to
      // `revertRpc.cause` (undefined) → classifyError returns null →
      // sanitizeErrorMessage surfaces the outer message. Asserting the exact
      // string keeps the guard protected (the `rpcError` copy also lacks
      // "Network error", so a looser matcher would pass without it).
      expect(sanitizeErrorMessage(outer)).toBe("execution reverted");
    });

    it("falls through a data-less revert (code 3, no 0x data) to the real reason", () => {
      // Some providers return a revert with no data. `code === 3` still marks
      // it a revert, so it must surface the reason — not "wait and retry".
      const revertRpc = Object.assign(new Error("RPC Request failed."), {
        name: "RpcRequestError",
        code: 3,
        walk: () => {},
      });
      const outer = Object.assign(new Error("execution reverted: SomeReason"), {
        name: "ContractFunctionExecutionError",
        cause: revertRpc,
        walk: () => {},
      });
      const msg = sanitizeErrorMessage(outer);
      expect(msg).not.toMatch(/wait a moment and try again/i);
      expect(msg).toBe("execution reverted: SomeReason");
    });

    it("classifies RpcRequestError without revert data as an rpc-error, not the user's connection", () => {
      // A JSON-RPC error the node returned (here -32603 InternalRpcError).
      // It's a provider/node failure, not transport, so it must NOT tell the
      // user to check their connection.
      const err = Object.assign(new Error("RPC Request failed."), {
        name: "RpcRequestError",
        code: -32603,
        walk: () => {},
      });
      const msg = sanitizeErrorMessage(err);
      expect(msg).not.toMatch(/check your connection/i);
      expect(msg).toMatch(/wait a moment and try again/i);
    });

    it("collapses a status-less HttpRequestError (fetch threw) as network", () => {
      // No `status` = the request never got a response = a real transport
      // failure, so "check your connection" is honest.
      const err = Object.assign(
        new Error("HTTP request failed.\nURL: https://eth-rpc.example/key"),
        { name: "HttpRequestError" },
      );
      expect(sanitizeErrorMessage(err)).toMatch(/Network error/i);
    });

    it("routes an HttpRequestError WITH a status (429/5xx) to rpc-error, not the connection", () => {
      // viem sets `status` when the server answered (rate limit / outage) —
      // a provider problem, so it must NOT tell the user to check their
      // connection. This is the most likely RPC failure over `http()`.
      const err = Object.assign(new Error("HTTP request failed."), {
        name: "HttpRequestError",
        status: 429,
      });
      const msg = sanitizeErrorMessage(err);
      expect(msg).not.toMatch(/check your connection/i);
      expect(msg).toMatch(/wait a moment and try again/i);
    });

    it("collapses TimeoutError (request timed out) — viem shape", () => {
      const err = Object.assign(
        new Error("The request took too long to respond."),
        // `walk` is the marker we use to disambiguate viem's TimeoutError
        // from DOM / AbortSignal.timeout / ky timeouts (same name).
        { name: "TimeoutError", walk: () => {} },
      );
      expect(sanitizeErrorMessage(err)).toMatch(/Network error/i);
    });

    it("does NOT classify a bare TimeoutError (no viem shape) as network", () => {
      // e.g. AbortSignal.timeout() throws a DOMException named TimeoutError.
      const err = Object.assign(new Error("operation timed out"), {
        name: "TimeoutError",
      });
      expect(sanitizeErrorMessage(err)).toBe("operation timed out");
    });

    it("collapses WebSocketRequestError", () => {
      const err = Object.assign(new Error("WebSocket request failed."), {
        name: "WebSocketRequestError",
      });
      expect(sanitizeErrorMessage(err)).toMatch(/Network error/i);
    });

    it("classifies SocketClosedError as network (transport failure)", () => {
      const err = Object.assign(new Error("The socket has been closed."), {
        name: "SocketClosedError",
      });
      expect(sanitizeErrorMessage(err)).toMatch(/Network error/i);
    });

    it("classifies a nonce-too-low / already-known chain as already-submitted, not a retry", () => {
      // viem's chain for "already known" / nonce errors is
      // TransactionExecutionError -> NonceTooLowError -> RpcRequestError. The
      // NonceTooLowError frame (above the RpcRequestError frame) means the tx
      // is already in the mempool, so the copy must send the user to their
      // wallet / an explorer rather than invite a retry.
      const inner = Object.assign(new Error("already known"), {
        name: "RpcRequestError",
        code: -32000,
        walk: () => {},
      });
      const nonce = Object.assign(new Error("nonce too low"), {
        name: "NonceTooLowError",
        cause: inner,
        walk: () => {},
      });
      const outer = Object.assign(new Error("nonce too low"), {
        name: "TransactionExecutionError",
        cause: nonce,
        walk: () => {},
      });
      const msg = sanitizeErrorMessage(outer);
      expect(msg).not.toMatch(/check your connection/i);
      expect(msg).not.toMatch(/wait a moment and try again/i);
      expect(msg).toMatch(/already submitted/i);
    });

    it("classifies a raw 'already known' provider message as already-submitted", () => {
      // No viem class wrapping — just the geth mempool string.
      const msg = sanitizeErrorMessage(new Error("already known"));
      expect(msg).toMatch(/already submitted/i);
    });

    // The rest of the suite builds synthetic errors via Object.assign so we
    // can construct arbitrary cause chains. The four smoke tests below
    // instead use real viem class constructors — if viem renames a class
    // in a future version (e.g. `InsufficientFundsError` →
    // `InsufficientFundsRpcError`), CI fails here loudly rather than
    // silently regressing in production.
    it("matches a real viem UserRejectedRequestError instance", () => {
      const err = new UserRejectedRequestError(new Error("user denied"));
      expect(sanitizeErrorMessage(err)).toMatch(/Transaction rejected/);
    });

    it("matches a real viem InsufficientFundsError instance", () => {
      // Cause is optional; the test exercises the name match, which is
      // the only signal the classifier uses for this category.
      const err = new InsufficientFundsError();
      expect(sanitizeErrorMessage(err)).toMatch(/Not enough ETH/);
    });

    it("matches a real viem HttpRequestError instance", () => {
      const err = new HttpRequestError({
        body: { method: "eth_call" },
        url: "https://rpc.example/",
      });
      expect(sanitizeErrorMessage(err)).toMatch(/Network error/);
    });

    it("matches a real viem RpcRequestError instance (node/provider error)", () => {
      // A JSON-RPC error the node returned. `walk` comes from BaseError so
      // `isViemShape` passes; `data` is undefined and code is not 3, so it
      // lands in `rpc-error` — not "check your connection".
      const err = new RpcRequestError({
        body: { method: "eth_call" },
        error: { code: -32603, message: "internal error" },
        url: "https://rpc.example/",
      });
      expect(sanitizeErrorMessage(err)).toMatch(/wait a moment and try again/i);
    });

    it("collapses Vite chunk 404 (Chrome/Edge wording) wrapped in viem error", () => {
      // Real-world shape: a contract call lazily imports a viem CCIP chunk
      // that was invalidated by a redeploy. The TypeError bubbles up
      // inside a viem ContractFunctionExecutionError as the `cause`.
      const innerTypeError = new TypeError(
        "Failed to fetch dynamically imported module: https://example.com/assets/ccip-BYToH7Tj.js",
      );
      const outer = Object.assign(
        new Error("An unknown error occurred while executing the contract"),
        { name: "ContractFunctionExecutionError", cause: innerTypeError },
      );
      expect(sanitizeErrorMessage(outer)).toMatch(/out of date/i);
    });

    it("collapses Firefox 'error loading dynamically imported module'", () => {
      const err = new TypeError(
        "error loading dynamically imported module: https://example.com/assets/chunk.js",
      );
      expect(sanitizeErrorMessage(err)).toMatch(/out of date/i);
    });

    it("collapses Safari 'Importing a module script failed'", () => {
      const err = new TypeError("Importing a module script failed.");
      expect(sanitizeErrorMessage(err)).toMatch(/out of date/i);
    });
  });

  describe("mapVpRpcError", () => {
    // -32001 has three producers: the SDK's own network failure (local),
    // the proxy's "Provider not found", and the daemon rejecting our
    // bearer. Each must reach different copy.
    it("reads a local -32001 as a connectivity failure", () => {
      const result = mapVpRpcError(
        new JsonRpcError(-32001, "Network error: Failed to fetch", "local"),
      );
      expect(result.title).toBe("Connection failed");
    });

    it("reads a wire -32001 saying 'Provider not found' as a deregistered provider", () => {
      const result = mapVpRpcError(
        new JsonRpcError(-32001, "Provider not found", "wire"),
      );
      expect(result.title).toBe("Vault provider not found");
    });

    it("reads any other wire -32001 as an expired session, not a connectivity failure", () => {
      const result = mapVpRpcError(
        new JsonRpcError(-32001, "invalid token signature", "wire"),
      );
      expect(result.title).toBe("Session expired");
      expect(result.message).toContain("reload the page");
    });

    it("reads a wire -32001 token expiry as an expired session", () => {
      const result = mapVpRpcError(
        new JsonRpcError(
          -32001,
          "token expired at 1754300000 (now: 1754300400)",
          "wire",
        ),
      );
      expect(result.title).toBe("Session expired");
    });
  });

  describe("formatPayoutSignatureError", () => {
    it("maps PEGIN_NOT_FOUND (4001) to a transient-syncing message", () => {
      const error = new JsonRpcError(
        RpcErrorCode.PEGIN_NOT_FOUND,
        "PegIn not found",
      );
      const result = formatPayoutSignatureError(error);

      expect(result.title).toBe("Vault provider syncing");
      expect(result.message).toContain("hasn't ingested");
    });

    it("maps an empty vault record to the shared registration-confirming copy", () => {
      // One binding for the id: the reader echoes it into the message, and
      // the assertion below proves it does not survive into the UI. Two
      // literals could drift apart and quietly stop testing that.
      const vaultId = "0xabc";
      const error = new Error(
        `Vault ${vaultId} not found on-chain or has no pegin transaction`,
      );

      const result = formatPayoutSignatureError(error);

      // Same condition as the deposit mapper, so it must reuse the same
      // copy entry rather than growing a second wording for one state.
      expect(result).toEqual({
        title: COPY.deposit.errors.vaultRegistrationNotYetVisible.title,
        message: COPY.deposit.errors.vaultRegistrationNotYetVisible.body,
      });
      // The raw vault id must not reach the user.
      expect(result.message).not.toContain(vaultId);
    });

    it("shows error code instead of raw message for unknown JsonRpcError codes", () => {
      const error = new JsonRpcError(-32099, "internal: secret key data here");
      const result = formatPayoutSignatureError(error);

      expect(result.title).toBe("Signature submission failed");
      expect(result.message).toContain("error code: -32099");
      expect(result.message).not.toContain("secret key data here");
    });

    it("shows generic message for unrecognized Error messages", () => {
      const error = new Error("some internal detail about signing");
      const result = formatPayoutSignatureError(error);

      expect(result.title).toBe("Payout signing error");
      expect(result.message).not.toContain("internal detail");
      expect(result.message).toContain("unexpected error");
    });

    it("shows wallet rejection message when error has CONNECTION_REJECTED code", () => {
      const error = new FakeWalletError(
        "CONNECTION_REJECTED",
        "User rejected the PSBT signing request",
      );

      const result = formatPayoutSignatureError(error);

      expect(result.title).toBe("Signing rejected");
      expect(result.message).toContain("rejected the signing request");
    });

    it("does not treat other wallet error codes as user rejection", () => {
      const error = new FakeWalletError(
        "SIGNATURE_EXTRACT_ERROR",
        "User rejected the request",
      );

      const result = formatPayoutSignatureError(error);

      expect(result.title).not.toBe("Signing rejected");
    });

    it("extracts .message from plain objects (some wallets throw object literals)", () => {
      const result = formatPayoutSignatureError({
        code: -32603,
        message: "VP rejected the signature",
      });
      expect(result.title).toBe("Payout signing error");
      expect(result.message).toBe("VP rejected the signature");
    });

    it("falls back to static message for plain objects without string .message", () => {
      const result = formatPayoutSignatureError({});
      expect(result.message).not.toBe("[object Object]");
      expect(result.message).toContain("unexpected error");
    });

    it("falls back to static message for null/undefined", () => {
      expect(formatPayoutSignatureError(null).message).toContain(
        "unexpected error",
      );
      expect(formatPayoutSignatureError(undefined).message).toContain(
        "unexpected error",
      );
    });

    it("falls back to static message when .message itself is '[object Object]'", () => {
      const result = formatPayoutSignatureError({ message: "[object Object]" });
      expect(result.message).not.toBe("[object Object]");
      expect(result.message).toContain("unexpected error");
    });

    it("passes through string throws (WASM panics)", () => {
      const result = formatPayoutSignatureError("wasm panic: out of bounds");
      expect(result.message).toBe("wasm panic: out of bounds");
    });

    // Drift guard: production code inlines "CONNECTION_REJECTED" instead of
    // importing ERROR_CODES from @babylonlabs-io/wallet-connector (the package
    // pulls TSX/runtime that breaks this test transform). Read the upstream
    // codes.ts source directly so a rename there fails this test instead of
    // silently degrading the user-rejection branch.
    it("inlined CONNECTION_REJECTED code matches wallet-connector source", () => {
      const codesPath = resolve(
        __dirname,
        "../../../../../../packages/babylon-wallet-connector/src/error/codes.ts",
      );
      const source = readFileSync(codesPath, "utf8");
      const match = source.match(/CONNECTION_REJECTED:\s*"([^"]+)"/);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe("CONNECTION_REJECTED");

      const rejection = new FakeWalletError(
        match![1],
        "User rejected the PSBT signing request",
      );
      expect(formatPayoutSignatureError(rejection).title).toBe(
        "Signing rejected",
      );
    });
  });

  describe("formatErrorDiagnostics", () => {
    it("keeps viem's full message, including the request dump the UI hides", () => {
      const err = Object.assign(
        new Error(
          "An unknown RPC error occurred.\n\nRequest Arguments:\n  data: 0x68d177ac",
        ),
        { name: "TransactionExecutionError", code: -32000 },
      );

      const text = formatErrorDiagnostics(err);

      expect(text).toContain("TransactionExecutionError");
      expect(text).toContain("0x68d177ac");
      expect(text).toContain("code: -32000");
    });

    it("truncates runaway messages", () => {
      const text = formatErrorDiagnostics(new Error("x".repeat(9000)));

      expect(text.length).toBeLessThanOrEqual(4000);
      expect(text.endsWith("\u2026")).toBe(true);
    });

    it("keeps details and code when the raw message is clamped away", () => {
      // viem orders the request dump before `details`, so a summary appended
      // after the message would be the first thing truncation discarded.
      const err = Object.assign(new Error(`0x${"ab".repeat(5000)}`), {
        name: "TransactionExecutionError",
        shortMessage: "An unknown RPC error occurred.",
        details: "header not found",
        metaMessages: ["Request Arguments:"],
        code: -32000,
      });

      const text = formatErrorDiagnostics(err);

      expect(text).toContain("details: header not found");
      expect(text).toContain("code: -32000");
      expect(text.length).toBeLessThanOrEqual(4000);
    });

    it("describes non-Error throws without crashing", () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      expect(formatErrorDiagnostics("plain string")).toBe("plain string");
      expect(formatErrorDiagnostics(circular)).toBe("[object Object]");
      // JSON.stringify yields undefined for these \u2014 it must not be trimmed.
      expect(formatErrorDiagnostics(undefined)).toBe("undefined");
      expect(formatErrorDiagnostics(() => {})).toContain("=>");
    });
  });
});
