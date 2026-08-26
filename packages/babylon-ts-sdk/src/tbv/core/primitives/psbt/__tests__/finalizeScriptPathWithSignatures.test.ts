/**
 * Tests for finalizeScriptPathWithSignatures.
 *
 * The point of this primitive is that the wallet's PSBT never reaches
 * bitcoinjs's finalizer, so the tests build a real reclaim PSBT, sign it for
 * real, and assert the witness that comes out — including the case that
 * motivated it, where the wallet returns a key-path signature alongside a valid
 * script-path one.
 */

import { Buffer } from "buffer";

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { computeTapLeafHash } from "../../utils/taproot";
import { deriveDepositorClaimDescriptor } from "../depositorClaim";
import { finalizeScriptPathWithSignatures } from "../finalizeScriptPathWithSignatures";
import { buildReclaimPsbt } from "../reclaim";

const DEPOSITOR_PRIV = Buffer.alloc(32, 5);
const DEPOSITOR_XONLY = Buffer.from(
  ecc.xOnlyPointFromScalar(DEPOSITOR_PRIV),
).toString("hex");

const CLAIM_VALUE = 33_000n;
const FEE_SATS = 645n;

/** A PegIn shaped like the real one: vault output at vout 0, reserve at vout 1. */
function makePeginTxHex(): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 9), 0);
  tx.addOutput(
    Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 1)]),
    500_000,
  );
  tx.addOutput(
    deriveDepositorClaimDescriptor(DEPOSITOR_XONLY).scriptPubKey,
    Number(CLAIM_VALUE),
  );
  return tx.toHex();
}

/** The 1-in/1-out reclaim PSBT the SDK would build and send to the wallet. */
function buildRequestedPsbtHex(): string {
  const peginTxHex = makePeginTxHex();
  const { scriptPubKey } = deriveDepositorClaimDescriptor(DEPOSITOR_XONLY);
  return buildReclaimPsbt({
    depositorPubkey: DEPOSITOR_XONLY,
    inputs: [
      {
        depositorSignedPeginTxHex: peginTxHex,
        observed: {
          txid: Transaction.fromHex(peginTxHex).getId(),
          vout: 1,
          scriptPubKey: scriptPubKey.toString("hex"),
          value: CLAIM_VALUE,
        },
        expectedValue: CLAIM_VALUE,
      },
    ],
    feeSats: FEE_SATS,
  }).psbtHex;
}

/** Genuine BIP-340 script-path signature over input `inputIndex`. */
function signInput(psbtHex: string, inputIndex: number): string {
  const psbt = Psbt.fromHex(psbtHex);
  const leaf = psbt.data.inputs[inputIndex].tapLeafScript![0];

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
    inputIndex,
    psbt.data.inputs.map((i) => i.witnessUtxo!.script),
    psbt.data.inputs.map((i) => i.witnessUtxo!.value),
    Transaction.SIGHASH_DEFAULT,
    computeTapLeafHash(leaf.leafVersion, leaf.script),
  );

  return Buffer.from(ecc.signSchnorr(sighash, DEPOSITOR_PRIV)).toString("hex");
}

describe("finalizeScriptPathWithSignatures", () => {
  it("produces a script-path witness of signature, leaf script and control block", () => {
    const psbtHex = buildRequestedPsbtHex();
    const signature = signInput(psbtHex, 0);
    const descriptor = deriveDepositorClaimDescriptor(DEPOSITOR_XONLY);

    const txHex = finalizeScriptPathWithSignatures({
      requestedPsbtHex: psbtHex,
      signaturesHex: [signature],
      signerXOnlyPubkeyHex: DEPOSITOR_XONLY,
    });

    const witness = Transaction.fromHex(txHex).ins[0].witness;
    expect(witness).toHaveLength(3);
    expect(Buffer.from(witness[0]).toString("hex")).toBe(signature);
    expect(Buffer.from(witness[1])).toEqual(descriptor.leafScript);
    expect(Buffer.from(witness[2])).toEqual(descriptor.controlBlock);
  });

  it("ignores a key-path signature the wallet added to its own PSBT", () => {
    // The failure this primitive exists for. bitcoinjs checks key spend first,
    // so finalizing the wallet's copy would emit a single-element key-path
    // witness against the NUMS internal key and the broadcast would be
    // rejected. Only the verified signature crosses over, so the wallet's
    // extra field cannot reach the witness.
    const psbtHex = buildRequestedPsbtHex();
    const signature = signInput(psbtHex, 0);

    const walletReturned = Psbt.fromHex(psbtHex);
    walletReturned.updateInput(0, {
      tapKeySig: Buffer.alloc(64, 0xff),
      tapScriptSig: [
        {
          pubkey: Buffer.from(DEPOSITOR_XONLY, "hex"),
          leafHash: computeTapLeafHash(
            walletReturned.data.inputs[0].tapLeafScript![0].leafVersion,
            walletReturned.data.inputs[0].tapLeafScript![0].script,
          ),
          signature: Buffer.from(signature, "hex"),
        },
      ],
    });
    // Sanity: the wallet's copy really would finalize to a key-path witness.
    expect(
      Transaction.fromHex(
        walletReturned.finalizeAllInputs().extractTransaction().toHex(),
      ).ins[0].witness,
    ).toHaveLength(1);

    const txHex = finalizeScriptPathWithSignatures({
      requestedPsbtHex: psbtHex,
      signaturesHex: [signature],
      signerXOnlyPubkeyHex: DEPOSITOR_XONLY,
    });

    expect(Transaction.fromHex(txHex).ins[0].witness).toHaveLength(3);
  });

  it("matches the old finalize-the-wallet's-PSBT result when the wallet is honest", () => {
    // The two paths are only meant to differ when the returned PSBT differs. An
    // honest wallet returns the same per-input metadata it was given, and for
    // that case this must be byte-for-byte what finalizing the wallet's copy
    // produced — otherwise the change would be altering more than the trust
    // boundary it set out to move.
    const psbtHex = buildRequestedPsbtHex();
    const signature = signInput(psbtHex, 0);

    const honestWalletReturn = Psbt.fromHex(psbtHex);
    honestWalletReturn.updateInput(0, {
      tapScriptSig: [
        {
          pubkey: Buffer.from(DEPOSITOR_XONLY, "hex"),
          leafHash: computeTapLeafHash(
            honestWalletReturn.data.inputs[0].tapLeafScript![0].leafVersion,
            honestWalletReturn.data.inputs[0].tapLeafScript![0].script,
          ),
          signature: Buffer.from(signature, "hex"),
        },
      ],
    });
    const previousBehaviour = honestWalletReturn
      .finalizeAllInputs()
      .extractTransaction()
      .toHex();

    const current = finalizeScriptPathWithSignatures({
      requestedPsbtHex: psbtHex,
      signaturesHex: [signature],
      signerXOnlyPubkeyHex: DEPOSITOR_XONLY,
    });

    expect(current).toBe(previousBehaviour);
  });

  it("refuses when a signature is missing for some input", () => {
    const psbtHex = buildRequestedPsbtHex();

    expect(() =>
      finalizeScriptPathWithSignatures({
        requestedPsbtHex: psbtHex,
        signaturesHex: [],
        signerXOnlyPubkeyHex: DEPOSITOR_XONLY,
      }),
    ).toThrow(/0 signature\(s\) for 1 input\(s\)/);
  });

  it("refuses a signature that is not 64 bytes", () => {
    const psbtHex = buildRequestedPsbtHex();

    expect(() =>
      finalizeScriptPathWithSignatures({
        requestedPsbtHex: psbtHex,
        signaturesHex: ["aa".repeat(63)],
        signerXOnlyPubkeyHex: DEPOSITOR_XONLY,
      }),
    ).toThrow(/must be 128 hex chars/);
  });

  it("refuses a locally built PSBT that already carries a key-path signature", () => {
    const psbtHex = buildRequestedPsbtHex();
    const signature = signInput(psbtHex, 0);
    const psbt = Psbt.fromHex(psbtHex);
    psbt.updateInput(0, { tapKeySig: Buffer.alloc(64, 0xff) });

    expect(() =>
      finalizeScriptPathWithSignatures({
        requestedPsbtHex: psbt.toHex(),
        signaturesHex: [signature],
        signerXOnlyPubkeyHex: DEPOSITOR_XONLY,
      }),
    ).toThrow(/carries a key-path signature/);
  });

  it("refuses an input without exactly one tapscript leaf", () => {
    const psbt = new Psbt();
    psbt.addInput({
      hash: Buffer.alloc(32, 4).toString("hex"),
      index: 0,
      witnessUtxo: {
        script: deriveDepositorClaimDescriptor(DEPOSITOR_XONLY).scriptPubKey,
        value: Number(CLAIM_VALUE),
      },
    });
    psbt.addOutput({
      script: deriveDepositorClaimDescriptor(DEPOSITOR_XONLY).scriptPubKey,
      value: Number(CLAIM_VALUE - FEE_SATS),
    });

    expect(() =>
      finalizeScriptPathWithSignatures({
        requestedPsbtHex: psbt.toHex(),
        signaturesHex: ["aa".repeat(64)],
        signerXOnlyPubkeyHex: DEPOSITOR_XONLY,
      }),
    ).toThrow(/exactly one tapLeafScript, got 0/);
  });
});
