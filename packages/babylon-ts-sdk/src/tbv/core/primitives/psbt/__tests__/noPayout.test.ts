import { Buffer } from "buffer";

import { Transaction } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { assertCanonicalNoPayoutShape } from "../noPayout";

const ASSERT_TXID = "11".repeat(32);
const CHALLENGE_ASSERT_X_TXID = "22".repeat(32);
const CHALLENGE_ASSERT_Y_TXID = "33".repeat(32);
const TIMELOCK_CHALLENGE_ASSERT = 108;
const PREVOUT_VALUES = [1_000, 688, 688] as const;
const NOPAYOUT_OUTPUT_VALUE = 1_586;

function wireHash(txid: string): Buffer {
  return Buffer.from(txid, "hex").reverse();
}

/** A NoPayout laid out as btc-vault `NoPayoutTx::new` builds it. */
function buildNoPayout(): Transaction {
  const tx = new Transaction();
  tx.version = 2;
  tx.locktime = 0;
  tx.addInput(wireHash(ASSERT_TXID), 0, 0xffffffff);
  tx.addInput(wireHash(CHALLENGE_ASSERT_X_TXID), 0, TIMELOCK_CHALLENGE_ASSERT);
  tx.addInput(wireHash(CHALLENGE_ASSERT_Y_TXID), 0, TIMELOCK_CHALLENGE_ASSERT);
  tx.addOutput(Buffer.from(`5120${"ee".repeat(32)}`, "hex"), NOPAYOUT_OUTPUT_VALUE);
  return tx;
}

function check(
  noPayoutTx: Transaction,
  timelockChallengeAssert = TIMELOCK_CHALLENGE_ASSERT,
): void {
  assertCanonicalNoPayoutShape({
    noPayoutTx,
    assertTxid: ASSERT_TXID,
    challengeAssertXTxid: CHALLENGE_ASSERT_X_TXID,
    challengeAssertYTxid: CHALLENGE_ASSERT_Y_TXID,
    timelockChallengeAssert,
    prevoutValues: PREVOUT_VALUES,
  });
}

describe("assertCanonicalNoPayoutShape", () => {
  it("accepts a NoPayout spending Assert:0, ChallengeAssertX:0 and ChallengeAssertY:0 with the timelock on both ChallengeAssert inputs", () => {
    expect(() => check(buildNoPayout())).not.toThrow();
  });

  it("rejects a ChallengeAssert input whose sequence is not the ChallengeAssert timelock", () => {
    const noTimelock = buildNoPayout();
    noTimelock.ins[1].sequence = 0;

    expect(() => check(noTimelock)).toThrow(
      "NoPayout input 1 (ChallengeAssertX) sequence must be 108, got 0",
    );
  });

  it("rejects an Assert input that is not final", () => {
    const relativeLocked = buildNoPayout();
    relativeLocked.ins[0].sequence = TIMELOCK_CHALLENGE_ASSERT;

    expect(() => check(relativeLocked)).toThrow(
      "NoPayout input 0 (Assert) sequence must be 4294967295",
    );
  });

  it("rejects version 0, which BIP-68 does not apply to and Ledger reserves for proofs", () => {
    const versionZero = buildNoPayout();
    versionZero.version = 0;

    expect(() => check(versionZero)).toThrow(
      "NoPayout version must be 2, got 0",
    );
  });

  it("rejects a non-zero locktime", () => {
    const locked = buildNoPayout();
    locked.locktime = 800_000;

    expect(() => check(locked)).toThrow("NoPayout locktime must be 0");
  });

  it("rejects the ChallengeAssert inputs in swapped order", () => {
    const swapped = buildNoPayout();
    const [x, y] = [swapped.ins[1], swapped.ins[2]];
    swapped.ins[1] = y;
    swapped.ins[2] = x;

    expect(() => check(swapped)).toThrow(
      `NoPayout input 1 must spend ChallengeAssertX ${CHALLENGE_ASSERT_X_TXID}:0`,
    );
  });

  it("rejects an input that spends a non-zero vout of its parent", () => {
    const wrongVout = buildNoPayout();
    wrongVout.ins[0].index = 1;

    expect(() => check(wrongVout)).toThrow(
      `NoPayout input 0 must spend Assert ${ASSERT_TXID}:0, got ${ASSERT_TXID}:1`,
    );
  });

  it("rejects a fourth input", () => {
    const fourInputs = buildNoPayout();
    fourInputs.addInput(Buffer.alloc(32, 0x44), 0, 0xffffffff);

    expect(() => check(fourInputs)).toThrow(
      "NoPayout must have exactly 3 inputs, got 4",
    );
  });

  it("rejects an output that exceeds the inputs, which could never be mined", () => {
    const overspend = buildNoPayout();
    overspend.outs[0].value = 2_377;

    expect(() => check(overspend)).toThrow(
      "NoPayout output value 2377 exceeds its inputs (2376 sats)",
    );
  });

  it("rejects a timelock that is not a valid relative timelock", () => {
    for (const timelock of [0, 65_536, 1.5]) {
      expect(() => check(buildNoPayout(), timelock)).toThrow(
        "timelockChallengeAssert must be an integer in 1..65535",
      );
    }
  });
});
