/**
 * Tests for the key-path twin of the script-path verifier: BIP-340 verification
 * of wallet-returned Taproot KEY-PATH signatures against an independently
 * recomputed sighash over the PSBT we requested.
 *
 * The positive cases sign the real BIP-341 key-path sighash with a BIP-86
 * tweaked test key. The negative cases model what the guard exists for: a
 * tampered signature, a missing signature, a substituted input set, and a
 * malformed finalized witness.
 */

import { Buffer } from "buffer";

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import {
  crypto as bcrypto,
  initEccLib,
  payments,
  Psbt,
  Transaction,
} from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import {
  assertKeyPathSchnorrSignature,
  assertReturnedKeyPathSignatures,
} from "../verifyKeyPathSchnorrSignature";

initEccLib(ecc);

// Deterministic test key; BIP-86 tweak the private key so we can sign key-path.
const PRIV = Buffer.alloc(32, 7);
const PUB = Buffer.from(ecc.pointFromScalar(PRIV, true)!); // 33 bytes
const X_ONLY = PUB.subarray(1);
function tweakedPrivateKey(): Buffer {
  const priv = PUB[0] === 0x03 ? Buffer.from(ecc.privateNegate(PRIV)) : PRIV; // even-Y for BIP-340
  const tweak = bcrypto.taggedHash("TapTweak", X_ONLY);
  return Buffer.from(ecc.privateAdd(priv, tweak)!);
}
const P2TR = payments.p2tr({ internalPubkey: X_ONLY }).output!;
const OUTPUT_KEY = P2TR.subarray(2);

function requestedPsbt(): Psbt {
  const psbt = new Psbt();
  psbt.addInput({
    hash: Buffer.alloc(32, 1),
    index: 0,
    witnessUtxo: { script: P2TR, value: 100_000 },
    tapInternalKey: X_ONLY,
  });
  psbt.addInput({
    hash: Buffer.alloc(32, 2),
    index: 1,
    witnessUtxo: { script: P2TR, value: 50_000 },
    tapInternalKey: X_ONLY,
  });
  psbt.addOutput({
    script: Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0xaa)]),
    value: 140_000,
  });
  return psbt;
}
function keyPathSighash(
  psbt: Psbt,
  inputIndex: number,
  hashType: number,
): Buffer {
  const tx = Transaction.fromBuffer(psbt.data.globalMap.unsignedTx.toBuffer());
  const scripts = psbt.data.inputs.map((i) => i.witnessUtxo!.script);
  const values = psbt.data.inputs.map((i) => i.witnessUtxo!.value);
  return tx.hashForWitnessV1(inputIndex, scripts, values, hashType);
}
function sign(
  psbt: Psbt,
  inputIndex: number,
  hashType = Transaction.SIGHASH_DEFAULT,
): Buffer {
  return Buffer.from(
    ecc.signSchnorr(
      keyPathSighash(psbt, inputIndex, hashType),
      tweakedPrivateKey(),
      Buffer.alloc(32, 0),
    ),
  );
}

describe("assertKeyPathSchnorrSignature", () => {
  it("accepts a valid key-path signature over the requested PSBT", () => {
    const psbt = requestedPsbt();
    expect(() =>
      assertKeyPathSchnorrSignature({
        requestedPsbtHex: psbt.toHex(),
        signatureHex: sign(psbt, 1).toString("hex"),
        inputIndex: 1,
      }),
    ).not.toThrow();
    // Sanity: the signature really is against the tweaked output key.
    expect(
      ecc.verifySchnorr(keyPathSighash(psbt, 1, 0), OUTPUT_KEY, sign(psbt, 1)),
    ).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const psbt = requestedPsbt();
    const sig = sign(psbt, 0);
    sig[5] ^= 0x01;
    expect(() =>
      assertKeyPathSchnorrSignature({
        requestedPsbtHex: psbt.toHex(),
        signatureHex: sig.toString("hex"),
        inputIndex: 0,
      }),
    ).toThrow(/does not verify/);
  });

  it("rejects inputs that are not key-path (tapLeafScript / tapMerkleRoot / missing tapInternalKey / non-P2TR)", () => {
    const p = requestedPsbt();
    p.updateInput(0, { tapMerkleRoot: Buffer.alloc(32, 3) });
    expect(() =>
      assertKeyPathSchnorrSignature({
        requestedPsbtHex: p.toHex(),
        signatureHex: "00".repeat(64),
        inputIndex: 0,
      }),
    ).toThrow(/key-path/);
    const q = new Psbt();
    q.addInput({
      hash: Buffer.alloc(32, 1),
      index: 0,
      witnessUtxo: {
        script: Buffer.from("0014" + "11".repeat(20), "hex"),
        value: 1,
      },
    });
    q.addOutput({ script: Buffer.from([0x6a]), value: 0 });
    expect(() =>
      assertKeyPathSchnorrSignature({
        requestedPsbtHex: q.toHex(),
        signatureHex: "00".repeat(64),
        inputIndex: 0,
      }),
    ).toThrow(/key-path/);
  });
});

describe("assertReturnedKeyPathSignatures", () => {
  it("verifies tapKeySig on every eligible input (unfinalized return)", () => {
    const req = requestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    ret.updateInput(0, { tapKeySig: sign(req, 0) });
    ret.updateInput(1, { tapKeySig: sign(req, 1) });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).not.toThrow();
  });

  it("verifies the single finalized witness item when the wallet auto-finalized", () => {
    const req = requestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    ret.updateInput(0, { tapKeySig: sign(req, 0) });
    ret.updateInput(1, { tapKeySig: sign(req, 1) });
    ret.finalizeAllInputs(); // drops tapKeySig, keeps finalScriptWitness = 01 40 ‖ sig
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).not.toThrow();
  });

  it("accepts an input carrying both a tapKeySig and a matching finalized witness", () => {
    const req = requestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    const sig0 = sign(req, 0);
    ret.updateInput(0, {
      tapKeySig: sig0,
      finalScriptWitness: Buffer.concat([Buffer.from([0x01, 0x40]), sig0]),
    });
    ret.updateInput(1, { tapKeySig: sign(req, 1) });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).not.toThrow();
  });

  it("throws when the finalized witness disagrees with the tapKeySig on the same input", () => {
    // The consumers broadcast the witness bytes, so a valid tapKeySig must not
    // launder a different witness signature past the check.
    const req = requestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    const other = sign(req, 1); // valid signature, wrong input
    ret.updateInput(0, {
      tapKeySig: sign(req, 0),
      finalScriptWitness: Buffer.concat([Buffer.from([0x01, 0x40]), other]),
    });
    ret.updateInput(1, { tapKeySig: other });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).toThrow(/input 0 finalized witness does not match its tapKeySig/);
  });

  it("accepts a 65-byte SIGHASH_ALL tapKeySig and verifies it under SIGHASH_ALL", () => {
    const req = requestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    ret.updateInput(0, {
      tapKeySig: Buffer.concat([
        sign(req, 0, Transaction.SIGHASH_ALL),
        Buffer.from([0x01]),
      ]),
    });
    ret.updateInput(1, { tapKeySig: sign(req, 1) });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).not.toThrow();
  });

  it("throws when an eligible input has no signature, or the returned PSBT has a different input count", () => {
    const req = requestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    ret.updateInput(0, { tapKeySig: sign(req, 0) });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).toThrow(/input 1 .*no key-path signature/);
    const fewer = new Psbt();
    fewer.addInput({
      hash: Buffer.alloc(32, 1),
      index: 0,
      witnessUtxo: { script: P2TR, value: 1 },
      tapInternalKey: X_ONLY,
    });
    fewer.addOutput({ script: Buffer.from([0x6a]), value: 0 });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: fewer.toHex(),
      }),
    ).toThrow(/input count/);
  });

  it("rejects a finalized witness with trailing bytes or a truncated multi-byte length", () => {
    const req = requestedPsbt();
    const sig = sign(req, 0);
    const withTrailing = Psbt.fromHex(req.toHex());
    withTrailing.updateInput(0, {
      finalScriptWitness: Buffer.concat([
        Buffer.from([0x01, 0x40]),
        sig,
        Buffer.from([0xff]),
      ]),
    });
    withTrailing.updateInput(1, { tapKeySig: sign(req, 1) });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: withTrailing.toHex(),
      }),
    ).toThrow(/trailing bytes/);
    const truncated = Psbt.fromHex(req.toHex());
    truncated.updateInput(0, {
      finalScriptWitness: Buffer.from([0x01, 0xfd, 0x40]),
    });
    truncated.updateInput(1, { tapKeySig: sign(req, 1) });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: truncated.toHex(),
      }),
    ).toThrow(/truncated/);
  });

  it("rejects a non-minimal CompactSize length, as rust-bitcoin does", () => {
    // vaultd decodes with rust-bitcoin, whose VarInt::consensus_decode returns
    // NonMinimalVarInt for 0xfd carrying < 0xfd — accepting it here would wave
    // through a witness the network rejects.
    const req = requestedPsbt();
    const nonMinimal = Psbt.fromHex(req.toHex());
    nonMinimal.updateInput(0, {
      // item count 1, then 0xfd-encoded length 0x0040 instead of the 1-byte 0x40.
      finalScriptWitness: Buffer.concat([
        Buffer.from([0x01, 0xfd, 0x40, 0x00]),
        sign(req, 0),
      ]),
    });
    nonMinimal.updateInput(1, { tapKeySig: sign(req, 1) });

    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: nonMinimal.toHex(),
      }),
    ).toThrow(/non-minimal/);
  });

  it("skips inputs that are not key-path eligible (script-path inputs are the script-path verifier's job)", () => {
    const req = new Psbt();
    req.addInput({
      hash: Buffer.alloc(32, 1),
      index: 0,
      witnessUtxo: { script: P2TR, value: 1 },
      tapInternalKey: X_ONLY,
      tapLeafScript: [
        {
          leafVersion: 0xc0,
          script: Buffer.from([0x51]),
          controlBlock: Buffer.concat([Buffer.from([0xc0]), X_ONLY]),
        },
      ],
    });
    req.addOutput({ script: Buffer.from([0x6a]), value: 0 });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: req.toHex(),
      }),
    ).not.toThrow();
  });
});
