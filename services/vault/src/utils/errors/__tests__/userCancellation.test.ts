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

import {
  isUserCancellation,
  isUserCancellationFrame,
} from "../userCancellation";

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
    "Transaction rejected by user",
    "Action cancelled by user",
    "denied by the user",
    "User closed modal",
  ])("matches the reversed word order %#: %s", (message) => {
    // Trezor, Ledger APDU 0x6985 and WalletConnect all put the subject last.
    expect(isUserCancellation(new Error(message))).toBe(true);
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

  it.each([
    "The contract rejected the borrow request",
    "The node rejected the signing request",
    "RPC error: server rejected the transaction request",
  ])("requires a wallet subject, so %#: %s still reports", (message) => {
    // The `rejected the <noun> request` arm used to carry no subject, so any
    // actor rejecting any noun-request read as a user cancellation.
    expect(isUserCancellation(new Error(message))).toBe(false);
  });

  it("does not let the connection arm span unrelated clauses", () => {
    // `connection to .+ was rejected` allowed `.+` to run across the whole
    // message; the wallet name is now bounded to at most three words.
    expect(
      isUserCancellation(
        new Error(
          "Connection to indexer failed after the tx was rejected by the network",
        ),
      ),
    ).toBe(false);
  });

  it("matches a bare-string cause nested under a wrapper", () => {
    // The walk's `typeof === object` guard stopped at the first string cause,
    // so a wrapper around a string-throwing adapter reported as a fault.
    expect(
      isUserCancellation(
        new Error("Failed to broadcast", {
          cause: "User rejected the request",
        }),
      ),
    ).toBe(true);
  });

  it("does not walk the cause chain when checking a single frame", () => {
    // `classifyError` is depth-first with the outermost match winning, so the
    // per-frame predicate must not reach into causes on its behalf.
    const error = new Error("Insufficient funds", {
      cause: new Error("User rejected the request"),
    });

    expect(isUserCancellationFrame(error)).toBe(false);
    expect(isUserCancellation(error)).toBe(true);
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
