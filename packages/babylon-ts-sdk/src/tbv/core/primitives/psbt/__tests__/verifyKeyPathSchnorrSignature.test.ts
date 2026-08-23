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
import { sha256 } from "@noble/hashes/sha2.js";
import {
  crypto as bcrypto,
  script as bscript,
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

// ── P2WPKH (Native SegWit funding) helpers ──
// Signed in-test with the same key material; the verifier under test mirrors
// btc-vault `crates/btc-wallet-remote/src/client.rs verify_finalized_p2wpkh_spend`.
const P2WPKH_PAYMENT = payments.p2wpkh({ pubkey: PUB });
const P2WPKH_SCRIPT = P2WPKH_PAYMENT.output!;

function p2wpkhScriptCode(pubkey: Buffer): Buffer {
  return payments.p2pkh({ hash: bcrypto.hash160(pubkey) }).output!;
}

function p2wpkhRequestedPsbt(values: number[] = [100_000, 50_000]): Psbt {
  const psbt = new Psbt();
  values.forEach((value, i) => {
    psbt.addInput({
      hash: Buffer.alloc(32, i + 1),
      index: i,
      witnessUtxo: { script: P2WPKH_SCRIPT, value },
    });
  });
  psbt.addOutput({
    script: Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0xaa)]),
    value: 140_000,
  });
  return psbt;
}

/** DER ‖ sighash-byte signature over the BIP-143 sighash of one input. */
function signP2wpkh(
  psbt: Psbt,
  inputIndex: number,
  overrides: { value?: number; hashType?: number; priv?: Buffer } = {},
): Buffer {
  const value =
    overrides.value ?? psbt.data.inputs[inputIndex].witnessUtxo!.value;
  const hashType = overrides.hashType ?? Transaction.SIGHASH_ALL;
  const priv = overrides.priv ?? PRIV;
  const tx = Transaction.fromBuffer(psbt.data.globalMap.unsignedTx.toBuffer());
  const pub = Buffer.from(ecc.pointFromScalar(priv, true)!);
  const sighash = tx.hashForWitnessV0(
    inputIndex,
    p2wpkhScriptCode(pub),
    value,
    hashType,
  );
  return Buffer.from(
    bscript.signature.encode(Buffer.from(ecc.sign(sighash, priv)), hashType),
  );
}

/** Consensus 2-item witness `[sig, pubkey]` (or another item list for tampering). */
function p2wpkhWitness(items: Buffer[]): Buffer {
  return Buffer.concat([
    Buffer.from([items.length]),
    ...items.map((item) => Buffer.concat([Buffer.from([item.length]), item])),
  ]);
}

describe("assertReturnedKeyPathSignatures — P2WPKH inputs", () => {
  it("verifies partialSig on every P2WPKH input (unfinalized return)", () => {
    const req = p2wpkhRequestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    ret.updateInput(0, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 0) }],
    });
    ret.updateInput(1, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 1) }],
    });
    expect(
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).toBe(0); // count stays key-path-only; P2WPKH failures throw instead
  });

  it("verifies the finalized 2-item witness when the wallet auto-finalized", () => {
    const req = p2wpkhRequestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    ret.updateInput(0, {
      finalScriptWitness: p2wpkhWitness([signP2wpkh(req, 0), PUB]),
    });
    ret.updateInput(1, {
      finalScriptWitness: p2wpkhWitness([signP2wpkh(req, 1), PUB]),
    });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).not.toThrow();
  });

  it("throws when a P2WPKH input carries no signature", () => {
    const req = p2wpkhRequestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    ret.updateInput(0, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 0) }],
    });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).toThrow(/input 1 carries no P2WPKH signature/);
  });

  it("throws when the signature is tampered, naming the input", () => {
    const req = p2wpkhRequestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    const sig = signP2wpkh(req, 0);
    sig[10] ^= 0x01; // inside the DER r value
    ret.updateInput(0, { partialSig: [{ pubkey: PUB, signature: sig }] });
    ret.updateInput(1, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 1) }],
    });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).toThrow(/input 0 does not verify/);
  });

  it("throws on a wrong prevout value (sighash mismatch)", () => {
    const req = p2wpkhRequestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    ret.updateInput(0, {
      partialSig: [
        { pubkey: PUB, signature: signP2wpkh(req, 0, { value: 100_001 }) },
      ],
    });
    ret.updateInput(1, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 1) }],
    });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).toThrow(/input 0 does not verify/);
  });

  it("rejects a cryptographically valid SIGHASH_NONE signature, naming the input", () => {
    // Without the SIGHASH_ALL-only gate (client.rs:981-987) this would verify.
    const req = p2wpkhRequestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    ret.updateInput(0, {
      partialSig: [
        {
          pubkey: PUB,
          signature: signP2wpkh(req, 0, { hashType: Transaction.SIGHASH_NONE }),
        },
      ],
    });
    ret.updateInput(1, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 1) }],
    });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).toThrow(/input 0.*SIGHASH_ALL/);
  });

  it("rejects corrupted DER and an undefined hashtype byte, naming the input", () => {
    const req = p2wpkhRequestedPsbt();
    const badDer = Psbt.fromHex(req.toHex());
    const mangled = signP2wpkh(req, 0);
    mangled[0] = 0x31; // DER sequence tag must be 0x30
    // Direct assignment: bip174 refuses mangled DER via updateInput, but its
    // PARSER doesn't validate signature bytes — a wallet can return this.
    badDer.data.inputs[0].partialSig = [{ pubkey: PUB, signature: mangled }];
    badDer.updateInput(1, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 1) }],
    });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: badDer.toHex(),
      }),
    ).toThrow(/input 0/);

    const badType = Psbt.fromHex(req.toHex());
    const zeroType = signP2wpkh(req, 0);
    zeroType[zeroType.length - 1] = 0x00; // not a defined sighash type
    badType.data.inputs[0].partialSig = [{ pubkey: PUB, signature: zeroType }];
    badType.updateInput(1, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 1) }],
    });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: badType.toHex(),
      }),
    ).toThrow(/input 0/);
  });

  it("rejects a pubkey that does not hash to the prevout's witness program", () => {
    const req = p2wpkhRequestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    const otherPriv = Buffer.alloc(32, 9);
    const otherPub = Buffer.from(ecc.pointFromScalar(otherPriv, true)!);
    ret.updateInput(0, {
      finalScriptWitness: p2wpkhWitness([
        signP2wpkh(req, 0, { priv: otherPriv }),
        otherPub,
      ]),
    });
    ret.updateInput(1, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 1) }],
    });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).toThrow(/witness program/);
  });

  it("rejects a finalized witness with the wrong item count or a non-33-byte pubkey", () => {
    const req = p2wpkhRequestedPsbt();
    const sig = signP2wpkh(req, 0);
    const threeItems = Psbt.fromHex(req.toHex());
    threeItems.updateInput(0, {
      finalScriptWitness: p2wpkhWitness([sig, PUB, Buffer.from([0x01])]),
    });
    threeItems.updateInput(1, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 1) }],
    });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: threeItems.toHex(),
      }),
    ).toThrow(/exactly 2 items/);

    const xOnlyPub = Psbt.fromHex(req.toHex());
    xOnlyPub.updateInput(0, {
      finalScriptWitness: p2wpkhWitness([sig, PUB.subarray(1)]),
    });
    xOnlyPub.updateInput(1, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 1) }],
    });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: xOnlyPub.toHex(),
      }),
    ).toThrow(/33 bytes/);
  });

  it("throws when a finalized witness disagrees with the partialSig on the same input", () => {
    // The consumers broadcast the witness bytes, so a valid partialSig must
    // not launder a different witness signature past the check.
    const req = p2wpkhRequestedPsbt();
    const ret = Psbt.fromHex(req.toHex());
    ret.updateInput(0, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 0) }],
      finalScriptWitness: p2wpkhWitness([signP2wpkh(req, 1), PUB]),
    });
    ret.updateInput(1, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 1) }],
    });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).toThrow(/input 0.*does not match its partialSig/);
  });

  it("verifies a mixed PSBT and still counts only key-path inputs", () => {
    const req = new Psbt();
    req.addInput({
      hash: Buffer.alloc(32, 1),
      index: 0,
      witnessUtxo: { script: P2TR, value: 100_000 },
      tapInternalKey: X_ONLY,
    });
    req.addInput({
      hash: Buffer.alloc(32, 2),
      index: 1,
      witnessUtxo: { script: P2WPKH_SCRIPT, value: 50_000 },
    });
    req.addOutput({
      script: Buffer.concat([
        Buffer.from([0x51, 0x20]),
        Buffer.alloc(32, 0xaa),
      ]),
      value: 140_000,
    });
    const ret = Psbt.fromHex(req.toHex());
    ret.updateInput(0, { tapKeySig: sign(req, 0) });
    ret.updateInput(1, {
      partialSig: [{ pubkey: PUB, signature: signP2wpkh(req, 1) }],
    });
    expect(
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: ret.toHex(),
      }),
    ).toBe(1);
  });

  it("still skips genuinely unknown script types (P2WSH)", () => {
    const req = new Psbt();
    req.addInput({
      hash: Buffer.alloc(32, 1),
      index: 0,
      witnessUtxo: {
        script: Buffer.concat([
          Buffer.from([0x00, 0x20]),
          Buffer.alloc(32, 0x33),
        ]),
        value: 1_000,
      },
    });
    req.addOutput({ script: Buffer.from([0x6a]), value: 0 });
    expect(() =>
      assertReturnedKeyPathSignatures({
        requestedPsbtHex: req.toHex(),
        returnedPsbtHex: req.toHex(),
      }),
    ).not.toThrow();
  });

  it("differential over varied keys and values: accepts honest signatures, rejects one-byte tampering", () => {
    // CLAUDE.md §9: golden vectors plus varied inputs, not one pinned vector.
    // Keys/values derive from a hash counter so failures are reproducible.
    const utf8 = (s: string) => new TextEncoder().encode(s);
    for (let i = 0; i < 6; i++) {
      const priv = Buffer.from(sha256(utf8(`p2wpkh-differential-${i}`)));
      const pub = Buffer.from(ecc.pointFromScalar(priv, true)!);
      const value = 1_000 + (priv.readUInt32BE(0) % 5_000_000);
      const script = payments.p2wpkh({ pubkey: pub }).output!;
      const req = new Psbt();
      req.addInput({
        hash: Buffer.from(sha256(utf8(`prevout-${i}`))),
        index: 0,
        witnessUtxo: { script, value },
      });
      req.addOutput({ script: Buffer.from([0x6a]), value: 0 });
      const sig = signP2wpkh(req, 0, { priv });

      const honest = Psbt.fromHex(req.toHex());
      honest.updateInput(0, {
        finalScriptWitness: p2wpkhWitness([sig, pub]),
      });
      expect(() =>
        assertReturnedKeyPathSignatures({
          requestedPsbtHex: req.toHex(),
          returnedPsbtHex: honest.toHex(),
        }),
      ).not.toThrow();

      const tampered = Psbt.fromHex(req.toHex());
      const badSig = Buffer.from(sig);
      badSig[12 + (i % 8)] ^= 0x01;
      tampered.updateInput(0, {
        finalScriptWitness: p2wpkhWitness([badSig, pub]),
      });
      expect(() =>
        assertReturnedKeyPathSignatures({
          requestedPsbtHex: req.toHex(),
          returnedPsbtHex: tampered.toHex(),
        }),
      ).toThrow(/input 0/);
    }
  });
});
