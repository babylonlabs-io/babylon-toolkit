/**
 * Tests for extractPeginInputSignature sighash validation
 *
 * Verifies that the signature extraction correctly validates sighash types,
 * accepting implicit SIGHASH_DEFAULT (64-byte sig) and SIGHASH_ALL (0x01)
 * while rejecting all other types including explicit 0x00 (consensus-invalid
 * per BIP-342).
 */

import { Buffer } from "buffer";

import { Psbt, Transaction } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { extractPeginInputSignature, extractSchnorrSig } from "../peginInput";
import { NULL_TXID, TEST_WITNESS_UTXO_VALUE, createDummyP2WPKH } from "./constants";
import { TEST_KEYS } from "./helpers";

/**
 * Creates a PSBT with a tapScriptSig entry for testing signature extraction.
 */
function createPsbtWithSignature(signature: Buffer): string {
  const psbt = new Psbt();
  psbt.addInput({
    hash: NULL_TXID,
    index: 0,
    witnessUtxo: {
      script: createDummyP2WPKH("0"),
      value: TEST_WITNESS_UTXO_VALUE,
    },
    tapScriptSig: [
      {
        pubkey: Buffer.from(TEST_KEYS.DEPOSITOR, "hex"),
        signature,
        leafHash: Buffer.alloc(32, 0),
      },
    ],
  });
  return psbt.toHex();
}

describe("extractPeginInputSignature — sighash validation", () => {
  it("accepts 64-byte signature (implicit SIGHASH_DEFAULT)", () => {
    const signature64 = Buffer.alloc(64, 0xaa);
    const psbtHex = createPsbtWithSignature(signature64);

    const extracted = extractPeginInputSignature(psbtHex, TEST_KEYS.DEPOSITOR);

    expect(extracted).toBe(signature64.toString("hex"));
    expect(extracted.length).toBe(128);
  });

  it("rejects 65-byte signature with explicit SIGHASH_DEFAULT (0x00) — consensus-invalid per BIP-342", () => {
    const signature65 = Buffer.alloc(65);
    signature65.fill(0xbb, 0, 64);
    signature65[64] = 0x00;

    const psbtHex = createPsbtWithSignature(signature65);

    expect(() =>
      extractPeginInputSignature(psbtHex, TEST_KEYS.DEPOSITOR),
    ).toThrow(
      /Unexpected sighash type 0x00 in PegIn input signature\. Expected SIGHASH_DEFAULT \(64-byte sig\) or SIGHASH_ALL \(0x01\)/,
    );
  });

  it("accepts 65-byte signature with SIGHASH_ALL (0x01) and strips it", () => {
    const signature65 = Buffer.alloc(65);
    signature65.fill(0xcc, 0, 64);
    signature65[64] = Transaction.SIGHASH_ALL;

    const psbtHex = createPsbtWithSignature(signature65);

    const extracted = extractPeginInputSignature(psbtHex, TEST_KEYS.DEPOSITOR);

    expect(extracted).toBe(Buffer.alloc(64, 0xcc).toString("hex"));
    expect(extracted.length).toBe(128);
  });

  it("rejects 65-byte signature with SIGHASH_NONE (0x02)", () => {
    const signature65 = Buffer.alloc(65);
    signature65.fill(0xbb, 0, 64);
    signature65[64] = Transaction.SIGHASH_NONE;

    const psbtHex = createPsbtWithSignature(signature65);

    expect(() =>
      extractPeginInputSignature(psbtHex, TEST_KEYS.DEPOSITOR),
    ).toThrow(
      /Unexpected sighash type 0x02 in PegIn input signature\. Expected SIGHASH_DEFAULT \(64-byte sig\) or SIGHASH_ALL \(0x01\)/,
    );
  });

  it("rejects 65-byte signature with SIGHASH_SINGLE|ANYONECANPAY (0x83)", () => {
    const signature65 = Buffer.alloc(65);
    signature65.fill(0xbb, 0, 64);
    signature65[64] =
      Transaction.SIGHASH_SINGLE | Transaction.SIGHASH_ANYONECANPAY;

    const psbtHex = createPsbtWithSignature(signature65);

    expect(() =>
      extractPeginInputSignature(psbtHex, TEST_KEYS.DEPOSITOR),
    ).toThrow(
      /Unexpected sighash type 0x83 in PegIn input signature\. Expected SIGHASH_DEFAULT \(64-byte sig\) or SIGHASH_ALL \(0x01\)/,
    );
  });

  it("rejects signature with wrong length (63 bytes)", () => {
    const signature63 = new Uint8Array(63).fill(0xaa);

    expect(() => extractSchnorrSig(signature63)).toThrow(
      /Unexpected PegIn input signature length: 63/,
    );
  });

  it("rejects signature with wrong length (66 bytes)", () => {
    const signature66 = new Uint8Array(66).fill(0xaa);

    expect(() => extractSchnorrSig(signature66)).toThrow(
      /Unexpected PegIn input signature length: 66/,
    );
  });
});
