import * as bitcoin from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import {
  assertAuthAnchorOpReturn,
  countHtlcOutputs,
  readAuthAnchorOpReturn,
} from "../assertAuthAnchorOpReturn";

const ANCHOR_HASH = "ab".repeat(32);
const OTHER_HASH = "cd".repeat(32);

/** P2WPKH placeholder script for non-OP_RETURN outputs in fixtures. */
const DUMMY_P2WPKH_SCRIPT = Buffer.from("0014" + "11".repeat(20), "hex");

interface OutputSpec {
  /** Either a hex script or a constructed Buffer. */
  scriptHex: string;
  value: number;
}

/**
 * Build a minimal Bitcoin transaction with the requested outputs.
 * Inputs use a fixed dummy outpoint; their content is irrelevant for
 * the OP_RETURN assertion.
 */
function buildTxHex(outputs: OutputSpec[]): string {
  const tx = new bitcoin.Transaction();
  tx.addInput(Buffer.alloc(32, 0xaa), 0);
  for (const out of outputs) {
    tx.addOutput(Buffer.from(out.scriptHex, "hex"), out.value);
  }
  return tx.toHex();
}

function htlcOutput(): OutputSpec {
  return { scriptHex: DUMMY_P2WPKH_SCRIPT.toString("hex"), value: 100_000 };
}

function opReturnOutput(payloadHex: string, value = 0): OutputSpec {
  // OP_RETURN (0x6a) || PUSH32 (0x20) || <32-byte payload>
  return { scriptHex: `6a20${payloadHex}`, value };
}

describe("assertAuthAnchorOpReturn", () => {
  it("accepts a tx whose vout=N output is OP_RETURN PUSH32 <expected hash>", () => {
    const txHex = buildTxHex([
      htlcOutput(),
      opReturnOutput(ANCHOR_HASH),
      htlcOutput(),
    ]);
    expect(() =>
      assertAuthAnchorOpReturn(txHex, 1, ANCHOR_HASH),
    ).not.toThrow();
  });

  it("strips a leading 0x prefix from the funded tx hex", () => {
    const txHex = buildTxHex([htlcOutput(), opReturnOutput(ANCHOR_HASH)]);
    expect(() =>
      assertAuthAnchorOpReturn(`0x${txHex}`, 1, ANCHOR_HASH),
    ).not.toThrow();
  });

  it("matches against the expected hash case-insensitively", () => {
    const txHex = buildTxHex([htlcOutput(), opReturnOutput(ANCHOR_HASH)]);
    expect(() =>
      assertAuthAnchorOpReturn(txHex, 1, ANCHOR_HASH.toUpperCase()),
    ).not.toThrow();
  });

  it("throws when the tx has no output at vout=N", () => {
    const txHex = buildTxHex([htlcOutput()]);
    expect(() =>
      assertAuthAnchorOpReturn(txHex, 1, ANCHOR_HASH),
    ).toThrow(/auth-anchor OP_RETURN missing/);
  });

  it("throws when the script length is not 34 bytes", () => {
    // OP_RETURN PUSH16 <16 bytes> — wrong length.
    const tooShort: OutputSpec = {
      scriptHex: `6a10${"ab".repeat(16)}`,
      value: 0,
    };
    const txHex = buildTxHex([htlcOutput(), tooShort]);
    expect(() =>
      assertAuthAnchorOpReturn(txHex, 1, ANCHOR_HASH),
    ).toThrow(/unexpected/);
  });

  it("throws when the first opcode is not OP_RETURN (0x6a)", () => {
    // Replace OP_RETURN with OP_NOP (0x61); keep the rest of the layout.
    const wrongOpcode: OutputSpec = {
      scriptHex: `6120${ANCHOR_HASH}`,
      value: 0,
    };
    const txHex = buildTxHex([htlcOutput(), wrongOpcode]);
    expect(() =>
      assertAuthAnchorOpReturn(txHex, 1, ANCHOR_HASH),
    ).toThrow(/unexpected/);
  });

  it("throws when the push prefix is not OP_PUSH32 (0x20)", () => {
    // OP_RETURN OP_PUSHDATA1 0x20 <32 bytes> — semantically equivalent
    // to OP_RETURN PUSH32 but a different encoding. We reject it
    // strictly: WASM emits the canonical PUSH32 form, so anything else
    // signals a non-conformant build.
    const pushdata1: OutputSpec = {
      scriptHex: `6a4c20${ANCHOR_HASH}`,
      value: 0,
    };
    const txHex = buildTxHex([htlcOutput(), pushdata1]);
    expect(() =>
      assertAuthAnchorOpReturn(txHex, 1, ANCHOR_HASH),
    ).toThrow(/unexpected/);
  });

  it("throws when the pushed payload differs from the expected hash", () => {
    const txHex = buildTxHex([htlcOutput(), opReturnOutput(OTHER_HASH)]);
    expect(() =>
      assertAuthAnchorOpReturn(txHex, 1, ANCHOR_HASH),
    ).toThrow(/payload mismatch/);
  });

  it("throws when the OP_RETURN output has non-zero value", () => {
    // Bitcoin permits non-zero OP_RETURN outputs (they're unspendable
    // burns), but they're non-standard. The contract expects zero.
    const txHex = buildTxHex([
      htlcOutput(),
      opReturnOutput(ANCHOR_HASH, /* value */ 546),
    ]);
    expect(() =>
      assertAuthAnchorOpReturn(txHex, 1, ANCHOR_HASH),
    ).toThrow(/non-zero value/);
  });
});

describe("countHtlcOutputs", () => {
  it("counts 1 for a single-vault auth-anchored tx [HTLC, OP_RETURN, anchor]", () => {
    const txHex = buildTxHex([
      htlcOutput(),
      opReturnOutput(ANCHOR_HASH),
      htlcOutput(),
    ]);
    expect(countHtlcOutputs(txHex)).toBe(1);
  });

  it("counts 1 for a single-vault tx with no auth anchor [HTLC, anchor]", () => {
    const txHex = buildTxHex([htlcOutput(), htlcOutput()]);
    expect(countHtlcOutputs(txHex)).toBe(1);
  });

  it("counts 2 for a two-vault auth-anchored tx [HTLC, HTLC, OP_RETURN, anchor]", () => {
    const txHex = buildTxHex([
      htlcOutput(),
      htlcOutput(),
      opReturnOutput(ANCHOR_HASH),
      htlcOutput(),
    ]);
    expect(countHtlcOutputs(txHex)).toBe(2);
  });

  it("counts 2 for a two-vault tx with no auth anchor [HTLC, HTLC, anchor]", () => {
    const txHex = buildTxHex([htlcOutput(), htlcOutput(), htlcOutput()]);
    expect(countHtlcOutputs(txHex)).toBe(2);
  });

  it("stops at the first OP_RETURN — a trailing extra OP_RETURN does not change the count", () => {
    // [HTLC, OP_RETURN, OP_RETURN]: the second OP_RETURN sits in the
    // last (CPFP-anchor) slot and is irrelevant; the HTLC count is 1.
    const txHex = buildTxHex([
      htlcOutput(),
      opReturnOutput(ANCHOR_HASH),
      opReturnOutput(OTHER_HASH),
    ]);
    expect(countHtlcOutputs(txHex)).toBe(1);
  });

  it("throws when the tx has fewer than 2 outputs", () => {
    const txHex = buildTxHex([htlcOutput()]);
    expect(() => countHtlcOutputs(txHex)).toThrow(/at least 2 outputs/);
  });

  it("strips a leading 0x prefix from the funded tx hex", () => {
    const txHex = buildTxHex([htlcOutput(), opReturnOutput(ANCHOR_HASH)]);
    expect(countHtlcOutputs(`0x${txHex}`)).toBe(1);
  });
});

describe("readAuthAnchorOpReturn", () => {
  it("returns the hash when vout points at an OP_RETURN PUSH32 output", () => {
    const txHex = buildTxHex([
      htlcOutput(),
      opReturnOutput(ANCHOR_HASH),
      htlcOutput(),
    ]);
    expect(readAuthAnchorOpReturn(txHex, 1)).toBe(ANCHOR_HASH);
  });

  it("returns undefined when the output at vout is not an OP_RETURN (no auth anchor)", () => {
    // [HTLC, anchor] — vout 1 is the CPFP anchor, not an OP_RETURN.
    const txHex = buildTxHex([htlcOutput(), htlcOutput()]);
    expect(readAuthAnchorOpReturn(txHex, 1)).toBeUndefined();
  });

  it("returns undefined when vout is out of bounds", () => {
    const txHex = buildTxHex([htlcOutput(), htlcOutput()]);
    expect(readAuthAnchorOpReturn(txHex, 5)).toBeUndefined();
  });

  it("reads only the output at vout — an OP_RETURN elsewhere is ignored", () => {
    // OP_RETURN at vout 2, but vout 1 is a plain output → no auth anchor.
    const txHex = buildTxHex([
      htlcOutput(),
      htlcOutput(),
      opReturnOutput(ANCHOR_HASH),
    ]);
    expect(readAuthAnchorOpReturn(txHex, 1)).toBeUndefined();
  });

  it("throws when the output at vout is an OP_RETURN but not a clean 32-byte push", () => {
    // OP_RETURN PUSH16 <16 bytes> — an OP_RETURN, but malformed as an
    // auth anchor. Must throw, not silently degrade to "no anchor".
    const malformed = { scriptHex: `6a10${"ab".repeat(16)}`, value: 0 };
    const txHex = buildTxHex([htlcOutput(), malformed]);
    expect(() => readAuthAnchorOpReturn(txHex, 1)).toThrow(/malformed/);
  });

  it("strips a leading 0x prefix from the funded tx hex", () => {
    const txHex = buildTxHex([htlcOutput(), opReturnOutput(ANCHOR_HASH)]);
    expect(readAuthAnchorOpReturn(`0x${txHex}`, 1)).toBe(ANCHOR_HASH);
  });

  it("normalizes the hash to lowercase regardless of input case", () => {
    const txHex = buildTxHex([htlcOutput(), opReturnOutput("CD".repeat(32))]);
    expect(readAuthAnchorOpReturn(txHex, 1)).toBe("cd".repeat(32));
  });
});
