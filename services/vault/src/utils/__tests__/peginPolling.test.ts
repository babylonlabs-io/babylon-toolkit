/**
 * Tests for pegin polling utilities
 */

import { DaemonStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { describe, expect, it } from "vitest";

import {
  isTerminalPollingError,
  isTransientPollingError,
  TerminalPeginPollingError,
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
  it("fails fast on the 'Unauthorized depositor' VP rpc error (wrong wallet paired)", () => {
    expect(isTerminalPollingError(new Error("Unauthorized depositor"))).toBe(
      true,
    );
    expect(
      isTerminalPollingError(new Error("Unauthorized depositor: bad sig")),
    ).toBe(true);
  });

  it("returns false for non-terminal plain Errors", () => {
    expect(isTerminalPollingError(new Error("Network error"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isTerminalPollingError("string error")).toBe(false);
    expect(isTerminalPollingError(null)).toBe(false);
    expect(isTerminalPollingError(undefined)).toBe(false);
  });

  it.each([
    DaemonStatus.EXPIRED_IN_CLAIM,
    DaemonStatus.INVALID_SIG_IN_CONTRACT,
    DaemonStatus.AML_REJECTED,
    DaemonStatus.EXPIRED,
    DaemonStatus.EXPIRED_CLEANED_UP,
    DaemonStatus.INGESTION_REJECTED,
  ])("returns true for TerminalPeginPollingError(%s)", (status) => {
    expect(
      isTerminalPollingError(new TerminalPeginPollingError(status, "anything")),
    ).toBe(true);
  });
});
