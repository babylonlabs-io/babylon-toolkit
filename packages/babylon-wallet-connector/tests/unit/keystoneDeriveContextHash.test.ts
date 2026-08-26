/**
 * Unit tests for the pure helpers behind Keystone's `deriveContextHash`
 * implementation. The provider class itself is not imported here — its
 * module pulls in an SVG asset the unit-test runner can't resolve — so the
 * QR round-trip is exercised by the on-device manual test, while the
 * network mapping and output validation (the parts that gate on-chain vault
 * material) are pinned here.
 */
import { expect, test } from "@playwright/test";

import { Network } from "../../src/core/types";
import { canonicalNetworkName } from "../../src/core/wallets/btc/keystone/canonicalNetworkName";
import { isValidContextHashOutput } from "../../src/core/wallets/btc/keystone/contextHashOutput";

test.describe("canonicalNetworkName — Keystone network → spec canonical name", () => {
  test("maps MAINNET to 'bitcoin-mainnet'", () => {
    expect(canonicalNetworkName(Network.MAINNET)).toBe("bitcoin-mainnet");
  });

  test("maps TESTNET to 'bitcoin-testnet'", () => {
    expect(canonicalNetworkName(Network.TESTNET)).toBe("bitcoin-testnet");
  });

  test("maps SIGNET to 'bitcoin-signet'", () => {
    expect(canonicalNetworkName(Network.SIGNET)).toBe("bitcoin-signet");
  });
});

test.describe("isValidContextHashOutput — deriveContextHash output validation", () => {
  test("accepts a 64-char lowercase hex string", () => {
    expect(isValidContextHashOutput("a".repeat(64))).toBe(true);
    expect(isValidContextHashOutput("0123456789abcdef".repeat(4))).toBe(true);
  });

  test("rejects an output shorter than 64 characters", () => {
    expect(isValidContextHashOutput("ab".repeat(31))).toBe(false);
  });

  test("rejects an output longer than 64 characters", () => {
    expect(isValidContextHashOutput("a".repeat(66))).toBe(false);
  });

  test("rejects uppercase hex (spec requires lowercase)", () => {
    expect(isValidContextHashOutput("A".repeat(64))).toBe(false);
  });

  test("rejects non-hex characters", () => {
    expect(isValidContextHashOutput("g".repeat(64))).toBe(false);
  });

  test("rejects an empty string", () => {
    expect(isValidContextHashOutput("")).toBe(false);
  });
});
