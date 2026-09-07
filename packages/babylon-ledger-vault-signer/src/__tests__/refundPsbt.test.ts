/**
 * Refund-PSBT classification and augmentation (#2371).
 *
 * The leaf grammar mirrors the firmware's own parser byte-for-byte —
 * `fw:sign_psbt_validate_helpers.c:77-148` (`parse_refund_leaf_script`) @
 * `ff1e1ce17` — so every accept/reject vector here is a firmware-grammar pin,
 * including the shapes the firmware is deliberately loose about (OP_PUSHDATA1,
 * a non-minimal positive CScriptNum).
 */

// @vitest-environment node
// Same rationale as provider.test.ts: the asmjs ECC backend fails bitcoinjs's
// verifyEcc fixtures under jsdom but passes under node.

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib, payments, Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { HARDENED } from "../bip86Path";
import {
  assertRefundPsbtSignable,
  augmentPsbtForRefund,
  classifyRefundPsbt,
  parseRefundLeafScript,
} from "../refundPsbt";

initEccLib(ecc);

/** BIP-86 test-vector depositor key (same as the provider/e2e fixtures). */
const DEPOSITOR_XONLY = "dc8d2f9eff0c4f4dbde070a48e330efc908b62a766568d91e658f284b324b878";
const FOREIGN_XONLY = "cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115";
/** BIP-341 NUMS point — the HTLC's unspendable internal key. */
const NUMS_XONLY = "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0";
const MASTER_FINGERPRINT = "73c5da0a";
const DEPOSITOR_PATH: readonly number[] = [86 + HARDENED, 1 + HARDENED, 0 + HARDENED, 0, 0];

const OP_PUSHBYTES_32 = 0x20;
const OP_CHECKSIGVERIFY = 0xad;
const OP_CSV = 0xb2;
const TAPSCRIPT_LEAF_VERSION = 0xc0;

/** Minimal CScriptNum push of 2016: `02 e0 07`. */
const PUSH_2016 = Buffer.from([0x02, 0xe0, 0x07]);
const CSV_2016 = 2016;

const HTLC_VALUE_SATS = 1_000_000;
const REFUND_VALUE_SATS = 990_000;
const PREV_HASH = Buffer.alloc(32, 0x11);

function refundLeaf(keyHex: string, csvPush: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([OP_PUSHBYTES_32]),
    Buffer.from(keyHex, "hex"),
    Buffer.from([OP_CHECKSIGVERIFY]),
    csvPush,
    Buffer.from([OP_CSV]),
  ]);
}

const depositorSpk = payments.p2tr({ internalPubkey: Buffer.from(DEPOSITOR_XONLY, "hex") }).output!;
/** Any P2TR-shaped previous output — classification never re-derives it. */
const htlcSpk = Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0x22)]);
const controlBlock = Buffer.concat([Buffer.from([TAPSCRIPT_LEAF_VERSION]), Buffer.from(NUMS_XONLY, "hex")]);

function buildRefundShapedPsbt(
  overrides: {
    leaf?: Buffer;
    leaves?: readonly Buffer[];
    leafVersion?: number;
    outScript?: Buffer;
    outValue?: number;
    extraOutput?: boolean;
    extraInput?: boolean;
    dropLeaf?: boolean;
    dropWitnessUtxo?: boolean;
    version?: number;
    locktime?: number;
    sequence?: number;
  } = {},
): string {
  const leaf = overrides.leaf ?? refundLeaf(DEPOSITOR_XONLY, PUSH_2016);
  const psbt = new Psbt();
  psbt.setVersion(overrides.version ?? 2);
  psbt.setLocktime(overrides.locktime ?? 0);
  psbt.addInput({
    hash: PREV_HASH,
    index: 0,
    sequence: overrides.sequence ?? CSV_2016,
    ...(overrides.dropWitnessUtxo ? {} : { witnessUtxo: { script: htlcSpk, value: HTLC_VALUE_SATS } }),
    ...(overrides.dropLeaf
      ? {}
      : {
          tapLeafScript: (overrides.leaves ?? [leaf]).map((script, i) => {
            // bip174 requires controlBlock[0]'s version bits to equal leafVersion.
            const versionedControlBlock = Buffer.concat([
              Buffer.from([overrides.leafVersion ?? TAPSCRIPT_LEAF_VERSION]),
              controlBlock.subarray(1),
            ]);
            return {
              leafVersion: overrides.leafVersion ?? TAPSCRIPT_LEAF_VERSION,
              script,
              // Distinct per entry — bip174 keys TAP_LEAF_SCRIPT by control block.
              controlBlock: i === 0 ? versionedControlBlock : Buffer.concat([versionedControlBlock, Buffer.alloc(32, 0x44)]),
            };
          }),
        }),
    tapInternalKey: Buffer.from(NUMS_XONLY, "hex"),
  });
  if (overrides.extraInput) {
    psbt.addInput({
      hash: Buffer.alloc(32, 0x33),
      index: 1,
      sequence: CSV_2016,
      witnessUtxo: { script: htlcSpk, value: HTLC_VALUE_SATS },
      tapLeafScript: [{ leafVersion: TAPSCRIPT_LEAF_VERSION, script: leaf, controlBlock }],
      tapInternalKey: Buffer.from(NUMS_XONLY, "hex"),
    });
  }
  psbt.addOutput({ script: overrides.outScript ?? depositorSpk, value: overrides.outValue ?? REFUND_VALUE_SATS });
  if (overrides.extraOutput) {
    psbt.addOutput({ script: depositorSpk, value: 1_000 });
  }
  return psbt.toHex();
}

describe("parseRefundLeafScript (firmware-grammar mirror)", () => {
  it("parses the canonical leaf: <key32> OP_CHECKSIGVERIFY <2-byte CScriptNum> OP_CSV", () => {
    const parsed = parseRefundLeafScript(refundLeaf(DEPOSITOR_XONLY, PUSH_2016));
    expect(parsed).toEqual({ leafKeyHex: DEPOSITOR_XONLY, csv: 2016 });
  });

  it("parses a 1-byte CScriptNum push (CSV 72, the device floor)", () => {
    expect(parseRefundLeafScript(refundLeaf(DEPOSITOR_XONLY, Buffer.from([0x01, 0x48])))).toEqual({
      leafKeyHex: DEPOSITOR_XONLY,
      csv: 72,
    });
  });

  it("parses OP_1..OP_16 with the value in the opcode (firmware accepts them)", () => {
    expect(parseRefundLeafScript(refundLeaf(DEPOSITOR_XONLY, Buffer.from([0x60])))).toEqual({
      leafKeyHex: DEPOSITOR_XONLY,
      csv: 16,
    });
  });

  it("parses an OP_PUSHDATA1 CSV push (firmware accepts the non-minimal opcode)", () => {
    expect(parseRefundLeafScript(refundLeaf(DEPOSITOR_XONLY, Buffer.from([0x4c, 0x02, 0xe0, 0x07])))).toEqual({
      leafKeyHex: DEPOSITOR_XONLY,
      csv: 2016,
    });
  });

  it("parses a non-minimal positive CScriptNum (trailing zero byte, firmware accepts)", () => {
    expect(parseRefundLeafScript(refundLeaf(DEPOSITOR_XONLY, Buffer.from([0x02, 0x48, 0x00])))).toEqual({
      leafKeyHex: DEPOSITOR_XONLY,
      csv: 72,
    });
  });

  it("parses the maximum 4-byte CScriptNum the firmware admits", () => {
    expect(parseRefundLeafScript(refundLeaf(DEPOSITOR_XONLY, Buffer.from([0x04, 0xff, 0xff, 0xff, 0x7f])))).toEqual({
      leafKeyHex: DEPOSITOR_XONLY,
      csv: 0x7fffffff,
    });
  });

  it.each([
    ["OP_0 push", Buffer.from([0x00])],
    ["OP_1NEGATE push", Buffer.from([0x4f])],
    ["negative CScriptNum (sign bit set)", Buffer.from([0x01, 0x80])],
    ["zero CScriptNum", Buffer.from([0x01, 0x00])],
    ["5-byte CScriptNum", Buffer.from([0x05, 0x01, 0x00, 0x00, 0x00, 0x00])],
    ["OP_PUSHDATA1 with a 5-byte length", Buffer.from([0x4c, 0x05, 0x01, 0x00, 0x00, 0x00, 0x00])],
    ["push extending past the script end", Buffer.from([0x04, 0x01])],
  ])("rejects a %s exactly like the firmware", (_label, csvPush) => {
    expect(parseRefundLeafScript(refundLeaf(DEPOSITOR_XONLY, csvPush))).toBeUndefined();
  });

  it("rejects a script that does not start with OP_PUSHBYTES_32", () => {
    const leaf = refundLeaf(DEPOSITOR_XONLY, PUSH_2016);
    leaf[0] = 0x21;
    expect(parseRefundLeafScript(leaf)).toBeUndefined();
  });

  it("rejects a missing OP_CHECKSIGVERIFY after the key", () => {
    const leaf = refundLeaf(DEPOSITOR_XONLY, PUSH_2016);
    leaf[33] = 0xac; // OP_CHECKSIG
    expect(parseRefundLeafScript(leaf)).toBeUndefined();
  });

  it("rejects a final opcode other than OP_CHECKSEQUENCEVERIFY", () => {
    const leaf = refundLeaf(DEPOSITOR_XONLY, PUSH_2016);
    leaf[leaf.length - 1] = 0xb1; // OP_CLTV
    expect(parseRefundLeafScript(leaf)).toBeUndefined();
  });

  it("rejects trailing bytes after OP_CSV (firmware requires exact consumption)", () => {
    const leaf = Buffer.concat([refundLeaf(DEPOSITOR_XONLY, PUSH_2016), Buffer.from([0x51])]);
    expect(parseRefundLeafScript(leaf)).toBeUndefined();
  });

  it("rejects a script below the 36-byte minimum", () => {
    expect(parseRefundLeafScript(refundLeaf(DEPOSITOR_XONLY, PUSH_2016).subarray(0, 35))).toBeUndefined();
  });

  it("rejects the NoPayout leaf shape (second key push is 32 bytes, over the CScriptNum cap)", () => {
    const noPayout = Buffer.concat([
      Buffer.from([OP_PUSHBYTES_32]),
      Buffer.from(DEPOSITOR_XONLY, "hex"),
      Buffer.from([OP_CHECKSIGVERIFY]),
      Buffer.from([OP_PUSHBYTES_32]),
      Buffer.from(FOREIGN_XONLY, "hex"),
      Buffer.from([0xac]), // OP_CHECKSIG
    ]);
    expect(parseRefundLeafScript(noPayout)).toBeUndefined();
  });
});

describe("classifyRefundPsbt", () => {
  it("classifies a 1-in/1-out PSBT carrying one refund leaf, returning the leaf terms and prevout txid", () => {
    const classified = classifyRefundPsbt(buildRefundShapedPsbt());
    expect(classified).toMatchObject({
      leafKeyHex: DEPOSITOR_XONLY,
      csv: 2016,
      inputTxidInternalHex: PREV_HASH.toString("hex"),
    });
  });

  it.each([
    ["a second output", { extraOutput: true }],
    ["a second input", { extraInput: true }],
    ["no tapLeafScript on the input", { dropLeaf: true }],
    ["two TAP_LEAF_SCRIPT entries", { leaves: [refundLeaf(DEPOSITOR_XONLY, PUSH_2016), refundLeaf(FOREIGN_XONLY, PUSH_2016)] }],
    ["a non-refund leaf script", { leaf: Buffer.from([OP_PUSHBYTES_32, ...Buffer.alloc(32, 5), 0xac]) }],
    ["a non-tapscript leaf version", { leafVersion: 0xc2 }],
    ["a version-1 transaction (the device requires version >= 2)", { version: 1 }],
    ["a non-zero locktime", { locktime: 1 }],
  ] as const)("returns undefined for %s", (_label, overrides) => {
    expect(classifyRefundPsbt(buildRefundShapedPsbt(overrides))).toBeUndefined();
  });

  it("carries the sequence, witnessUtxo and output terms the validator pins", () => {
    const classified = classifyRefundPsbt(buildRefundShapedPsbt());
    expect(classified?.sequence).toBe(CSV_2016);
    expect(classified?.witnessUtxo).toEqual({ scriptLength: 34, value: HTLC_VALUE_SATS });
    expect(classified?.outputScriptHex).toBe(depositorSpk.toString("hex"));
    expect(classified?.outputValue).toBe(REFUND_VALUE_SATS);
  });

  it("returns undefined for malformed hex instead of throwing (error precedence stays with the caller)", () => {
    expect(classifyRefundPsbt("zz")).toBeUndefined();
    expect(classifyRefundPsbt("abcd")).toBeUndefined();
    expect(classifyRefundPsbt("")).toBeUndefined();
  });
});

describe("assertRefundPsbtSignable", () => {
  function classified(overrides: Parameters<typeof buildRefundShapedPsbt>[0] = {}) {
    const c = classifyRefundPsbt(buildRefundShapedPsbt(overrides));
    if (c === undefined) throw new Error("fixture must classify as a refund");
    return c;
  }

  it("accepts the canonical refund terms", () => {
    expect(() => assertRefundPsbtSignable(classified())).not.toThrow();
  });

  it("accepts the device floor exactly (CSV 72)", () => {
    expect(() =>
      assertRefundPsbtSignable(classified({ leaf: refundLeaf(DEPOSITOR_XONLY, Buffer.from([0x01, 0x48])), sequence: 72 })),
    ).not.toThrow();
  });

  it("rejects a CSV below the device floor of 72", () => {
    expect(() =>
      assertRefundPsbtSignable(classified({ leaf: refundLeaf(DEPOSITOR_XONLY, Buffer.from([0x01, 0x47])), sequence: 71 })),
    ).toThrow(/72/);
  });

  it("rejects a sequence with the BIP-68 disable flag set", () => {
    expect(() => assertRefundPsbtSignable(classified({ sequence: 0x80000000 + CSV_2016 }))).toThrow(/sequence/);
  });

  it("rejects a sequence with the BIP-68 time-based flag set", () => {
    expect(() => assertRefundPsbtSignable(classified({ sequence: 0x00400000 + CSV_2016 }))).toThrow(/sequence/);
  });

  it("rejects a sequence that does not encode exactly the leaf CSV", () => {
    expect(() => assertRefundPsbtSignable(classified({ sequence: 144 }))).toThrow(/sequence/);
  });

  it("rejects an input without a witnessUtxo", () => {
    expect(() => assertRefundPsbtSignable(classified({ dropWitnessUtxo: true }))).toThrow(/witnessUtxo/);
  });

  it("rejects an output value above the HTLC value", () => {
    expect(() => assertRefundPsbtSignable(classified({ outValue: HTLC_VALUE_SATS + 1 }))).toThrow(/exceed/);
  });

  it("rejects an output paying a FOREIGN P2TR address — ownership, not just shape", () => {
    const foreignSpk = payments.p2tr({ internalPubkey: Buffer.from(FOREIGN_XONLY, "hex") }).output!;
    expect(() => assertRefundPsbtSignable(classified({ outScript: foreignSpk }))).toThrow(/BIP-86/);
  });

  it("rejects a non-P2TR output", () => {
    const p2wpkh = Buffer.concat([Buffer.from([0x00, 0x14]), Buffer.alloc(20, 7)]);
    expect(() => assertRefundPsbtSignable(classified({ outScript: p2wpkh }))).toThrow(/BIP-86/);
  });
});

describe("augmentPsbtForRefund", () => {
  const params = {
    psbtHex: buildRefundShapedPsbt(),
    depositorXOnlyHex: DEPOSITOR_XONLY,
    masterFingerprintHex: MASTER_FINGERPRINT,
    depositorPath: DEPOSITOR_PATH,
  };

  it("keys input 0 by the UNTWEAKED depositor key and output 0 by the TWEAKED output key", () => {
    const augmented = Psbt.fromHex(augmentPsbtForRefund(params));

    const inputDeriv = augmented.data.inputs[0].tapBip32Derivation;
    expect(inputDeriv).toHaveLength(1);
    expect(inputDeriv![0].pubkey.toString("hex")).toBe(DEPOSITOR_XONLY);
    expect(inputDeriv![0].masterFingerprint.toString("hex")).toBe(MASTER_FINGERPRINT);
    expect(inputDeriv![0].path).toBe("m/86'/1'/0'/0/0");
    expect(inputDeriv![0].leafHashes).toEqual([]);

    // The asymmetry the device demands (`fw:sign_psbt_validate.c:1005-1057`):
    // the output entry is keyed by the scriptPubKey's witness program, which
    // is the BIP-86 TWEAK of the depositor key — never the depositor key itself.
    const outputDeriv = augmented.data.outputs[0].tapBip32Derivation;
    expect(outputDeriv).toHaveLength(1);
    expect(outputDeriv![0].pubkey).toEqual(depositorSpk.subarray(2));
    expect(outputDeriv![0].pubkey.toString("hex")).not.toBe(DEPOSITOR_XONLY);
    expect(outputDeriv![0].masterFingerprint.toString("hex")).toBe(MASTER_FINGERPRINT);
    expect(outputDeriv![0].path).toBe("m/86'/1'/0'/0/0");
    expect(outputDeriv![0].leafHashes).toEqual([]);
  });

  it("never touches the unsigned transaction", () => {
    const augmented = augmentPsbtForRefund(params);
    const before = Psbt.fromHex(params.psbtHex).data.globalMap.unsignedTx.toBuffer();
    const after = Psbt.fromHex(augmented).data.globalMap.unsignedTx.toBuffer();
    expect(after.equals(before)).toBe(true);
  });

  it("throws when the refund leaf key is not the depositor key", () => {
    // A coherent foreign refund: leaf AND destination belong to the foreign key,
    // so only the depositor-equality check can be what rejects it.
    const foreignSpk = payments.p2tr({ internalPubkey: Buffer.from(FOREIGN_XONLY, "hex") }).output!;
    expect(() =>
      augmentPsbtForRefund({
        ...params,
        psbtHex: buildRefundShapedPsbt({ leaf: refundLeaf(FOREIGN_XONLY, PUSH_2016), outScript: foreignSpk }),
      }),
    ).toThrow(/depositor/);
  });

  it("throws on a PSBT that is not refund-shaped", () => {
    expect(() => augmentPsbtForRefund({ ...params, psbtHex: buildRefundShapedPsbt({ extraOutput: true }) })).toThrow(
      /refund/,
    );
  });

  it("runs the signability validator — an unowned output is rejected here too", () => {
    const p2wpkh = Buffer.concat([Buffer.from([0x00, 0x14]), Buffer.alloc(20, 7)]);
    expect(() => augmentPsbtForRefund({ ...params, psbtHex: buildRefundShapedPsbt({ outScript: p2wpkh }) })).toThrow(
      /BIP-86/,
    );
  });

  it("rejects a malformed depositor path before touching the PSBT", () => {
    expect(() => augmentPsbtForRefund({ ...params, depositorPath: [86 + HARDENED, 1 + HARDENED, 0 + HARDENED, 0] })).toThrow(
      /5 levels|depositorPath/,
    );
  });

  it("rejects a malformed master fingerprint", () => {
    expect(() => augmentPsbtForRefund({ ...params, masterFingerprintHex: "73c5da" })).toThrow(/fingerprint/);
  });

  it("throws on a CSV below the device floor of 72 — the device never signs it in any state", () => {
    expect(() =>
      augmentPsbtForRefund({
        ...params,
        psbtHex: buildRefundShapedPsbt({ leaf: refundLeaf(DEPOSITOR_XONLY, Buffer.from([0x01, 0x47])), sequence: 71 }),
      }),
    ).toThrow(/72/);
  });

  it("accepts the device floor exactly (CSV 72)", () => {
    expect(() =>
      augmentPsbtForRefund({
        ...params,
        psbtHex: buildRefundShapedPsbt({ leaf: refundLeaf(DEPOSITOR_XONLY, Buffer.from([0x01, 0x48])), sequence: 72 }),
      }),
    ).not.toThrow();
  });
});
