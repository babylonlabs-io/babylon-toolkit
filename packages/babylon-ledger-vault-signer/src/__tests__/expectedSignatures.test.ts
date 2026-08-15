/**
 * G2 gate + build-rule rejections for the SIGN_PSBT expected-signature table.
 *
 * Classification runs over all 22 firmware-fixture vectors through the real
 * prepare pipeline: which inputs are tapscript / taproot-keypath / absent,
 * the tapleaf hashes (cross-checked against bip341.tapleafHash — an
 * independent oracle), and the expected yield count, matching the per-flow
 * table of the B1-c spec §3.1. Rejections use synthetic PSBTs built with
 * bitcoinjs so each violated rule is visible in the test body.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { crypto as bcrypto, initEccLib, payments, Psbt } from "bitcoinjs-lib";
import { tapleafHash as bip341TapleafHash } from "bitcoinjs-lib/src/payments/bip341";
import { Buffer } from "buffer";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { isLedgerSignPsbtProtocolError } from "../errors";
import { prepareSignPsbt } from "../signPsbtPrepare";

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

  it("rejects a keypath input whose internal key is not the depositor key", () => {
    const psbt = psbtWithOneInput();
    psbt.updateInput(0, {
      tapInternalKey: Buffer.from(OTHER_KEY_HEX, "hex"),
      witnessUtxo: { script: p2trOutput(OTHER_KEY_HEX), value: 5000 },
    });
    expectPrepareRejects(psbt.toHex(), /not the connected depositor key/);
  });

  it("rejects a keypath input with no witnessUtxo", () => {
    const psbt = psbtWithOneInput();
    psbt.updateInput(0, { tapInternalKey: Buffer.from(TEST_DEPOSITOR_KEY_HEX, "hex") });
    expectPrepareRejects(psbt.toHex(), /keypath but has no witnessUtxo/);
  });

  it("rejects a keypath input whose witnessUtxo script is not P2TR", () => {
    const psbt = psbtWithOneInput();
    psbt.updateInput(0, {
      tapInternalKey: Buffer.from(TEST_DEPOSITOR_KEY_HEX, "hex"),
      witnessUtxo: { script: Buffer.concat([Buffer.from([0x00, 0x14]), Buffer.alloc(20, 0x2c)]), value: 5000 },
    });
    expectPrepareRejects(psbt.toHex(), /witnessUtxo script is not P2TR/);
  });

  it("rejects a keypath input whose witness program is not the BIP-86 tweak of the depositor key", () => {
    const psbt = psbtWithOneInput();
    psbt.updateInput(0, {
      tapInternalKey: Buffer.from(TEST_DEPOSITOR_KEY_HEX, "hex"),
      witnessUtxo: { script: P2TR_RANDOM_SCRIPT, value: 5000 },
    });
    expectPrepareRejects(psbt.toHex(), /not the BIP-86 P2TR of the depositor key/);
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
