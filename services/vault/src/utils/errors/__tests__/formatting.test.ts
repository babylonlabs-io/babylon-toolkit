/**
 * Tests for error formatting utilities
 */

import { JsonRpcError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { readFileSync } from "fs";
import { resolve } from "path";
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

    it("returns 'Unknown error' for non-Error objects", () => {
      expect(sanitizeErrorMessage({ key: "value" })).toBe("Unknown error");
      expect(sanitizeErrorMessage(42)).toBe("Unknown error");
      expect(sanitizeErrorMessage(null)).toBe("Unknown error");
      expect(sanitizeErrorMessage(undefined)).toBe("Unknown error");
    });
  });

  describe("formatPayoutSignatureError", () => {
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
