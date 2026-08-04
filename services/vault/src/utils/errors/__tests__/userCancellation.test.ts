/**
 * Pins which wallet failures count as the depositor cancelling.
 *
 * This predicate decides what does NOT reach Sentry, so it is load-bearing in
 * both directions: the wordings below were all captured in production as
 * errors, and the negative cases are genuine faults that must keep reporting.
 * The previous check was `message.includes("rejected")`, which matched only
 * one of the four vocabularies wallets actually use.
 */

import { describe, expect, it } from "vitest";

import { isUserCancellation } from "../userCancellation";

describe("isUserCancellation", () => {
  it("matches an EIP-1193 user-rejected code", () => {
    expect(
      isUserCancellation(Object.assign(new Error("nope"), { code: 4001 })),
    ).toBe(true);
  });

  it("matches viem's UserRejectedRequestError by name", () => {
    const error = new Error("User rejected the request.");
    error.name = "UserRejectedRequestError";

    expect(isUserCancellation(error)).toBe(true);
  });

  it("matches the wallet-connector CONNECTION_REJECTED code", () => {
    expect(
      isUserCancellation(
        Object.assign(new Error("connection failed"), {
          code: "CONNECTION_REJECTED",
        }),
      ),
    ).toBe(true);
  });

  it.each([
    "Connection to Keystone was canceled",
    "Failed to connect wallet: Connection cancelled",
    "Request Signature: User denied request signature.",
    "User rejected the PSBT signing request in Unisat Wallet",
    "Connection to Unisat Wallet was rejected",
    "ContractError: borrow from Aave Core position was rejected by the wallet.",
    "Error: Unisat Wallet rejected the deriveContextHash approval",
    "Proposal expired",
  ])("matches the production wording %#: %s", (message) => {
    expect(isUserCancellation(new Error(message))).toBe(true);
  });

  it("matches a cancellation wrapped as a cause", () => {
    const error = new Error("Failed to broadcast batch Pre-PegIn transaction", {
      cause: new Error("User rejected the PSBT signing request"),
    });

    expect(isUserCancellation(error)).toBe(true);
  });

  it.each([
    "Failed to connect wallet: Connection timeout",
    "The contract rejected this transaction",
    "Transaction creation failed.",
    "Failed to fetch",
    "Chainlink price data is stale. Using last known price.",
  ])("does not match the genuine failure %#: %s", (message) => {
    expect(isUserCancellation(new Error(message))).toBe(false);
  });

  it("matches a bare string rejection, which some adapters throw", () => {
    expect(isUserCancellation("User rejected the request")).toBe(true);
    expect(isUserCancellation("Failed to fetch")).toBe(false);
  });

  it("does not match null or undefined", () => {
    expect(isUserCancellation(null)).toBe(false);
    expect(isUserCancellation(undefined)).toBe(false);
  });

  it("terminates on a self-referencing cause chain", () => {
    const error = new Error("boom") as Error & { cause?: unknown };
    error.cause = error;

    expect(isUserCancellation(error)).toBe(false);
  });
});
