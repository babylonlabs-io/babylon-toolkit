/**
 * Tests for pegin polling utilities
 */

import { describe, expect, it } from "vitest";

import {
  isTerminalPollingError,
  isTransientPollingError,
} from "../peginPolling";

describe("isTransientPollingError", () => {
  it("should return true for 'PegIn not found'", () => {
    expect(isTransientPollingError(new Error("PegIn not found"))).toBe(true);
  });

  it("should return true for 'No transaction graphs found'", () => {
    expect(
      isTransientPollingError(new Error("No transaction graphs found")),
    ).toBe(true);
  });

  it("should return true for 'Vault or pegin transaction not found'", () => {
    expect(
      isTransientPollingError(
        new Error("Vault or pegin transaction not found"),
      ),
    ).toBe(true);
  });

  it("should return false for non-transient errors", () => {
    expect(isTransientPollingError(new Error("Unauthorized depositor"))).toBe(
      false,
    );
    expect(isTransientPollingError(new Error("Network error"))).toBe(false);
  });

  it("should return false for non-Error values", () => {
    expect(isTransientPollingError("string error")).toBe(false);
    expect(isTransientPollingError(null)).toBe(false);
    expect(isTransientPollingError(undefined)).toBe(false);
  });
});

describe("isTerminalPollingError", () => {
  it("should return true for 'Unauthorized depositor'", () => {
    expect(isTerminalPollingError(new Error("Unauthorized depositor"))).toBe(
      true,
    );
  });

  it("should return true when message contains the pattern", () => {
    expect(
      isTerminalPollingError(
        new Error(
          "Unauthorized depositor: Depositor public key does not match payout receiver for claimer",
        ),
      ),
    ).toBe(true);
  });

  it("should return false for transient errors", () => {
    expect(isTerminalPollingError(new Error("PegIn not found"))).toBe(false);
    expect(
      isTerminalPollingError(new Error("No transaction graphs found")),
    ).toBe(false);
  });

  it("should return false for generic errors", () => {
    expect(isTerminalPollingError(new Error("Network error"))).toBe(false);
    expect(isTerminalPollingError(new Error("Provider unreachable"))).toBe(
      false,
    );
  });

  it("should return false for non-Error values", () => {
    expect(isTerminalPollingError("string error")).toBe(false);
    expect(isTerminalPollingError(null)).toBe(false);
    expect(isTerminalPollingError(undefined)).toBe(false);
  });
});
