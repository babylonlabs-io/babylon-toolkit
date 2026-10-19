// @vitest-environment node
//
// The secp256k1 asm.js build validates its inputs with `instanceof Uint8Array`, and under jsdom a Node
// `Buffer` belongs to a different realm, so these Taproot fixtures need the node environment.
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import {
  initEccLib,
  opcodes,
  payments,
  Psbt,
  script,
  Transaction,
} from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeAll, describe, expect, it } from "vitest";

import {
  addWalletPsbtExtras,
  assertRegisteredPeginWitness,
  type RegisteredPegin,
} from "../peginWalletPsbt";

const DEPOSITOR_PRIV = Buffer.alloc(32, 7);
/** BIP-341 NUMS point, the HTLC's unspendable internal key. */
const NUMS = Buffer.from(
  "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0",
  "hex",
);
const HTLC_VALUE = 100_000;

interface Fixture {
  prePegin: Transaction;
  /** The PegIn spending the HTLC, unsigned. */
  pegin: Transaction;
  /** The wallet's answer: the PegIn input PSBT with the depositor's script-path signature. */
  signedPsbtHex: string;
  signature: Buffer;
  leafScript: Buffer;
  controlBlock: Buffer;
  depositorXOnly: Buffer;
}

let fixture: Fixture;

/** A two-leaf HTLC under the NUMS key, a PegIn spending it, and the depositor's signature on leaf 0. */
function buildFixture(): Fixture {
  const depositorXOnly = Buffer.from(ecc.xOnlyPointFromScalar(DEPOSITOR_PRIV));
  const leafScript = script.compile([depositorXOnly, opcodes.OP_CHECKSIG]);
  const otherLeaf = script.compile([Buffer.alloc(32, 2), opcodes.OP_CHECKSIG]);
  const htlc = payments.p2tr({
    internalPubkey: NUMS,
    scriptTree: [{ output: leafScript }, { output: otherLeaf }],
    redeem: { output: leafScript },
  });
  const controlBlock = Buffer.from(htlc.witness![htlc.witness!.length - 1]);

  const prePegin = new Transaction();
  prePegin.version = 2;
  prePegin.addInput(Buffer.alloc(32, 1), 0);
  prePegin.addOutput(htlc.output!, HTLC_VALUE);

  const pegin = new Transaction();
  pegin.version = 2;
  pegin.addInput(prePegin.getHash(), 0);
  pegin.addOutput(
    Buffer.from(`5120${"22".repeat(32)}`, "hex"),
    HTLC_VALUE - 1_000,
  );

  const psbt = new Psbt();
  psbt.setVersion(pegin.version);
  psbt.addInput({
    hash: pegin.ins[0].hash,
    index: 0,
    witnessUtxo: { script: htlc.output!, value: HTLC_VALUE },
    tapLeafScript: [{ leafVersion: 0xc0, script: leafScript, controlBlock }],
  });
  psbt.addOutput({ script: pegin.outs[0].script, value: pegin.outs[0].value });
  psbt.signTaprootInput(0, {
    publicKey: Buffer.from(ecc.pointFromScalar(DEPOSITOR_PRIV, true)!),
    sign: () => {
      throw new Error("A Taproot script path is signed with Schnorr only.");
    },
    signSchnorr: (hash: Buffer) =>
      Buffer.from(ecc.signSchnorr(hash, DEPOSITOR_PRIV)),
  });

  return {
    prePegin,
    pegin,
    signedPsbtHex: psbt.toHex(),
    signature: Buffer.from(psbt.data.inputs[0].tapScriptSig![0].signature),
    leafScript,
    controlBlock,
    depositorXOnly,
  };
}

/** The registry's record for a PegIn carrying `witness` (and `scriptSig`) on its input. */
function registered(witness: Buffer[], scriptSig?: Buffer): RegisteredPegin {
  const pegin = fixture.pegin.clone();
  pegin.setWitness(0, witness);
  if (scriptSig) pegin.ins[0].script = scriptSig;
  return {
    depositorSignedPeginTx: `0x${pegin.toHex()}`,
    prePeginTxHash: `0x${fixture.prePegin.getId()}`,
    htlcVout: 0,
    depositorBtcPubKey: `0x${fixture.depositorXOnly.toString("hex")}`,
    fundedPrePeginTxHex: fixture.prePegin.toHex(),
  };
}

beforeAll(() => {
  initEccLib(ecc);
  fixture = buildFixture();
});

describe("addWalletPsbtExtras", () => {
  it("keeps the unsigned transaction and the signature while adding a key-path signature, a final witness and a scriptSig", () => {
    const tampered = Psbt.fromHex(addWalletPsbtExtras(fixture.signedPsbtHex));
    const original = Psbt.fromHex(fixture.signedPsbtHex);
    const input = tampered.data.inputs[0];

    expect(tampered.data.globalMap.unsignedTx.toBuffer()).toEqual(
      original.data.globalMap.unsignedTx.toBuffer(),
    );
    expect(input.tapScriptSig![0].signature).toEqual(fixture.signature);
    expect(input.tapKeySig).toBeDefined();
    expect(input.finalScriptWitness).toBeDefined();
    expect(input.finalScriptSig).toBeDefined();
  });

  it("files the signature under a leaf hash no leaf of the PSBT has", () => {
    const original = Psbt.fromHex(fixture.signedPsbtHex);
    const tampered = Psbt.fromHex(addWalletPsbtExtras(fixture.signedPsbtHex));

    expect(tampered.data.inputs[0].tapScriptSig![0].leafHash).not.toEqual(
      original.data.inputs[0].tapScriptSig![0].leafHash,
    );
  });

  it("refuses an answer without a script-path signature", () => {
    const unsigned = Psbt.fromHex(fixture.signedPsbtHex);
    unsigned.data.inputs[0].tapScriptSig = [];

    expect(() => addWalletPsbtExtras(unsigned.toHex())).toThrow(
      /one script-path signature, got 0/,
    );
  });

  it("refuses an answer that is already finalized", () => {
    const finalized = Psbt.fromHex(fixture.signedPsbtHex);
    finalized.finalizeAllInputs();

    expect(() => addWalletPsbtExtras(finalized.toHex())).toThrow(
      /already key-signed or finalized/,
    );
  });
});

describe("assertRegisteredPeginWitness", () => {
  it("accepts the depositor's script-path spend of its HTLC output", () => {
    expect(() =>
      assertRegisteredPeginWitness(
        registered([
          fixture.signature,
          fixture.leafScript,
          fixture.controlBlock,
        ]),
      ),
    ).not.toThrow();
  });

  it("rejects a funded Pre-PegIn that is not the one the registry records", () => {
    const record = registered([
      fixture.signature,
      fixture.leafScript,
      fixture.controlBlock,
    ]);

    expect(() =>
      assertRegisteredPeginWitness({
        ...record,
        prePeginTxHash: `0x${"ab".repeat(32)}`,
      }),
    ).toThrow(/but the registry records/);
  });

  it("rejects a PegIn that spends another output than the vault's HTLC", () => {
    const pegin = fixture.pegin.clone();
    pegin.ins[0].index = 1;
    pegin.setWitness(0, [
      fixture.signature,
      fixture.leafScript,
      fixture.controlBlock,
    ]);

    const record = registered([
      fixture.signature,
      fixture.leafScript,
      fixture.controlBlock,
    ]);

    expect(() =>
      assertRegisteredPeginWitness({
        ...record,
        depositorSignedPeginTx: pegin.toHex(),
      }),
    ).toThrow(/not the HTLC/);
  });

  it("rejects a one-item key-path witness", () => {
    expect(() =>
      assertRegisteredPeginWitness(registered([fixture.signature])),
    ).toThrow(/witness has 1 items/);
  });

  it("rejects a PegIn whose input carries a scriptSig", () => {
    expect(() =>
      assertRegisteredPeginWitness(
        registered(
          [fixture.signature, fixture.leafScript, fixture.controlBlock],
          Buffer.from([0x51]),
        ),
      ),
    ).toThrow(/1-byte scriptSig/);
  });

  it("rejects a control block that does not commit to the HTLC output", () => {
    const foreignPath = Buffer.from(fixture.controlBlock);
    foreignPath[foreignPath.length - 1] ^= 0x01;

    expect(() =>
      assertRegisteredPeginWitness(
        registered([fixture.signature, fixture.leafScript, foreignPath]),
      ),
    ).toThrow(/control block do not/);
  });

  it("rejects a signature that does not verify for the depositor's key", () => {
    const forged = Buffer.from(fixture.signature);
    forged[forged.length - 1] ^= 0x01;

    expect(() =>
      assertRegisteredPeginWitness(
        registered([forged, fixture.leafScript, fixture.controlBlock]),
      ),
    ).toThrow(/does not verify/);
  });
});
