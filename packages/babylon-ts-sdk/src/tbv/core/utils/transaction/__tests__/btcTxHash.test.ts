/**
 * Tests for calculateBtcTxHash
 */

import * as bitcoin from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { calculateBtcTxHash } from "../btcTxHash";

// Build a minimal valid transaction to use as a test vector.
// We use bitcoinjs-lib directly so the expected txid is authoritative
// (double SHA256 + byte reversal per Bitcoin convention).
function buildTestTransaction() {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0xab), 0);
  tx.addOutput(Buffer.alloc(34, 0xcd), 50000);
  return { hex: tx.toHex(), expectedTxId: tx.getId() };
}

describe("calculateBtcTxHash", () => {
  const { hex: testTxHex, expectedTxId } = buildTestTransaction();

  it("should produce the correct txid for a known transaction", () => {
    const result = calculateBtcTxHash(testTxHex);
    expect(result).toBe(`0x${expectedTxId}`);
  });

  it("should handle input with 0x prefix", () => {
    const withPrefix = calculateBtcTxHash(`0x${testTxHex}`);
    const withoutPrefix = calculateBtcTxHash(testTxHex);
    expect(withPrefix).toBe(withoutPrefix);
  });

  it("should return a 0x-prefixed 64-char hex string", () => {
    const result = calculateBtcTxHash(testTxHex);
    expect(result.startsWith("0x")).toBe(true);
    expect(result).toHaveLength(66); // 0x + 64 hex chars
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("should be deterministic", () => {
    const first = calculateBtcTxHash(testTxHex);
    const second = calculateBtcTxHash(testTxHex);
    expect(first).toBe(second);
  });

  it("should throw on invalid hex", () => {
    expect(() => calculateBtcTxHash("not_valid_hex")).toThrow();
  });

  it("should throw on malformed transaction", () => {
    // Valid hex but not a valid Bitcoin transaction
    expect(() => calculateBtcTxHash("deadbeef")).toThrow();
  });
});
