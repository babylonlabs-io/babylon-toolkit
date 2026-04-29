import * as bitcoin from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { assertAuthAnchorOpReturn } from "../assertAuthAnchorOpReturn";

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
