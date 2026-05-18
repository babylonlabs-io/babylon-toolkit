/**
 * Tests for assertPsbtUnsignedTxMatches.
 */

import { Buffer } from "buffer";

import { Psbt, networks } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import {
  assertPsbtUnsignedTxMatches,
  PsbtSubstitutionError,
} from "../assertPsbtUnsignedTxMatches";

const NETWORK = networks.testnet;

const PREVOUT_TXID_A = Buffer.alloc(32, 0xaa);
const PREVOUT_TXID_B = Buffer.alloc(32, 0xbb);

const SCRIPT_DEPOSITOR = Buffer.from(`0014${"11".repeat(20)}`, "hex");
const SCRIPT_ATTACKER = Buffer.from(`0014${"ee".repeat(20)}`, "hex");

const FAKE_TAPROOT_KEY_SIG = Buffer.alloc(64, 0x42);

function buildBasePsbt(opts?: {
  prevoutTxid?: Buffer;
  prevoutVout?: number;
  prevoutSequence?: number;
  outputScript?: Buffer;
  outputValue?: number;
  locktime?: number;
}): Psbt {
  const psbt = new Psbt({ network: NETWORK });
  psbt.addInput({
    hash: opts?.prevoutTxid ?? PREVOUT_TXID_A,
    index: opts?.prevoutVout ?? 0,
    sequence: opts?.prevoutSequence ?? 0xfffffffd,
  });
  psbt.addOutput({
    script: opts?.outputScript ?? SCRIPT_DEPOSITOR,
    value: opts?.outputValue ?? 90_000,
  });
  psbt.locktime = opts?.locktime ?? 0;
  return psbt;
}

describe("assertPsbtUnsignedTxMatches", () => {
  it("passes when the returned PSBT differs only by an added partial sig", () => {
    const requestedHex = buildBasePsbt().toHex();
    const returned = Psbt.fromHex(requestedHex);
    returned.updateInput(0, { tapKeySig: FAKE_TAPROOT_KEY_SIG });
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: returned.toHex(),
      }),
    ).not.toThrow();
  });

  it("throws when an output address has been swapped", () => {
    const requestedHex = buildBasePsbt().toHex();
    const returnedHex = buildBasePsbt({ outputScript: SCRIPT_ATTACKER }).toHex();
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: returnedHex,
      }),
    ).toThrow(/output 0 scriptPubKey differs/);
  });

  it("redacts the prevout txid in mismatch errors using human (big-endian) byte order", () => {
    // Build distinct prevout txids whose internal-LE hash bytes differ at
    // the front; this ensures we observe the *reversed* form in the error.
    const requestedHash = Buffer.from(
      "1111111111111111111111111111111111111111111111111111111111111122",
      "hex",
    );
    const returnedHash = Buffer.from(
      "9999999999999999999999999999999999999999999999999999999999999988",
      "hex",
    );
    const requestedHex = buildBasePsbt({ prevoutTxid: requestedHash }).toHex();
    const returnedHex = buildBasePsbt({ prevoutTxid: returnedHash }).toHex();
    let caught: Error | null = null;
    try {
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: returnedHex,
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    // Reversed (big-endian / explorer-displayed) prefixes — first 8 chars of
    // the reversed bytes (so "...22" → "22…", "...88" → "88…").
    expect(caught!.message).toContain("requested=22111111…");
    expect(caught!.message).toContain("returned=88999999…");
  });

  it("redacts hex fields in mismatch errors so full UTXO/address data does not leak", () => {
    const requestedHex = buildBasePsbt().toHex();
    const returnedHex = buildBasePsbt({ outputScript: SCRIPT_ATTACKER }).toHex();
    let caught: Error | null = null;
    try {
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: returnedHex,
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    // Full attacker scriptPubKey hex must NOT appear in the error.
    expect(caught!.message).not.toContain(SCRIPT_ATTACKER.toString("hex"));
    // Truncated 8-char prefix (with ellipsis) should appear instead.
    expect(caught!.message).toMatch(/requested=[0-9a-f]{8}…, returned=[0-9a-f]{8}…/);
  });

  it("throws when an output value has been changed", () => {
    const requestedHex = buildBasePsbt({ outputValue: 90_000 }).toHex();
    const returnedHex = buildBasePsbt({ outputValue: 89_000 }).toHex();
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: returnedHex,
      }),
    ).toThrow(/output 0 value differs \(requested=90000, returned=89000\)/);
  });

  it("throws when an input prevout txid has been changed", () => {
    const requestedHex = buildBasePsbt({ prevoutTxid: PREVOUT_TXID_A }).toHex();
    const returnedHex = buildBasePsbt({ prevoutTxid: PREVOUT_TXID_B }).toHex();
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: returnedHex,
      }),
    ).toThrow(PsbtSubstitutionError);
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: returnedHex,
      }),
    ).toThrow(/input 0 prevout txid differs/);
  });

  it("throws when an input prevout vout has been changed", () => {
    const requestedHex = buildBasePsbt({ prevoutVout: 0 }).toHex();
    const returnedHex = buildBasePsbt({ prevoutVout: 1 }).toHex();
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: returnedHex,
      }),
    ).toThrow(/input 0 prevout vout differs \(requested=0, returned=1\)/);
  });

  it("throws when tx version differs", () => {
    const requested = buildBasePsbt();
    requested.setVersion(1);
    const returned = buildBasePsbt();
    returned.setVersion(2);
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requested.toHex(),
        returnedPsbtHex: returned.toHex(),
      }),
    ).toThrow(/tx version differs \(requested=1, returned=2\)/);
  });

  it("throws when input count differs", () => {
    const requestedHex = buildBasePsbt().toHex();
    const returned = buildBasePsbt();
    returned.addInput({
      hash: PREVOUT_TXID_B,
      index: 1,
      sequence: 0xfffffffd,
    });
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: returned.toHex(),
      }),
    ).toThrow(/input count differs \(requested=1, returned=2\)/);
  });

  it("throws when output count differs", () => {
    const requestedHex = buildBasePsbt().toHex();
    const returned = buildBasePsbt();
    returned.addOutput({ script: SCRIPT_ATTACKER, value: 1_000 });
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: returned.toHex(),
      }),
    ).toThrow(/output count differs \(requested=1, returned=2\)/);
  });

  it("throws when locktime differs", () => {
    const requestedHex = buildBasePsbt({ locktime: 0 }).toHex();
    const returnedHex = buildBasePsbt({ locktime: 500_000 }).toHex();
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: returnedHex,
      }),
    ).toThrow(/tx locktime differs \(requested=0, returned=500000\)/);
  });

  it("throws when input sequence differs (RBF flag swap)", () => {
    const requestedHex = buildBasePsbt({
      prevoutSequence: 0xfffffffd,
    }).toHex();
    const returnedHex = buildBasePsbt({
      prevoutSequence: 0xffffffff,
    }).toHex();
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: returnedHex,
      }),
    ).toThrow(/input 0 sequence differs/);
  });

  it("throws with 'returned' label when the wallet returns malformed bytes", () => {
    const requestedHex = buildBasePsbt().toHex();
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: requestedHex,
        returnedPsbtHex: "deadbeef",
      }),
    ).toThrow(/Failed to parse returned PSBT/);
  });

  it("throws with 'requested' label when the locally-built PSBT is malformed", () => {
    const returnedHex = buildBasePsbt().toHex();
    expect(() =>
      assertPsbtUnsignedTxMatches({
        requestedPsbtHex: "deadbeef",
        returnedPsbtHex: returnedHex,
      }),
    ).toThrow(/Failed to parse requested PSBT/);
  });
});
