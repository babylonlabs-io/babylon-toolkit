/**
 * Tests for assertScriptPathSchnorrSignature — BIP-340 verification of a
 * wallet-returned Taproot script-path signature against an independently
 * recomputed sighash (Critical Path #7).
 *
 * The positive cases build a PSBT exactly as the SDK does (witnessUtxo on every
 * input, one tapLeafScript on the signed input), compute the real BIP-341
 * script-path sighash, and sign it with a test key. The negative cases model the
 * threat scenarios the guard exists for: a tweaked/wrong-key signature, a tampered
 * signature, and a wallet that keeps the unsigned tx but substitutes prevout
 * metadata.
 */

import { Buffer } from "buffer";

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { sha256 } from "@noble/hashes/sha2.js";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { TAPSCRIPT_LEAF_VERSION } from "../../utils/bitcoin";
import { assertScriptPathSchnorrSignature } from "../verifyScriptPathSchnorrSignature";
import { DUMMY_TXID_1, NULL_TXID } from "./constants";

// Deterministic test private keys (valid secp256k1 scalars).
const SIGNER_PRIV = Buffer.alloc(32, 1);
const OTHER_PRIV = Buffer.alloc(32, 7);

function xOnlyHex(priv: Buffer): string {
  const xOnly = ecc.xOnlyPointFromScalar(priv);
  return Buffer.from(xOnly).toString("hex");
}

/** BIP-340 tagged hash, matching the helper and bip322Verify.ts. */
function taggedHash(tag: string, data: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag));
  const preimage = new Uint8Array(tagHash.length * 2 + data.length);
  preimage.set(tagHash, 0);
  preimage.set(tagHash, tagHash.length);
  preimage.set(data, tagHash.length * 2);
  return sha256(preimage);
}

/** A realistic single-key tapscript leaf: `<32-byte pubkey> OP_CHECKSIG`. */
function checksigLeafScript(signerXOnly: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x20]),
    Buffer.from(signerXOnly, "hex"),
    Buffer.from([0xac]),
  ]);
}

interface BuildPsbtArgs {
  signerXOnly: string;
  input0Value: number;
  input1Value: number;
}

/**
 * Build a two-input payout-shaped PSBT: input 0 is the depositor's script-path
 * input (witnessUtxo + one tapLeafScript), input 1 carries witnessUtxo only.
 */
function buildSignablePsbt({
  signerXOnly,
  input0Value,
  input1Value,
}: BuildPsbtArgs): string {
  const leafScript = checksigLeafScript(signerXOnly);
  const psbt = new Psbt();
  psbt.addInput({
    hash: NULL_TXID,
    index: 0,
    witnessUtxo: {
      script: Buffer.from(`5120${signerXOnly}`, "hex"),
      value: input0Value,
    },
    tapLeafScript: [
      {
        leafVersion: TAPSCRIPT_LEAF_VERSION,
        script: leafScript,
        controlBlock: Buffer.concat([
          Buffer.from([TAPSCRIPT_LEAF_VERSION]),
          Buffer.alloc(32, 2),
        ]),
      },
    ],
    tapInternalKey: Buffer.alloc(32, 3),
  });
  psbt.addInput({
    hash: DUMMY_TXID_1,
    index: 1,
    witnessUtxo: {
      script: Buffer.from("0014" + "ab".repeat(20), "hex"),
      value: input1Value,
    },
  });
  psbt.addOutput({
    script: Buffer.from(`5120${signerXOnly}`, "hex"),
    value: input0Value + input1Value - 1000,
  });
  return psbt.toHex();
}

/**
 * Reconstruct the unsigned tx from `psbtHex`, compute the BIP-341 script-path
 * sighash for input 0, and sign it with `priv`. Returns the 64-byte sig as hex.
 * `prevoutValues` lets a test sign over deliberately wrong prevout amounts.
 */
function signInput0(
  psbtHex: string,
  priv: Buffer,
  prevoutValues?: number[],
): string {
  const psbt = Psbt.fromHex(psbtHex);
  const leaf = psbt.data.inputs[0].tapLeafScript![0];
  const leafHash = taggedHash(
    "TapLeaf",
    Buffer.concat([
      Buffer.from([leaf.leafVersion]),
      Buffer.from([leaf.script.length]),
      leaf.script,
    ]),
  );

  const prevOutScripts = psbt.data.inputs.map((i) => i.witnessUtxo!.script);
  const values =
    prevoutValues ?? psbt.data.inputs.map((i) => i.witnessUtxo!.value);

  const tx = new Transaction();
  tx.version = psbt.version;
  tx.locktime = psbt.locktime;
  for (const input of psbt.txInputs) {
    tx.addInput(input.hash, input.index, input.sequence);
  }
  for (const output of psbt.txOutputs) {
    tx.addOutput(output.script, output.value);
  }

  const sighash = tx.hashForWitnessV1(
    0,
    prevOutScripts,
    values,
    Transaction.SIGHASH_DEFAULT,
    Buffer.from(leafHash),
  );
  return Buffer.from(ecc.signSchnorr(sighash, priv)).toString("hex");
}

describe("assertScriptPathSchnorrSignature", () => {
  const signerXOnly = xOnlyHex(SIGNER_PRIV);

  it("accepts a valid script-path signature over the requested PSBT", () => {
    const psbtHex = buildSignablePsbt({
      signerXOnly,
      input0Value: 100_000,
      input1Value: 50_000,
    });
    const signatureHex = signInput0(psbtHex, SIGNER_PRIV);

    expect(() =>
      assertScriptPathSchnorrSignature({
        requestedPsbtHex: psbtHex,
        signatureHex,
        signerXOnlyPubkeyHex: signerXOnly,
        inputIndex: 0,
      }),
    ).not.toThrow();
  });

  it("rejects a signature by a different key (wrong/tweaked signer)", () => {
    const psbtHex = buildSignablePsbt({
      signerXOnly,
      input0Value: 100_000,
      input1Value: 50_000,
    });
    // Sign the correct sighash but with a different private key — models a wallet
    // that signed with the tweaked key instead of the untweaked script-path key.
    const signatureHex = signInput0(psbtHex, OTHER_PRIV);

    expect(() =>
      assertScriptPathSchnorrSignature({
        requestedPsbtHex: psbtHex,
        signatureHex,
        signerXOnlyPubkeyHex: signerXOnly,
        inputIndex: 0,
      }),
    ).toThrow(/does not verify/);
  });

  it("rejects a tampered (flipped-byte) signature stub", () => {
    const psbtHex = buildSignablePsbt({
      signerXOnly,
      input0Value: 100_000,
      input1Value: 50_000,
    });
    const valid = signInput0(psbtHex, SIGNER_PRIV);
    const tamperedBytes = Buffer.from(valid, "hex");
    tamperedBytes[0] ^= 0xff;
    const signatureHex = tamperedBytes.toString("hex");

    expect(() =>
      assertScriptPathSchnorrSignature({
        requestedPsbtHex: psbtHex,
        signatureHex,
        signerXOnlyPubkeyHex: signerXOnly,
        inputIndex: 0,
      }),
    ).toThrow(/does not verify/);
  });

  it("rejects a signature made over substituted prevout amounts", () => {
    const psbtHex = buildSignablePsbt({
      signerXOnly,
      input0Value: 100_000,
      input1Value: 50_000,
    });
    // Wallet signs over the same unsigned tx but different prevout values. Verifying
    // against the requested PSBT's real prevouts must reject — this is why the guard
    // uses the locally-built PSBT, not the wallet-returned metadata.
    const signatureHex = signInput0(psbtHex, SIGNER_PRIV, [999_999, 50_000]);

    expect(() =>
      assertScriptPathSchnorrSignature({
        requestedPsbtHex: psbtHex,
        signatureHex,
        signerXOnlyPubkeyHex: signerXOnly,
        inputIndex: 0,
      }),
    ).toThrow(/does not verify/);
  });

  it("throws when an input lacks witnessUtxo (cannot recompute sighash)", () => {
    const psbt = new Psbt();
    psbt.addInput({
      hash: NULL_TXID,
      index: 0,
      tapLeafScript: [
        {
          leafVersion: TAPSCRIPT_LEAF_VERSION,
          script: checksigLeafScript(signerXOnly),
          controlBlock: Buffer.alloc(33, 0xc0),
        },
      ],
    });
    psbt.addOutput({
      script: Buffer.from(`5120${signerXOnly}`, "hex"),
      value: 1_000,
    });

    expect(() =>
      assertScriptPathSchnorrSignature({
        requestedPsbtHex: psbt.toHex(),
        signatureHex: "00".repeat(64),
        signerXOnlyPubkeyHex: signerXOnly,
        inputIndex: 0,
      }),
    ).toThrow(/no witnessUtxo/);
  });

  it("throws when the signed input has no tapLeafScript", () => {
    const psbt = new Psbt();
    psbt.addInput({
      hash: NULL_TXID,
      index: 0,
      witnessUtxo: {
        script: Buffer.from(`5120${signerXOnly}`, "hex"),
        value: 100_000,
      },
    });
    psbt.addOutput({
      script: Buffer.from(`5120${signerXOnly}`, "hex"),
      value: 99_000,
    });

    expect(() =>
      assertScriptPathSchnorrSignature({
        requestedPsbtHex: psbt.toHex(),
        signatureHex: "00".repeat(64),
        signerXOnlyPubkeyHex: signerXOnly,
        inputIndex: 0,
      }),
    ).toThrow(/exactly one tapLeafScript/);
  });

  it("throws on a signature of the wrong length", () => {
    const psbtHex = buildSignablePsbt({
      signerXOnly,
      input0Value: 100_000,
      input1Value: 50_000,
    });

    expect(() =>
      assertScriptPathSchnorrSignature({
        requestedPsbtHex: psbtHex,
        signatureHex: "00".repeat(63),
        signerXOnlyPubkeyHex: signerXOnly,
        inputIndex: 0,
      }),
    ).toThrow(/must be 128 hex chars/);
  });

  it("throws when the input index is out of range", () => {
    const psbtHex = buildSignablePsbt({
      signerXOnly,
      input0Value: 100_000,
      input1Value: 50_000,
    });
    const signatureHex = signInput0(psbtHex, SIGNER_PRIV);

    expect(() =>
      assertScriptPathSchnorrSignature({
        requestedPsbtHex: psbtHex,
        signatureHex,
        signerXOnlyPubkeyHex: signerXOnly,
        inputIndex: 5,
      }),
    ).toThrow(/out of range/);
  });
});
