import { opcodes, script, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { countPrePeginHtlcOutputs } from "../prePeginHtlcOutputCount";

// Output shapes of a Pre-PegIn: taproot HTLCs, the OP_RETURN auth anchor and
// the pay-to-anchor CPFP output (witness v1 with the 2-byte program 0x4e73).
const PAY_TO_ANCHOR_PROGRAM = Buffer.from("4e73", "hex");
const HTLC = script.compile([opcodes.OP_1, Buffer.alloc(32, 1)]);
const AUTH_ANCHOR = script.compile([opcodes.OP_RETURN, Buffer.alloc(32, 2)]);
const CPFP_ANCHOR = script.compile([opcodes.OP_1, PAY_TO_ANCHOR_PROGRAM]);

function txWithOutputs(outputScripts: Buffer[]): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 7), 0);
  for (const outputScript of outputScripts) {
    tx.addOutput(outputScript, 10_000);
  }
  return tx.toHex();
}

describe("countPrePeginHtlcOutputs", () => {
  it("counts the leading outputs up to the OP_RETURN auth anchor", () => {
    const hex = txWithOutputs([HTLC, HTLC, AUTH_ANCHOR, CPFP_ANCHOR]);

    expect(countPrePeginHtlcOutputs(hex)).toBe(2);
  });

  it("stops at the first OP_RETURN even when outputs after it look like HTLCs", () => {
    const hex = txWithOutputs([HTLC, AUTH_ANCHOR, HTLC, CPFP_ANCHOR]);

    expect(countPrePeginHtlcOutputs(hex)).toBe(1);
  });

  it("never counts the last output, even without an auth anchor", () => {
    const hex = txWithOutputs([HTLC, HTLC, HTLC]);

    expect(countPrePeginHtlcOutputs(hex)).toBe(2);
  });

  it("finds no HTLC in a transaction with fewer than two outputs", () => {
    const hex = txWithOutputs([HTLC]);

    expect(countPrePeginHtlcOutputs(hex)).toBe(0);
  });

  it("accepts 0x-prefixed hex", () => {
    const hex = txWithOutputs([HTLC, AUTH_ANCHOR, CPFP_ANCHOR]);

    expect(countPrePeginHtlcOutputs(`0x${hex}`)).toBe(1);
  });

  it("throws on hex that is not a transaction", () => {
    expect(() => countPrePeginHtlcOutputs("0xdeadbeef")).toThrow();
  });
});
