/**
 * Tests for BIP-341 taproot sighash computation and verification.
 *
 * Uses a manually constructed PSBT with known tapLeafScript and witnessUtxo
 * to verify sighash computation against independently derived values.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Buffer } from "buffer";
import { initEccLib, payments, Psbt, Transaction } from "bitcoinjs-lib";
import { tapleafHash } from "bitcoinjs-lib/src/payments/bip341";
import { describe, expect, it } from "vitest";

import {
  computeTaprootSighash,
  SighashMismatchError,
  verifySighash,
} from "../sighash";

// Initialize ECC for bitcoinjs-lib
initEccLib(ecc);

/**
 * Build a minimal taproot PSBT with a script-path input for testing.
 *
 * Creates a transaction with one input spending a P2TR output via script path,
 * and one OP_RETURN output. Returns the PSBT hex and the expected sighash
 * computed directly via Transaction.hashForWitnessV1.
 */
function buildTestPsbt(): { psbtHex: string; expectedSighash: string } {
  // A simple tapscript: OP_TRUE (anyone can spend)
  const tapScript = Buffer.from([0x51]); // OP_TRUE
  const leafVersion = 0xc0;

  // Use a standard internal key (32 bytes of 0x02 — unspendable)
  const internalKey = Buffer.alloc(32, 0x02);

  const scriptTree = { output: tapScript };
  const p2tr = payments.p2tr({
    internalPubkey: internalKey,
    scriptTree,
  });

  if (!p2tr.output || !p2tr.pubkey) {
    throw new Error("Failed to construct P2TR payment");
  }

  // Compute control block
  const parity = p2tr.pubkey[0] === 0x03 ? 1 : 0;
  const controlByte = leafVersion | parity;
  const controlBlock = Buffer.concat([
    Buffer.from([controlByte]),
    internalKey,
  ]);

  // Create a dummy transaction to sign
  const tx = new Transaction();
  tx.version = 2;

  // Add input (spending from a fake txid)
  const fakeTxid = Buffer.alloc(32, 0xaa);
  tx.addInput(fakeTxid, 0, 0xfffffffd);

  // Add output (OP_RETURN with some data)
  const opReturnScript = Buffer.from([0x6a, 0x04, 0x74, 0x65, 0x73, 0x74]); // OP_RETURN "test"
  tx.addOutput(opReturnScript, 0);

  // Build PSBT
  const prevoutScript = p2tr.output;
  const prevoutValue = 10_000;

  const psbt = new Psbt();
  psbt.setVersion(tx.version);
  psbt.setLocktime(tx.locktime);

  psbt.addInput({
    hash: fakeTxid,
    index: 0,
    sequence: 0xfffffffd,
    witnessUtxo: {
      script: prevoutScript,
      value: prevoutValue,
    },
    tapLeafScript: [
      {
        leafVersion,
        script: tapScript,
        controlBlock,
      },
    ],
    tapInternalKey: internalKey,
  });

  psbt.addOutput({
    script: opReturnScript,
    value: 0,
  });

  // Compute expected sighash directly
  const leafHash = tapleafHash({ output: tapScript, version: leafVersion });
  const sighash = tx.hashForWitnessV1(
    0,
    [prevoutScript],
    [prevoutValue],
    0x00, // SIGHASH_DEFAULT
    leafHash,
  );

  return {
    psbtHex: psbt.toHex(),
    expectedSighash: sighash.toString("hex"),
  };
}

/**
 * Build a PSBT with multiple inputs (some with tapLeafScript, some without).
 */
function buildMultiInputTestPsbt(): {
  psbtHex: string;
  expectedSighashInput0: string;
} {
  const tapScript = Buffer.from([0x51]);
  const leafVersion = 0xc0;
  const internalKey = Buffer.alloc(32, 0x02);

  const scriptTree = { output: tapScript };
  const p2tr = payments.p2tr({ internalPubkey: internalKey, scriptTree });

  if (!p2tr.output || !p2tr.pubkey) {
    throw new Error("Failed to construct P2TR payment");
  }

  const parity = p2tr.pubkey[0] === 0x03 ? 1 : 0;
  const controlBlock = Buffer.concat([
    Buffer.from([leafVersion | parity]),
    internalKey,
  ]);

  const tx = new Transaction();
  tx.version = 2;

  const fakeTxid1 = Buffer.alloc(32, 0xaa);
  const fakeTxid2 = Buffer.alloc(32, 0xbb);
  tx.addInput(fakeTxid1, 0, 0xfffffffd);
  tx.addInput(fakeTxid2, 0, 0xfffffffd);

  const opReturnScript = Buffer.from([0x6a, 0x04, 0x74, 0x65, 0x73, 0x74]);
  tx.addOutput(opReturnScript, 0);

  // Second input's prevout — a simple P2TR key-path output (no tapLeafScript needed for non-signed inputs)
  const p2trKeyPath = payments.p2tr({ internalPubkey: internalKey });
  const secondPrevoutScript = p2trKeyPath.output!;
  const secondPrevoutValue = 5_000;

  const psbt = new Psbt();
  psbt.setVersion(tx.version);
  psbt.setLocktime(tx.locktime);

  // Input 0: script-path spend (depositor signs this)
  psbt.addInput({
    hash: fakeTxid1,
    index: 0,
    sequence: 0xfffffffd,
    witnessUtxo: { script: p2tr.output, value: 10_000 },
    tapLeafScript: [{ leafVersion, script: tapScript, controlBlock }],
    tapInternalKey: internalKey,
  });

  // Input 1: no tapLeafScript (not signed by depositor)
  psbt.addInput({
    hash: fakeTxid2,
    index: 0,
    sequence: 0xfffffffd,
    witnessUtxo: { script: secondPrevoutScript, value: secondPrevoutValue },
  });

  psbt.addOutput({ script: opReturnScript, value: 0 });

  // Compute expected sighash for input 0 (must include ALL prevouts)
  const leafHash = tapleafHash({ output: tapScript, version: leafVersion });
  const sighash = tx.hashForWitnessV1(
    0,
    [p2tr.output, secondPrevoutScript],
    [10_000, secondPrevoutValue],
    0x00,
    leafHash,
  );

  return {
    psbtHex: psbt.toHex(),
    expectedSighashInput0: sighash.toString("hex"),
  };
}

describe("computeTaprootSighash", () => {
  it("computes correct sighash for single-input taproot script-path PSBT", () => {
    const { psbtHex, expectedSighash } = buildTestPsbt();

    const computed = computeTaprootSighash(psbtHex, 0);

    expect(computed).toBe(expectedSighash);
    expect(computed).toHaveLength(64); // 32 bytes as hex
  });

  it("computes correct sighash for multi-input PSBT (commits to all prevouts)", () => {
    const { psbtHex, expectedSighashInput0 } = buildMultiInputTestPsbt();

    const computed = computeTaprootSighash(psbtHex, 0);

    expect(computed).toBe(expectedSighashInput0);
  });

  it("throws when input index is out of range", () => {
    const { psbtHex } = buildTestPsbt();

    expect(() => computeTaprootSighash(psbtHex, 5)).toThrow(
      /Input index 5 out of range/,
    );
  });

  it("throws when input index is negative", () => {
    const { psbtHex } = buildTestPsbt();

    expect(() => computeTaprootSighash(psbtHex, -1)).toThrow(
      /Input index -1 out of range/,
    );
  });

  it("throws when input index is not an integer", () => {
    const { psbtHex } = buildTestPsbt();

    expect(() => computeTaprootSighash(psbtHex, 0.5)).toThrow(
      /Input index 0.5 out of range/,
    );
  });

  it("throws when input is missing tapLeafScript", () => {
    const { psbtHex } = buildMultiInputTestPsbt();

    // Input 1 has no tapLeafScript
    expect(() => computeTaprootSighash(psbtHex, 1)).toThrow(
      /Input 1 is missing tapLeafScript/,
    );
  });

  it("throws when input is missing witnessUtxo", () => {
    // Build a PSBT with a missing witnessUtxo
    const tapScript = Buffer.from([0x51]);
    const internalKey = Buffer.alloc(32, 0x02);
    const scriptTree = { output: tapScript };
    const p2tr = payments.p2tr({ internalPubkey: internalKey, scriptTree });
    const parity = p2tr.pubkey![0] === 0x03 ? 1 : 0;
    const controlBlock = Buffer.concat([
      Buffer.from([0xc0 | parity]),
      internalKey,
    ]);

    const psbt = new Psbt();
    psbt.setVersion(2);

    const fakeTxid = Buffer.alloc(32, 0xaa);
    psbt.addInput({
      hash: fakeTxid,
      index: 0,
      sequence: 0xfffffffd,
      tapLeafScript: [
        { leafVersion: 0xc0, script: tapScript, controlBlock },
      ],
      tapInternalKey: internalKey,
    } as any);

    psbt.addOutput({
      script: Buffer.from([0x6a, 0x04, 0x74, 0x65, 0x73, 0x74]),
      value: 0,
    });

    expect(() => computeTaprootSighash(psbt.toHex(), 0)).toThrow(
      /missing witnessUtxo/,
    );
  });
});

describe("verifySighash", () => {
  it("passes silently when computed sighash matches expected", () => {
    const { psbtHex, expectedSighash } = buildTestPsbt();

    // Should not throw
    expect(() =>
      verifySighash(psbtHex, 0, expectedSighash, "Payout input 0"),
    ).not.toThrow();
  });

  it("accepts expected sighash with 0x prefix", () => {
    const { psbtHex, expectedSighash } = buildTestPsbt();

    expect(() =>
      verifySighash(psbtHex, 0, `0x${expectedSighash}`, "Payout input 0"),
    ).not.toThrow();
  });

  it("accepts expected sighash with uppercase 0X prefix", () => {
    const { psbtHex, expectedSighash } = buildTestPsbt();

    expect(() =>
      verifySighash(psbtHex, 0, `0X${expectedSighash.toUpperCase()}`, "Payout input 0"),
    ).not.toThrow();
  });

  it("accepts expected sighash with uppercase hex", () => {
    const { psbtHex, expectedSighash } = buildTestPsbt();

    expect(() =>
      verifySighash(psbtHex, 0, expectedSighash.toUpperCase(), "Payout input 0"),
    ).not.toThrow();
  });

  it("accepts expected sighash with mixed-case hex", () => {
    const { psbtHex, expectedSighash } = buildTestPsbt();
    // Alternate upper/lower for each char
    const mixedCase = expectedSighash
      .split("")
      .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
      .join("");

    expect(() =>
      verifySighash(psbtHex, 0, mixedCase, "Payout input 0"),
    ).not.toThrow();
  });

  it("verifies correctly against a multi-input PSBT (real path)", () => {
    const { psbtHex, expectedSighashInput0 } = buildMultiInputTestPsbt();

    // Real verifySighash against a real PSBT — no mocks
    expect(() =>
      verifySighash(psbtHex, 0, expectedSighashInput0, "Payout input 0"),
    ).not.toThrow();

    // Wrong sighash should fail
    const wrongSighash = "ab".repeat(32);
    expect(() =>
      verifySighash(psbtHex, 0, wrongSighash, "Payout input 0"),
    ).toThrow(SighashMismatchError);
  });

  it("throws SighashMismatchError with descriptive message on mismatch", () => {
    const { psbtHex } = buildTestPsbt();
    const wrongSighash = "ff".repeat(32);

    expect(() =>
      verifySighash(psbtHex, 0, wrongSighash, "Payout input 0"),
    ).toThrow(SighashMismatchError);

    try {
      verifySighash(psbtHex, 0, wrongSighash, "Payout input 0");
    } catch (err) {
      const e = err as SighashMismatchError;
      expect(e.context).toBe("Payout input 0");
      expect(e.expected).toBe(wrongSighash);
      expect(e.computed).toHaveLength(64);
      expect(e.message).toContain("Sighash mismatch for Payout input 0");
      expect(e.message).toContain(wrongSighash);
    }
  });
});
