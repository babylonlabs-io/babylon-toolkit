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
  HttpRequestError,
  InsufficientFundsError,
  UserRejectedRequestError,
} from "viem";
import { describe, expect, it } from "vitest";

import {
  formatErrorMessage,
  formatPayoutSignatureError,
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
      expect(sanitizeErrorMessage(outer)).not.toMatch(/Network error/i);
    });

    it("still classifies RpcRequestError without revert data as network", () => {
      // Pure transport failure — no `.data`, no revert. Should hit the
      // network bucket.
      const err = Object.assign(new Error("RPC Request failed."), {
        name: "RpcRequestError",
        code: -32603,
        walk: () => {},
      });
      expect(sanitizeErrorMessage(err)).toMatch(/Network error/i);
    });

    it("collapses HttpRequestError (RPC transport failure)", () => {
      const err = Object.assign(
        new Error("HTTP request failed.\nURL: https://eth-rpc.example/key"),
        { name: "HttpRequestError" },
      );
      expect(sanitizeErrorMessage(err)).toMatch(/Network error/i);
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

    // The rest of the suite builds synthetic errors via Object.assign so we
    // can construct arbitrary cause chains. The three smoke tests below
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
  });

  describe("formatPayoutSignatureError", () => {
    it("maps PEGIN_NOT_FOUND (4001) to a transient-syncing message", () => {
      const error = new JsonRpcError(
        RpcErrorCode.PEGIN_NOT_FOUND,
        "PegIn not found",
      );
      const result = formatPayoutSignatureError(error);

      expect(result.title).toBe("Vault Provider Syncing");
      expect(result.message).toContain("hasn't ingested");
    });

    it("shows error code instead of raw message for unknown JsonRpcError codes", () => {
      const error = new JsonRpcError(-32099, "internal: secret key data here");
      const result = formatPayoutSignatureError(error);

      expect(result.title).toBe("Signature Submission Failed");
      expect(result.message).toContain("error code: -32099");
      expect(result.message).not.toContain("secret key data here");
    });

    it("shows generic message for unrecognized Error messages", () => {
      const error = new Error("some internal detail about signing");
      const result = formatPayoutSignatureError(error);

      expect(result.title).toBe("Payout Signing Error");
      expect(result.message).not.toContain("internal detail");
      expect(result.message).toContain("unexpected error");
    });

    it("shows wallet rejection message when error has CONNECTION_REJECTED code", () => {
      const error = new FakeWalletError(
        "CONNECTION_REJECTED",
        "User rejected the PSBT signing request",
      );

      const result = formatPayoutSignatureError(error);

      expect(result.title).toBe("Signing Rejected");
      expect(result.message).toContain("rejected the signing request");
    });

    it("does not treat other wallet error codes as user rejection", () => {
      const error = new FakeWalletError(
        "SIGNATURE_EXTRACT_ERROR",
        "User rejected the request",
      );

      const result = formatPayoutSignatureError(error);

      expect(result.title).not.toBe("Signing Rejected");
    });

    it("extracts .message from plain objects (some wallets throw object literals)", () => {
      const result = formatPayoutSignatureError({
        code: -32603,
        message: "VP rejected the signature",
      });
      expect(result.title).toBe("Payout Signing Error");
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
        "Signing Rejected",
      );
    });
  });
});
