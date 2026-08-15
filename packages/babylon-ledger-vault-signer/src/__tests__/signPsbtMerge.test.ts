/**
 * G5 gate: mergeYields writes signature fields ONLY into the original v0 PSBT
 * — the unsigned tx stays byte-identical, tapScriptSig/tapKeySig carry exactly
 * the collected yields, and nothing is finalized (the caller finalizes; a
 * finalized return would be rejected outright by the SDK's PegIn path). The
 * bip174 duplicate throws are asserted as the documented integrity backstop.
 */

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import type { CollectedYield } from "../expectedSignatures";
import { mergeYields } from "../signPsbtMerge";
import { prepareSignPsbt } from "../signPsbtPrepare";

const VECTORS_DIR = join(__dirname, "..", "vendor", "ledger-bitcoin", "__tests__", "vectors", "signpsbt");

// Valid x-only point (the generated fixtures' depositor key).
const TEST_DEPOSITOR_KEY_HEX = "e49662aea97a89551401ce54de10474b24b4ab71383b69cf164ea59b3a209e0d";
const TEST_SIG = Uint8Array.from(Buffer.alloc(64, 0xcd));

function loadPsbtHex(name: string): string {
  return (JSON.parse(readFileSync(join(VECTORS_DIR, `${name}.json`), "utf8")) as { psbt_hex: string }).psbt_hex;
}

function loadInternalKeyHex(name: string): string {
  const vector = JSON.parse(readFileSync(join(VECTORS_DIR, `${name}.json`), "utf8")) as {
    input_maps: [string, string][][];
  };
  const entry = vector.input_maps[0].find(([key]) => key === "17");
  if (!entry) throw new Error("fixture has no TAP_INTERNAL_KEY on input 0");
  return entry[1];
}

function unsignedTxHex(psbtHex: string): string {
  return Psbt.fromHex(psbtHex).data.globalMap.unsignedTx.toBuffer().toString("hex");
}

/** Table-derived yields with a fixed test signature — what a completed loop returns. */
function yieldsFor(psbtHex: string, depositorXOnlyHex: string): readonly CollectedYield[] {
  const { table } = prepareSignPsbt({ psbtHex, depositorXOnlyHex });
  return [...table.byInput.entries()].map(([inputIndex, expectation]) =>
    expectation.kind === "tapscript"
      ? {
          kind: "tapscript",
          inputIndex,
          signerXOnlyHex: expectation.expectedSignerXOnlyHex,
          leafHashHex: [...expectation.expectedLeafHashHexes][0],
          signature: TEST_SIG,
        }
      : { kind: "taproot-keypath", inputIndex, outputKeyHex: expectation.expectedOutputKeyHex, signature: TEST_SIG },
  );
}

describe("mergeYields (G5)", () => {
  it("merges a tapscript yield: tapScriptSig only, unsigned tx untouched, nothing finalized", () => {
    const psbtHex = loadPsbtHex("generated__deposit-flow__pegin__0");
    const yields = yieldsFor(psbtHex, TEST_DEPOSITOR_KEY_HEX);

    const mergedHex = mergeYields(psbtHex, yields);

    expect(unsignedTxHex(mergedHex)).toBe(unsignedTxHex(psbtHex));
    const merged = Psbt.fromHex(mergedHex);
    const input = merged.data.inputs[0];
    expect(input.tapScriptSig).toHaveLength(1);
    expect(input.tapScriptSig?.[0].pubkey.toString("hex")).toBe(TEST_DEPOSITOR_KEY_HEX);
    const yielded = yields[0];
    if (yielded.kind !== "tapscript") throw new Error("pegin yield must be tapscript");
    expect(input.tapScriptSig?.[0].leafHash.toString("hex")).toBe(yielded.leafHashHex);
    expect(input.tapScriptSig?.[0].signature.toString("hex")).toBe(Buffer.from(TEST_SIG).toString("hex"));
    for (const mergedInput of merged.data.inputs) {
      expect(mergedInput.tapKeySig).toBeUndefined();
      expect(mergedInput.finalScriptWitness).toBeUndefined();
      expect(mergedInput.finalScriptSig).toBeUndefined();
    }
  });

  it("merges Payout-shaped yields: input 0 signed, input 1 untouched", () => {
    const psbtHex = loadPsbtHex("deposit-flow__claimer_payout__2");
    const mergedHex = mergeYields(psbtHex, yieldsFor(psbtHex, TEST_DEPOSITOR_KEY_HEX));

    expect(unsignedTxHex(mergedHex)).toBe(unsignedTxHex(psbtHex));
    const merged = Psbt.fromHex(mergedHex);
    expect(merged.data.inputs[0].tapScriptSig).toHaveLength(1);
    expect(merged.data.inputs[1].tapScriptSig).toBeUndefined();
    expect(merged.data.inputs[1].tapKeySig).toBeUndefined();
  });

  it("merges keypath yields: tapKeySig on every wallet input, nothing finalized", () => {
    const psbtHex = loadPsbtHex("deposit-flow__pre_pegin__0");
    const depositorXOnlyHex = loadInternalKeyHex("deposit-flow__pre_pegin__0");
    const yields = yieldsFor(psbtHex, depositorXOnlyHex);
    expect(yields).toHaveLength(2);

    const mergedHex = mergeYields(psbtHex, yields);

    expect(unsignedTxHex(mergedHex)).toBe(unsignedTxHex(psbtHex));
    const merged = Psbt.fromHex(mergedHex);
    for (const input of merged.data.inputs) {
      expect(input.tapKeySig?.toString("hex")).toBe(Buffer.from(TEST_SIG).toString("hex"));
      expect(input.tapScriptSig).toBeUndefined();
      expect(input.finalScriptWitness).toBeUndefined();
    }
  });

  it("throws on a duplicate (pubkey, leafHash) tapScriptSig instead of overwriting", () => {
    const psbtHex = loadPsbtHex("generated__deposit-flow__pegin__0");
    const yields = yieldsFor(psbtHex, TEST_DEPOSITOR_KEY_HEX);

    expect(() => mergeYields(psbtHex, [...yields, ...yields])).toThrow();
  });

  it("throws when merging a tapKeySig into an already-signed input instead of overwriting", () => {
    const psbtHex = loadPsbtHex("deposit-flow__pre_pegin__0");
    const depositorXOnlyHex = loadInternalKeyHex("deposit-flow__pre_pegin__0");
    const yields = yieldsFor(psbtHex, depositorXOnlyHex);

    const mergedHex = mergeYields(psbtHex, yields);

    expect(() => mergeYields(mergedHex, yields)).toThrow();
  });
});
