/**
 * Reclaim PSBT classification and augmentation (#2714).
 *
 * Firmware citations: `fw:` = LedgerHQ/app-babylon-vault-dev @ `b89dd580`.
 * Reclaim is the Claim leaf with ONE output (`fw:sign_psbt_validate.c:3781-3783`),
 * so the accept vector is the Claim fixture with its outputs replaced by one
 * P2TR(D) output, as in `tests/test_sign_psbt_validate.py:_build_reclaim_psbt`.
 */

// @vitest-environment node
// Same rationale as refundPsbt.test.ts: the asmjs ECC backend fails
// bitcoinjs's verifyEcc fixtures under jsdom but passes under node.

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { augmentPsbtForReclaim, classifyReclaimPsbt } from "../reclaimPsbt";
import {
  DEPOSITOR_PATH,
  DEPOSITOR_XONLY,
  FOREIGN_XONLY,
  MASTER_FINGERPRINT,
  bip86Spk,
  buildClaimShapedPsbt,
  wcLeaf,
} from "./fixtures/delegatedClaimShapes";

const RECLAIM_OUTPUT_VALUE = 9_000;

function buildReclaimShapedPsbt(leafKeyHex = DEPOSITOR_XONLY): string {
  return buildClaimShapedPsbt({
    leafKeyHex,
    outputs: [{ script: bip86Spk(leafKeyHex), value: RECLAIM_OUTPUT_VALUE }],
  });
}

const AUGMENT_BASE = {
  depositorXOnlyHex: DEPOSITOR_XONLY,
  masterFingerprintHex: MASTER_FINGERPRINT,
  depositorPath: DEPOSITOR_PATH,
};

describe("classifyReclaimPsbt", () => {
  it("classifies a 1-in/1-out PSBT spending the <D> OP_CHECKSIG leaf as a Reclaim", () => {
    expect(classifyReclaimPsbt(buildReclaimShapedPsbt())).toEqual({ leafKeyHex: DEPOSITOR_XONLY });
  });

  it("leaves the 2-output Claim to the delegated-claim path", () => {
    expect(classifyReclaimPsbt(buildClaimShapedPsbt())).toBeUndefined();
  });

  it("does not classify a sweep of two reserves — the device signs one per Reclaim", () => {
    const psbt = Psbt.fromHex(buildReclaimShapedPsbt());
    psbt.addInput({ hash: Buffer.alloc(32, 0x01), index: 1 });

    expect(classifyReclaimPsbt(psbt.toHex())).toBeUndefined();
  });

  it("does not classify a 1-in/1-out PSBT with another leaf", () => {
    const wronglyChallenged = buildClaimShapedPsbt({
      leaf: wcLeaf(DEPOSITOR_XONLY),
      outputs: [{ script: bip86Spk(DEPOSITOR_XONLY), value: RECLAIM_OUTPUT_VALUE }],
    });

    expect(classifyReclaimPsbt(wronglyChallenged)).toBeUndefined();
  });

  it("does not classify a version-1 or non-zero-locktime transaction", () => {
    const outputs = [{ script: bip86Spk(DEPOSITOR_XONLY), value: RECLAIM_OUTPUT_VALUE }];

    expect(classifyReclaimPsbt(buildClaimShapedPsbt({ version: 1, outputs }))).toBeUndefined();
    expect(classifyReclaimPsbt(buildClaimShapedPsbt({ locktime: 1, outputs }))).toBeUndefined();
  });

  it("returns undefined for hex that does not parse", () => {
    expect(classifyReclaimPsbt("zz")).toBeUndefined();
  });
});

describe("augmentPsbtForReclaim", () => {
  it("replaces input 0's derivation set with D's one entry: fingerprint, depositor path, no leaf hashes", () => {
    const augmented = Psbt.fromHex(augmentPsbtForReclaim({ ...AUGMENT_BASE, psbtHex: buildReclaimShapedPsbt() }));

    expect(augmented.data.inputs[0].tapBip32Derivation).toHaveLength(1);
    const [entry] = augmented.data.inputs[0].tapBip32Derivation!;
    expect(Buffer.from(entry.pubkey).toString("hex")).toBe(DEPOSITOR_XONLY);
    expect(Buffer.from(entry.masterFingerprint).toString("hex")).toBe(MASTER_FINGERPRINT);
    expect(entry.path).toBe("m/86'/1'/0'/0/0");
    expect(entry.leafHashes).toHaveLength(0);
  });

  it("writes no output derivation and leaves the unsigned transaction unchanged", () => {
    const psbtHex = buildReclaimShapedPsbt();
    const augmented = Psbt.fromHex(augmentPsbtForReclaim({ ...AUGMENT_BASE, psbtHex }));

    expect(augmented.data.outputs[0].tapBip32Derivation).toBeUndefined();
    expect(
      augmented.data.globalMap.unsignedTx.toBuffer().equals(Psbt.fromHex(psbtHex).data.globalMap.unsignedTx.toBuffer()),
    ).toBe(true);
  });

  it("refuses a Reclaim whose leaf key is not the depositor's", () => {
    expect(() => augmentPsbtForReclaim({ ...AUGMENT_BASE, psbtHex: buildReclaimShapedPsbt(FOREIGN_XONLY) })).toThrow(
      /leaf key does not equal the depositor key/,
    );
  });

  it("refuses a PSBT that is not Reclaim-shaped", () => {
    expect(() => augmentPsbtForReclaim({ ...AUGMENT_BASE, psbtHex: buildClaimShapedPsbt() })).toThrow(
      /not a Reclaim-shaped PSBT/,
    );
  });

  it("refuses a malformed fingerprint before parsing the PSBT", () => {
    expect(() =>
      augmentPsbtForReclaim({ ...AUGMENT_BASE, masterFingerprintHex: "73c5da", psbtHex: buildReclaimShapedPsbt() }),
    ).toThrow(/masterFingerprintHex/);
  });
});
