/**
 * Tests for error formatting utilities
 */

import { JsonRpcError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { describe, expect, it } from "vitest";

import {
  formatErrorMessage,
  formatPayoutSignatureError,
  sanitizeErrorMessage,
} from "../formatting";

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
  });
});
