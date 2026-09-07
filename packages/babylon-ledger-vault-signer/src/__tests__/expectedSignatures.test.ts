/**
 * G2 gate + build-rule rejections for the SIGN_PSBT expected-signature table.
 *
 * Classification runs over all 22 firmware-fixture vectors through the real
 * prepare pipeline: which inputs are tapscript / taproot-keypath / absent,
 * the tapleaf hashes (cross-checked against bip341.tapleafHash — an
 * independent oracle), and the expected yield count, matching the per-flow
 * table of the B1-c spec §3.1. Rejections come in two shapes: rules a synthetic
 * bitcoinjs PSBT can express directly, and rules that need a real fixture with
 * one field rewritten — the control-block commitment and the wallet-metadata
 * rules only mean anything against genuine PegIn / Pre-PegIn material.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { crypto as bcrypto, initEccLib, payments, Psbt } from "bitcoinjs-lib";
import { tapleafHash as bip341TapleafHash } from "bitcoinjs-lib/src/payments/bip341";
import { Buffer } from "buffer";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { isLedgerSignPsbtProtocolError } from "../errors";
import { buildExpectedSignatureTable, type ExpectedSignaturePsbt } from "../expectedSignatures";
import { getPreparedSignPsbtState, prepareSignPsbt } from "../signPsbtPrepare";

initEccLib(ecc);

const VECTORS_DIR = join(__dirname, "..", "vendor", "ledger-bitcoin", "__tests__", "vectors", "signpsbt");

interface SignPsbtVector {
  fixture: string;
  batch_index: number;
  psbt_hex: string;
  n_inputs: number;
  /** [keyHex, valueHex] pairs per input map, straight from the oracle. */
  input_maps: [string, string][][];
}

function loadVector(name: string): SignPsbtVector {
  return JSON.parse(readFileSync(join(VECTORS_DIR, `${name}.json`), "utf8")) as SignPsbtVector;
}

const TAPSCRIPT_VECTOR_NAMES = [
  "deposit-flow__claimer_payout__0",
  "deposit-flow__claimer_payout__1",
  "deposit-flow__claimer_payout__2",
  "deposit-flow__claimer_payout__3",
  "deposit-flow__claimer_payout__4",
  "deposit-flow__depositor_graph__0",
  "deposit-flow__depositor_graph__1",
  "deposit-flow__depositor_graph__2",
  "deposit-flow__depositor_graph__3",
  "deposit-flow__depositor_graph__4",
  "deposit-flow__depositor_graph__5",
  "deposit-flow__depositor_graph__6",
  "deposit-flow__depositor_graph__7",
  "deposit-flow__depositor_graph__8",
  "deposit-flow__pegin__0",
  "generated__deposit-flow__claimer_payout__0",
  "generated__deposit-flow__depositor_graph__0",
  "generated__deposit-flow__depositor_graph__1",
  "generated__deposit-flow__depositor_graph__2",
  "generated__deposit-flow__pegin__0",
];
const KEYPATH_VECTOR_NAMES = ["deposit-flow__pre_pegin__0", "generated__deposit-flow__pre_pegin__0"];

// Valid x-only point (the generated fixtures' depositor key). For tapscript
// classification the depositor key is a free parameter — expectation is pure
// passthrough — but the ownership scan tweaks it, so it must be on-curve.
const TEST_DEPOSITOR_KEY_HEX = "e49662aea97a89551401ce54de10474b24b4ab71383b69cf164ea59b3a209e0d";
// A second valid point (the signet pre_pegin fixture's depositor key).
const OTHER_KEY_HEX = "8156406fa3a7e73ff514a9051c0a4554a7142524a41aaaaafc879c6897021167";

/** Fixture input-0 TAP_INTERNAL_KEY — the connected key the keypath table pins. */
function fixtureInternalKeyHex(vector: SignPsbtVector): string {
  const entry = vector.input_maps[0].find(([key]) => key === "17");
  if (!entry) throw new Error("fixture has no TAP_INTERNAL_KEY on input 0");
  return entry[1];
}

/** Witness program from the vector's raw witnessUtxo value: amount(8) ‖ varint(34) ‖ 5120‖program. */
function fixtureWitnessProgramHex(vector: SignPsbtVector, inputIndex: number): string {
  const entry = vector.input_maps[inputIndex].find(([key]) => key === "01");
  if (!entry) throw new Error(`fixture input ${inputIndex} has no witnessUtxo`);
  const value = Buffer.from(entry[1], "hex");
  expect(value[8]).toBe(34); // varint script length
  expect(value.subarray(9, 11).toString("hex")).toBe("5120");
  return value.subarray(11, 43).toString("hex");
}

/** The fixture's TAP_LEAF_SCRIPT script (value minus the trailing version byte). */
function fixtureLeafScript(vector: SignPsbtVector, inputIndex: number): Buffer {
  const entry = vector.input_maps[inputIndex].find(([key]) => key.startsWith("15"));
  if (!entry) throw new Error(`fixture input ${inputIndex} has no TAP_LEAF_SCRIPT`);
  const value = Buffer.from(entry[1], "hex");
  expect(value[value.length - 1]).toBe(0xc0);
  return Buffer.from(value.subarray(0, value.length - 1));
}

describe("expected-signature table classification (G2, 22 fixtures)", () => {
  // Pin-dependent: at fixtures commit 8f99b8b these PSBTs' input 1 carries no
  // leaf, so no requested set is needed. A post-#2281 Payout must pass one.
  it.each(TAPSCRIPT_VECTOR_NAMES.map((name) => [name]))("%s: input 0 tapscript, other inputs absent", (name) => {
    const vector = loadVector(name);
    const { table } = prepareSignPsbt({ psbtHex: vector.psbt_hex, depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX });

    expect(table.expectedYieldCount).toBe(1);
    expect([...table.byInput.keys()]).toEqual([0]);
    const expectation = table.byInput.get(0);
    if (expectation?.kind !== "tapscript") throw new Error("input 0 must classify tapscript");
    expect(expectation.expectedSignerXOnlyHex).toBe(TEST_DEPOSITOR_KEY_HEX);
    // Independent oracle for the leaf hash the device will echo in its YIELD.
    const expectedLeafHex = bip341TapleafHash({ output: fixtureLeafScript(vector, 0), version: 0xc0 }).toString("hex");
    expect([...expectation.expectedLeafHashHexes]).toEqual([expectedLeafHex]);
  });

  it.each(KEYPATH_VECTOR_NAMES.map((name) => [name]))("%s: every wallet input keypath", (name) => {
    const vector = loadVector(name);
    const depositorXOnlyHex = fixtureInternalKeyHex(vector);
    const { table } = prepareSignPsbt({ psbtHex: vector.psbt_hex, depositorXOnlyHex });

    expect(table.expectedYieldCount).toBe(vector.n_inputs);
    expect([...table.byInput.keys()]).toEqual([...Array(vector.n_inputs).keys()]);
    for (let inputIndex = 0; inputIndex < vector.n_inputs; inputIndex++) {
      const expectation = table.byInput.get(inputIndex);
      if (expectation?.kind !== "taproot-keypath") throw new Error(`input ${inputIndex} must classify keypath`);
      expect(expectation.expectedOutputKeyHex).toBe(fixtureWitnessProgramHex(vector, inputIndex));
    }
  });
});

describe("table build rules reject malformed PSBTs before any device I/O", () => {
  const P2TR_RANDOM_SCRIPT = Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0x2b)]);
  const CONTROL_BLOCK = Buffer.concat([Buffer.from([0xc0]), Buffer.from(OTHER_KEY_HEX, "hex")]);
  const LEAF_SCRIPT = Buffer.from([0x51]);

  function p2trOutput(xOnlyHex: string): Buffer {
    const output = payments.p2tr({ internalPubkey: Buffer.from(xOnlyHex, "hex") }).output;
    if (!output) throw new Error("p2tr produced no output");
    return output;
  }

  function psbtWithOneInput(): Psbt {
    const psbt = new Psbt();
    psbt.addInput({ hash: Buffer.alloc(32, 0x01), index: 0 });
    psbt.addOutput({ script: P2TR_RANDOM_SCRIPT, value: 1000 });
    return psbt;
  }

  function expectPrepareRejects(psbtHex: string, messagePattern: RegExp): void {
    try {
      prepareSignPsbt({ psbtHex, depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX });
      throw new Error("prepareSignPsbt did not throw");
    } catch (error) {
      expect(isLedgerSignPsbtProtocolError(error)).toBe(true);
      expect((error as Error).message).toMatch(messagePattern);
    }
  }

  it("rejects a PSBT with no depositor-signable input", () => {
    const psbt = psbtWithOneInput();
    psbt.updateInput(0, { witnessUtxo: { script: P2TR_RANDOM_SCRIPT, value: 5000 } });
    expectPrepareRejects(psbt.toHex(), /no depositor-signable input/);
  });

  it("rejects an ambiguous leaf set (two TAP_LEAF_SCRIPT entries)", () => {
    const psbt = psbtWithOneInput();
    // Distinct control blocks (parity bit) — the PSBT map key is the control block.
    const secondControlBlock = Buffer.from(CONTROL_BLOCK);
    secondControlBlock[0] = 0xc1;
    psbt.updateInput(0, {
      tapLeafScript: [
        { leafVersion: 0xc0, script: LEAF_SCRIPT, controlBlock: CONTROL_BLOCK },
        { leafVersion: 0xc0, script: Buffer.from([0x52]), controlBlock: secondControlBlock },
      ],
    });
    expectPrepareRejects(psbt.toHex(), /ambiguous leaf set/);
  });

  it("rejects a non-tapscript leaf version", () => {
    const psbt = psbtWithOneInput();
    const controlBlock = Buffer.from(CONTROL_BLOCK);
    controlBlock[0] = 0xc2;
    psbt.updateInput(0, { tapLeafScript: [{ leafVersion: 0xc2, script: LEAF_SCRIPT, controlBlock }] });
    expectPrepareRejects(psbt.toHex(), /leaf version 0xc2/);
  });

  it("ownership scan: rejects an unsigned input spending the depositor's P2TR UTXO", () => {
    const psbt = psbtWithOneInput();
    psbt.updateInput(0, { witnessUtxo: { script: p2trOutput(TEST_DEPOSITOR_KEY_HEX), value: 5000 } });
    expectPrepareRejects(psbt.toHex(), /depositor-owned UTXO but carries no signing metadata/);
  });

  it("ownership scan: rejects an unsigned input spending the depositor's P2WPKH UTXO", () => {
    const psbt = psbtWithOneInput();
    const compressed = Buffer.concat([Buffer.from([0x02]), Buffer.from(TEST_DEPOSITOR_KEY_HEX, "hex")]);
    const p2wpkhScript = Buffer.concat([Buffer.from([0x00, 0x14]), bcrypto.hash160(compressed)]);
    psbt.updateInput(0, { witnessUtxo: { script: p2wpkhScript, value: 5000 } });
    expectPrepareRejects(psbt.toHex(), /depositor-owned UTXO but carries no signing metadata/);
  });
});

/** PSBT_IN key types the fixture-mutation helpers below address by key hex. */
const WITNESS_UTXO_KEY = "01";
const INTERNAL_KEY_KEY = "17";
const LEAF_SCRIPT_KEY_PREFIX = "15";

/** `keyLen ‖ key ‖ valueLen ‖ value` — one PSBT map record as it sits in a fixture's hex. */
function recordHex(keyHex: string, valueHex: string): string {
  const byteLen = (hex: string): string => {
    // Every record we rewrite here is < 0xfd bytes, so the varints stay 1 byte.
    expect(hex.length / 2).toBeLessThan(0xfd);
    return (hex.length / 2).toString(16).padStart(2, "0");
  };
  return byteLen(keyHex) + keyHex + byteLen(valueHex) + valueHex;
}

/** Rewrite the one occurrence of `from` in a fixture's PSBT hex; fails if it is not unique. */
function replaceOnce(psbtHex: string, from: string, to: string): string {
  const at = psbtHex.indexOf(from);
  expect(at).toBeGreaterThanOrEqual(0);
  expect(psbtHex.indexOf(from, at + from.length)).toBe(-1);
  return psbtHex.slice(0, at) + to + psbtHex.slice(at + from.length);
}

function inputEntryHex(vector: SignPsbtVector, inputIndex: number, keyPrefix: string): [string, string] {
  const entry = vector.input_maps[inputIndex].find(([key]) => key.startsWith(keyPrefix));
  if (!entry) throw new Error(`fixture input ${inputIndex} has no 0x${keyPrefix} entry`);
  return entry;
}

/**
 * A fixture's `[keyHex, valueHex]` input maps as the structural surface the
 * table builder reads — the way to reach build rules that bip174 rejects at
 * prepare's merge-target parse gate.
 */
function inputMapSurface(inputMaps: readonly (readonly [string, string])[][]): ExpectedSignaturePsbt {
  return {
    getGlobalInputCount: () => inputMaps.length,
    getInputEntriesOfType: (inputIndex, keyType) =>
      inputMaps[inputIndex]
        .filter(([key]) => parseInt(key.slice(0, 2), 16) === keyType)
        .map(([key, value]) => ({ keyData: Buffer.from(key.slice(2), "hex"), value: Buffer.from(value, "hex") })),
    getInputWitnessUtxo: (inputIndex) => {
      const entry = inputMaps[inputIndex].find(([key]) => key === WITNESS_UTXO_KEY);
      if (!entry) return undefined;
      // value = amount(8) ‖ varint(script len) ‖ script; fixture scripts are < 0xfd bytes.
      const value = Buffer.from(entry[1], "hex");
      return { amount: Number(value.readBigUInt64LE(0)), scriptPubKey: value.subarray(9, 9 + value[8]) };
    },
  };
}

function expectRejects(run: () => void, messagePattern: RegExp): void {
  try {
    run();
    throw new Error("expected a LedgerSignPsbtProtocolError, nothing was thrown");
  } catch (error) {
    expect(isLedgerSignPsbtProtocolError(error)).toBe(true);
    expect((error as Error).message).toMatch(messagePattern);
  }
}

describe("keypath build rules, driven by mutations of the committed Pre-PegIn fixture", () => {
  const FIXTURE = "deposit-flow__pre_pegin__0";

  /** Input 0's witnessUtxo record, exactly as it appears in the fixture's PSBT hex. */
  function witnessUtxoRecordHex(vector: SignPsbtVector): string {
    return recordHex(WITNESS_UTXO_KEY, inputEntryHex(vector, 0, WITNESS_UTXO_KEY)[1]);
  }

  /** The fixture's amount(8) prefix, so a rewritten witnessUtxo keeps its real value. */
  function witnessUtxoAmountHex(vector: SignPsbtVector): string {
    return inputEntryHex(vector, 0, WITNESS_UTXO_KEY)[1].slice(0, 16);
  }

  function expectPrepareRejects(psbtHex: string, depositorXOnlyHex: string, messagePattern: RegExp): void {
    expectRejects(() => prepareSignPsbt({ psbtHex, depositorXOnlyHex }), messagePattern);
  }

  it("rejects a TAP_INTERNAL_KEY value that is not 32 bytes", () => {
    // Driven through the table builder directly: bip174 rejects a short
    // tapInternalKey at prepare's merge-target parse gate, so no PSBT hex can
    // carry this shape as far as the builder.
    const vector = loadVector(FIXTURE);
    const depositorXOnlyHex = fixtureInternalKeyHex(vector);
    const maps = vector.input_maps.map((entries) => entries.map(([key, value]): [string, string] => [key, value]));
    maps[0] = maps[0].map(([key, value]): [string, string] =>
      key === INTERNAL_KEY_KEY ? [key, value.slice(0, 62)] : [key, value],
    );

    expectRejects(
      () => buildExpectedSignatureTable({ psbt: inputMapSurface(maps), depositorXOnlyHex }),
      /malformed TAP_INTERNAL_KEY entry/,
    );
  });

  it("rejects a TAP_INTERNAL_KEY entry whose key carries trailing keydata", () => {
    // Without the empty-keyData rule, a 0x17-typed key with trailing keydata has
    // its value read as the internal key. Driven through the builder directly:
    // bip174 rejects a non-1-byte key at prepare's merge-target parse gate
    // (`bip174@2.1.1 converter/shared/tapInternalKey.js:5`).
    const vector = loadVector(FIXTURE);
    const depositorXOnlyHex = fixtureInternalKeyHex(vector);
    const maps = vector.input_maps.map((entries) => entries.map(([key, value]): [string, string] => [key, value]));
    maps[0] = maps[0].map(([key, value]): [string, string] =>
      key === INTERNAL_KEY_KEY ? [`${key}00`, value] : [key, value],
    );

    expectRejects(
      () => buildExpectedSignatureTable({ psbt: inputMapSurface(maps), depositorXOnlyHex }),
      /malformed TAP_INTERNAL_KEY entry/,
    );
  });

  it("rejects a keypath input whose internal key is not the connected depositor key", () => {
    const vector = loadVector(FIXTURE);
    const depositorXOnlyHex = fixtureInternalKeyHex(vector);
    // Both fixture inputs share one internal key, so swapping in the other
    // input's key would be a no-op — flip a byte of the key instead.
    const flipped = ((parseInt(depositorXOnlyHex.slice(0, 2), 16) ^ 0xff) & 0xff).toString(16).padStart(2, "0");
    const psbtHex = vector.psbt_hex
      .split(recordHex(INTERNAL_KEY_KEY, depositorXOnlyHex))
      .join(recordHex(INTERNAL_KEY_KEY, flipped + depositorXOnlyHex.slice(2)));

    expectPrepareRejects(psbtHex, depositorXOnlyHex, /internal key is not the connected depositor key/);
  });

  it("rejects a keypath input with no witnessUtxo", () => {
    const vector = loadVector(FIXTURE);
    const psbtHex = replaceOnce(vector.psbt_hex, witnessUtxoRecordHex(vector), "");

    expectPrepareRejects(psbtHex, fixtureInternalKeyHex(vector), /keypath but has no witnessUtxo/);
  });

  it("rejects a keypath input whose witnessUtxo script is not P2TR", () => {
    const vector = loadVector(FIXTURE);
    // P2WPKH: amount(8) ‖ varint(22) ‖ OP_0 ‖ push-20 ‖ hash160.
    const p2wpkhUtxo = `${witnessUtxoAmountHex(vector)}16` + "0014" + "2c".repeat(20);
    const psbtHex = replaceOnce(vector.psbt_hex, witnessUtxoRecordHex(vector), recordHex(WITNESS_UTXO_KEY, p2wpkhUtxo));

    expectPrepareRejects(psbtHex, fixtureInternalKeyHex(vector), /witnessUtxo script is not P2TR/);
  });

  it("rejects a keypath input whose witness program is not the BIP-86 tweak of the depositor key", () => {
    const vector = loadVector(FIXTURE);
    const foreignUtxo = `${witnessUtxoAmountHex(vector)}225120` + "2b".repeat(32);
    const psbtHex = replaceOnce(
      vector.psbt_hex,
      witnessUtxoRecordHex(vector),
      recordHex(WITNESS_UTXO_KEY, foreignUtxo),
    );

    expectPrepareRejects(psbtHex, fixtureInternalKeyHex(vector), /not the BIP-86 P2TR of the depositor key/);
  });
});

describe("tapscript control block must commit to its leaf, driven by PegIn fixture mutations", () => {
  const FIXTURE = "generated__deposit-flow__pegin__0";
  /** Offsets into the TAP_LEAF_SCRIPT key hex: `15` ‖ parity|version(1) ‖ internal key(32) ‖ path. */
  const PARITY_BYTE_AT = 2;
  const INTERNAL_KEY_AT = 4;
  const MERKLE_PATH_AT = 68;
  /**
   * Sibling byte that re-folds this fixture to a DIFFERENT output key whose
   * y-parity still equals the control block's bit 0 — so the output-key check
   * is the only one that can fire. The fixture's own byte is 0xa6, and 0xff
   * (the obvious mutation) flips parity as a side effect.
   */
  const PARITY_PRESERVING_SIBLING_BYTE = "00";

  function expectPrepareRejects(psbtHex: string, messagePattern: RegExp): void {
    expectRejects(() => prepareSignPsbt({ psbtHex, depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX }), messagePattern);
  }

  /** Rewrite input 0's TAP_LEAF_SCRIPT record with a mutated control block and/or value. */
  function mutatedLeafPsbtHex(vector: SignPsbtVector, controlBlockKeyHex: string, valueHex: string): string {
    const [keyHex, originalValueHex] = inputEntryHex(vector, 0, LEAF_SCRIPT_KEY_PREFIX);
    return replaceOnce(vector.psbt_hex, recordHex(keyHex, originalValueHex), recordHex(controlBlockKeyHex, valueHex));
  }

  it("rejects a TAP_LEAF_SCRIPT value holding only the leaf-version byte", () => {
    const vector = loadVector(FIXTURE);
    const psbtHex = mutatedLeafPsbtHex(vector, inputEntryHex(vector, 0, LEAF_SCRIPT_KEY_PREFIX)[0], "c0");

    expectPrepareRejects(psbtHex, /TAP_LEAF_SCRIPT value length 1 is below the 2-byte minimum/);
  });

  it("rejects a control block whose merkle path no longer folds to the witnessUtxo output key", () => {
    const vector = loadVector(FIXTURE);
    const [keyHex, valueHex] = inputEntryHex(vector, 0, LEAF_SCRIPT_KEY_PREFIX);
    const mutatedKey =
      keyHex.slice(0, MERKLE_PATH_AT) + PARITY_PRESERVING_SIBLING_BYTE + keyHex.slice(MERKLE_PATH_AT + 2);

    expectPrepareRejects(
      mutatedLeafPsbtHex(vector, mutatedKey, valueHex),
      /recomputed taproot output key differs from the witnessUtxo witness program/,
    );
  });

  it("rejects a control block whose parity bit disagrees with the recomputed output key", () => {
    const vector = loadVector(FIXTURE);
    const [keyHex, valueHex] = inputEntryHex(vector, 0, LEAF_SCRIPT_KEY_PREFIX);
    // Flipping bit 0 keeps the leaf version (bits 1-7) that bip174 cross-checks,
    // and leaves the merkle path — hence the recomputed output key — untouched.
    const flipped = (parseInt(keyHex.slice(PARITY_BYTE_AT, PARITY_BYTE_AT + 2), 16) ^ 0x01)
      .toString(16)
      .padStart(2, "0");
    const mutatedKey = keyHex.slice(0, PARITY_BYTE_AT) + flipped + keyHex.slice(PARITY_BYTE_AT + 2);

    expectPrepareRejects(
      mutatedLeafPsbtHex(vector, mutatedKey, valueHex),
      /control block parity bit disagrees with the recomputed taproot output key/,
    );
  });

  it("rejects a control block that is too short to carry an internal key", () => {
    const vector = loadVector(FIXTURE);
    const [keyHex, valueHex] = inputEntryHex(vector, 0, LEAF_SCRIPT_KEY_PREFIX);
    const mutatedKey = keyHex.slice(0, INTERNAL_KEY_AT);

    expectPrepareRejects(
      mutatedLeafPsbtHex(vector, mutatedKey, valueHex),
      /control block length 1 is not 33 plus a multiple of 32/,
    );
  });

  it("rejects a control block whose internal key is not an x-only point", () => {
    const vector = loadVector(FIXTURE);
    const [keyHex, valueHex] = inputEntryHex(vector, 0, LEAF_SCRIPT_KEY_PREFIX);
    // 32 × 0xff is above the field prime, so it is on no curve.
    const mutatedKey = keyHex.slice(0, INTERNAL_KEY_AT) + "ff".repeat(32) + keyHex.slice(MERKLE_PATH_AT);

    expectPrepareRejects(mutatedLeafPsbtHex(vector, mutatedKey, valueHex), /internal key is not an x-only point/);
  });

  it("rejects a tapscript input whose witnessUtxo script is not P2TR", () => {
    const vector = loadVector(FIXTURE);
    const witnessUtxoHex = inputEntryHex(vector, 0, WITNESS_UTXO_KEY)[1];
    const p2wpkhUtxo = `${witnessUtxoHex.slice(0, 16)}16` + "0014" + "2c".repeat(20);
    const psbtHex = replaceOnce(
      vector.psbt_hex,
      recordHex(WITNESS_UTXO_KEY, witnessUtxoHex),
      recordHex(WITNESS_UTXO_KEY, p2wpkhUtxo),
    );

    expectPrepareRejects(psbtHex, /is tapscript but its witnessUtxo script is not P2TR/);
  });
});

describe("caller-requested input set narrows the expectation, never the classification gates", () => {
  // Post-#2281 Payout shape: input 1 (Assert:0) carries a tapLeafScript so the
  // device can read the payout leaf to display terms, but it is never signed.
  const RANDOM_P2TR_OUTPUT = Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 0x2b)]);
  const INPUT_0_LEAF = Buffer.from([0x51]);
  const INPUT_1_LEAF = Buffer.from([0x52]);

  /** Single-leaf taptree, so the control block genuinely commits to its witnessUtxo. */
  function leafInput(script: Buffer): { scriptPubKey: Buffer; controlBlock: Buffer } {
    const leaf = { output: script, version: 0xc0 };
    const p2tr = payments.p2tr({ internalPubkey: Buffer.from(OTHER_KEY_HEX, "hex"), scriptTree: leaf, redeem: leaf });
    if (!p2tr.output || !p2tr.witness) throw new Error("p2tr produced no script-path spend");
    return { scriptPubKey: p2tr.output, controlBlock: p2tr.witness[p2tr.witness.length - 1] };
  }

  /**
   * Two leaf-carrying inputs — the narrowing-relevant half of what
   * `buildPayoutPsbt` emits since #2281. Deliberately simpler than the real
   * builder (no tapInternalKey, no CSV sequences, zero-hop control blocks);
   * multi-hop folding is covered against real bytes by the PegIn fixtures.
   */
  function payoutShapedPsbtHex(): string {
    const psbt = new Psbt();
    [INPUT_0_LEAF, INPUT_1_LEAF].forEach((script, index) => {
      psbt.addInput({ hash: Buffer.alloc(32, index + 1), index });
      const { scriptPubKey, controlBlock } = leafInput(script);
      psbt.updateInput(index, {
        witnessUtxo: { script: scriptPubKey, value: 10000 },
        tapLeafScript: [{ leafVersion: 0xc0, script, controlBlock }],
      });
    });
    psbt.addOutput({ script: RANDOM_P2TR_OUTPUT, value: 9000 });
    return psbt.toHex();
  }

  /** Same shape, but input 1's control block folds to an output key its witnessUtxo never paid. */
  function payoutShapedPsbtHexWithBadInput1ControlBlock(): string {
    const psbt = Psbt.fromHex(payoutShapedPsbtHex());
    const [leaf] = psbt.data.inputs[1].tapLeafScript!;
    psbt.data.inputs[1].tapLeafScript = [
      {
        ...leaf,
        // A different (valid) internal key: the path still folds, just not to
        // the output key the witnessUtxo committed to.
        controlBlock: Buffer.concat([
          leaf.controlBlock.subarray(0, 1),
          Buffer.from(TEST_DEPOSITOR_KEY_HEX, "hex"),
          leaf.controlBlock.subarray(33),
        ]),
      },
    ];
    return psbt.toHex();
  }

  it("expects only input 0, and one yield, when the caller requests input 0", () => {
    const { table } = prepareSignPsbt({
      psbtHex: payoutShapedPsbtHex(),
      depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
      signInputIndexes: [0],
    });

    expect([...table.byInput.keys()]).toEqual([0]);
    expect(table.expectedYieldCount).toBe(1);
  });

  it("keeps the unnarrowed classification alongside the narrowed expectation", () => {
    // Flow identity (mixed-input gate, replay fingerprint) reads this map, so
    // narrowing must not be able to reshape what the PSBT is.
    const { table } = prepareSignPsbt({
      psbtHex: payoutShapedPsbtHex(),
      depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
      signInputIndexes: [0],
    });

    expect([...table.classifiedByInput.keys()]).toEqual([0, 1]);
  });

  it("expects every leaf input when the caller requests nothing", () => {
    const { table } = prepareSignPsbt({
      psbtHex: payoutShapedPsbtHex(),
      depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
    });

    expect([...table.byInput.keys()]).toEqual([0, 1]);
    expect(table.expectedYieldCount).toBe(2);
  });

  it("still rejects a control block that does not commit to its leaf on a NON-requested input", () => {
    expectRejects(
      () =>
        prepareSignPsbt({
          psbtHex: payoutShapedPsbtHexWithBadInput1ControlBlock(),
          depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
          signInputIndexes: [0],
        }),
      /input 1 control block does not commit to its TAP_LEAF_SCRIPT/,
    );
  });

  it("completes the ceremony when the device yields input 0 alone", () => {
    // The live regression: the device signs input 0, then assertComplete threw
    // "missing 1: 1:<leafhash>" — after the one-shot payout slot was spent.
    const prepared = prepareSignPsbt({
      psbtHex: payoutShapedPsbtHex(),
      depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
      signInputIndexes: [0],
    });
    const { collector } = getPreparedSignPsbtState(prepared);
    const expectation = prepared.table.byInput.get(0);
    if (expectation?.kind !== "tapscript") throw new Error("input 0 must classify tapscript");
    // varint(input 0) ‖ augmLen(0x40) ‖ signer key(32) ‖ leaf hash(32) ‖ sig(64).
    collector.assertAndRecord(
      Buffer.from("0040" + TEST_DEPOSITOR_KEY_HEX + [...expectation.expectedLeafHashHexes][0] + "ab".repeat(64), "hex"),
    );

    expect(() => collector.assertComplete()).not.toThrow();
  });

  it("rejects a yield for a narrowed-out input that carries a perfectly valid leaf", () => {
    // The fail-closed half: if the firmware reading is ever wrong and the device
    // signs input 1 too, that signature must be refused, not silently accepted.
    const unnarrowed = prepareSignPsbt({
      psbtHex: payoutShapedPsbtHex(),
      depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
    });
    const input1 = unnarrowed.table.byInput.get(1);
    if (input1?.kind !== "tapscript") throw new Error("input 1 must classify tapscript");
    const input1LeafHex = [...input1.expectedLeafHashHexes][0];

    const prepared = prepareSignPsbt({
      psbtHex: payoutShapedPsbtHex(),
      depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
      signInputIndexes: [0],
    });
    const { collector } = getPreparedSignPsbtState(prepared);

    expect(() =>
      collector.assertAndRecord(Buffer.from("0140" + TEST_DEPOSITOR_KEY_HEX + input1LeafHex + "ab".repeat(64), "hex")),
    ).toThrowError(
      expect.objectContaining({ name: "LedgerYieldMismatchError", kind: "unexpected-input", inputIndex: 1 }),
    );
  });

  it("rejects a requested index the PSBT has no input for", () => {
    expectRejects(
      () =>
        prepareSignPsbt({
          psbtHex: payoutShapedPsbtHex(),
          depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
          signInputIndexes: [0, 2],
        }),
      /input 2 was requested for signing but this PSBT has 2 input\(s\)/,
    );
  });

  it("rejects a requested input that exists but carries no signing metadata", () => {
    // Real bytes: this fixture's input 1 has a witnessUtxo and no taproot metadata.
    const vector = loadVector("deposit-flow__claimer_payout__0");

    expectRejects(
      () =>
        prepareSignPsbt({
          psbtHex: vector.psbt_hex,
          depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
          signInputIndexes: [0, 1],
        }),
      /input 1 was requested for signing but carries no signing metadata/,
    );
  });

  it("rejects an empty requested set instead of blaming the PSBT", () => {
    expectRejects(
      () =>
        prepareSignPsbt({
          psbtHex: payoutShapedPsbtHex(),
          depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
          signInputIndexes: [],
        }),
      /signInputIndexes is empty/,
    );
  });
});

describe("the requested input set is inert for key-path signing", () => {
  // Under a wallet policy the base app signs EVERY internal input
  // (`base:sign_psbt.c:142-148`), so narrowing would under-expect and the extra
  // yields would fail AFTER the user already approved on-device.
  const FIXTURE = "deposit-flow__pre_pegin__0";

  it("expects every key-path input even when the caller requests a subset", () => {
    const vector = loadVector(FIXTURE);
    const depositorXOnlyHex = fixtureInternalKeyHex(vector);

    const { table } = prepareSignPsbt({ psbtHex: vector.psbt_hex, depositorXOnlyHex, signInputIndexes: [0] });

    expect([...table.byInput.keys()]).toEqual([0, 1]);
    expect(table.expectedYieldCount).toBe(2);
  });

  it("rejects an out-of-range requested index even though narrowing is inert here", () => {
    // The requested set never narrows a key-path table, but a caller bug in it
    // is still a caller bug — silently ignoring it is the asymmetry to avoid.
    const vector = loadVector(FIXTURE);
    const depositorXOnlyHex = fixtureInternalKeyHex(vector);

    expectRejects(
      () => prepareSignPsbt({ psbtHex: vector.psbt_hex, depositorXOnlyHex, signInputIndexes: [vector.n_inputs] }),
      /was requested for signing but this PSBT has/,
    );
  });

  it("accepts the device yielding every key-path input, and completes", () => {
    const vector = loadVector(FIXTURE);
    const depositorXOnlyHex = fixtureInternalKeyHex(vector);
    const prepared = prepareSignPsbt({ psbtHex: vector.psbt_hex, depositorXOnlyHex, signInputIndexes: [0] });
    const { collector } = getPreparedSignPsbtState(prepared);

    for (let inputIndex = 0; inputIndex < vector.n_inputs; inputIndex++) {
      // varint(index) ‖ augmLen(0x20) ‖ tweaked output key(32) ‖ sig(64).
      collector.assertAndRecord(
        Buffer.from(
          inputIndex.toString(16).padStart(2, "0") +
            "20" +
            fixtureWitnessProgramHex(vector, inputIndex) +
            "cd".repeat(64),
          "hex",
        ),
      );
    }

    expect(() => collector.assertComplete()).not.toThrow();
  });
});

describe("YieldCollector treats a short signature as a malformed payload", () => {
  it("raises a protocol error, not a yield mismatch, for a signature shorter than 64 bytes", () => {
    const vector = loadVector("generated__deposit-flow__pegin__0");
    const prepared = prepareSignPsbt({
      psbtHex: vector.psbt_hex,
      depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
    });
    const { collector } = getPreparedSignPsbtState(prepared);
    const { table } = prepared;
    const expectation = table.byInput.get(0);
    if (expectation?.kind !== "tapscript") throw new Error("input 0 must classify tapscript");
    // Tapscript YIELD payload (0x10 code byte already stripped by the interpreter):
    // varint(input 0) ‖ augmLen(0x40) ‖ signer key(32) ‖ leaf hash(32) ‖ signature.
    const payload = Buffer.from(
      "00" + "40" + TEST_DEPOSITOR_KEY_HEX + [...expectation.expectedLeafHashHexes][0] + "ab".repeat(63),
      "hex",
    );

    expectRejects(
      () => collector.assertAndRecord(payload),
      /YIELD payload truncated inside the signature \(63 of 64 bytes on input 0\)/,
    );
  });
});
