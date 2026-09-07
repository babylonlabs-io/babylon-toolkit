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

function xOnlyOf(priv: Buffer): string {
  return Buffer.from(ecc.xOnlyPointFromScalar(priv)).toString("hex");
}

/**
 * A PegIn shaped like the real one: vault output at vout 0, reserve at vout 1.
 *
 * `seed` varies the funding outpoint so each call yields a distinct txid, the
 * way two real vaults would — the builder rejects a batch that repeats one.
 */
function makePeginTxHex({
  depositorXOnly = DEPOSITOR_XONLY,
  claimValue = CLAIM_VALUE,
  seed = 9,
}: {
  depositorXOnly?: string;
  claimValue?: bigint;
  seed?: number;
} = {}): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, seed), 0);
  tx.addOutput(
    Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 1)]),
    500_000,
  );
  tx.addOutput(
    deriveDepositorClaimDescriptor(depositorXOnly).scriptPubKey,
    Number(claimValue),
  );
  return tx.toHex();
}

/** The N-in/1-out reclaim PSBT the SDK would build and send to the wallet. */
function buildRequestedPsbtHex({
  depositorXOnly = DEPOSITOR_XONLY,
  claimValues = [CLAIM_VALUE],
  feeSats = FEE_SATS,
}: {
  depositorXOnly?: string;
  claimValues?: bigint[];
  feeSats?: bigint;
} = {}): string {
  const { scriptPubKey } = deriveDepositorClaimDescriptor(depositorXOnly);
  return buildReclaimPsbt({
    depositorPubkey: depositorXOnly,
    inputs: claimValues.map((claimValue, i) => {
      const peginTxHex = makePeginTxHex({
        depositorXOnly,
        claimValue,
        seed: 9 + i,
      });
      return {
        depositorSignedPeginTxHex: peginTxHex,
        observed: {
          txid: Transaction.fromHex(peginTxHex).getId(),
          vout: 1,
          scriptPubKey: scriptPubKey.toString("hex"),
          value: claimValue,
        },
        expectedValue: claimValue,
      };
    }),
    feeSats,
  }).psbtHex;
}

/** Genuine BIP-340 script-path signature over input `inputIndex`. */
function signInput(
  psbtHex: string,
  inputIndex: number,
  priv: Buffer = DEPOSITOR_PRIV,
): string {
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

  return Buffer.from(ecc.signSchnorr(sighash, priv)).toString("hex");
}

/**
 * What the OLD code did: finalize the PSBT the wallet returned. Used as the
 * parity baseline for an honest wallet, which returns the same per-input
 * metadata it was handed.
 */
function finalizeWalletReturn(
  psbtHex: string,
  signatures: string[],
  depositorXOnly: string,
): string {
  const walletReturn = Psbt.fromHex(psbtHex);
  signatures.forEach((signature, i) => {
    const leaf = walletReturn.data.inputs[i].tapLeafScript![0];
    walletReturn.updateInput(i, {
      tapScriptSig: [
        {
          pubkey: Buffer.from(depositorXOnly, "hex"),
          leafHash: computeTapLeafHash(leaf.leafVersion, leaf.script),
          signature: Buffer.from(signature, "hex"),
        },
      ],
    });
  });
  return walletReturn.finalizeAllInputs().extractTransaction().toHex();
}

/**
 * Deterministic pseudo-random source. A seeded LCG rather than `Math.random`
 * so a failing case is reproducible from the test name alone — "randomised"
 * here means "covers the input space", not "differs between runs".
 */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

interface ParityCase {
  label: string;
  depositorPriv: Buffer;
  claimValues: bigint[];
  feeSats: bigint;
}

/**
 * The golden case plus randomised ones spanning input count, claim value, fee
 * and depositor key — the axes `finalizeScriptPathWithSignatures` actually
 * varies over, since it loops the inputs and the reclaim builder batches them.
 */
function parityCases(): ParityCase[] {
  const cases: ParityCase[] = [
    {
      label: "golden single input",
      depositorPriv: DEPOSITOR_PRIV,
      claimValues: [CLAIM_VALUE],
      feeSats: FEE_SATS,
    },
    {
      label: "golden three-input batch",
      depositorPriv: DEPOSITOR_PRIV,
      claimValues: [CLAIM_VALUE, 26_228n, 41_500n],
      feeSats: 1_395n,
    },
  ];

  const rand = lcg(0x5eed);
  for (let i = 0; i < 12; i++) {
    const inputCount = 1 + Math.floor(rand() * 4);
    const claimValues = Array.from(
      { length: inputCount },
      () => 5_000n + BigInt(Math.floor(rand() * 60_000)),
    );
    const total = claimValues.reduce((sum, v) => sum + v, 0n);
    // Leave the output comfortably above dust so the builder's own guards are
    // not what the case ends up exercising.
    const feeSats = 200n + BigInt(Math.floor(rand() * Number(total / 4n)));
    cases.push({
      label: `randomised #${i} (${inputCount} input(s))`,
      depositorPriv: Buffer.alloc(32, 1 + Math.floor(rand() * 200)),
      claimValues,
      feeSats,
    });
  }
  return cases;
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

  it.each(parityCases())(
    "matches the old finalize-the-wallet's-PSBT result for an honest wallet: $label",
    ({ depositorPriv, claimValues, feeSats }) => {
      // The two paths are only meant to diverge when the returned PSBT
      // diverges. An honest wallet returns the per-input metadata it was
      // handed, and for that case the result must be byte-for-byte what
      // finalizing the wallet's copy produced — otherwise this change moved
      // more than the trust boundary it set out to move.
      //
      // Spread across input count, claim value, fee and depositor key because
      // the function loops the inputs and the reclaim builder batches them, so
      // index alignment between signatures and inputs is the thing most likely
      // to diverge and a single fixed case would never show it.
      const depositorXOnly = xOnlyOf(depositorPriv);
      const psbtHex = buildRequestedPsbtHex({
        depositorXOnly,
        claimValues,
        feeSats,
      });
      const signatures = claimValues.map((_v, i) =>
        signInput(psbtHex, i, depositorPriv),
      );

      const previousBehaviour = finalizeWalletReturn(
        psbtHex,
        signatures,
        depositorXOnly,
      );
      const current = finalizeScriptPathWithSignatures({
        requestedPsbtHex: psbtHex,
        signaturesHex: signatures,
        signerXOnlyPubkeyHex: depositorXOnly,
      });

      expect(current).toBe(previousBehaviour);
      expect(Transaction.fromHex(current).ins).toHaveLength(claimValues.length);
    },
  );

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
