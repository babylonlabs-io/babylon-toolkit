import { Buffer } from "buffer";

import { Transaction } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { deriveBip86ScriptPubKeyHex } from "../../utils/bitcoin";
import { assertChallengeAssertIsCanonical } from "../challengeAssert";

// BIP340 test-vector x-only keys.
const CHALLENGER =
  "dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659";
const ATTACKER =
  "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";

const CHALLENGER_COUNT = 3;
const CHALLENGER_INDEX = 1;
const CONNECTOR_VALUE = 1_234;
const ANCHOR_VALUE = 546;
const OUTPUT_CONNECTOR_SPK = `5120${"ab".repeat(32)}`;

/**
 * An Assert at vault core version 2+: output 0, a ConnectorX then a
 * ConnectorY per challenger, the marker, and the CPFP anchor.
 */
function buildAssert(challengerCount = CHALLENGER_COUNT): Transaction {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0x11), 0, 0xffffffff);
  tx.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 1_000);
  for (let i = 0; i < 2 * challengerCount; i++) {
    tx.addOutput(Buffer.from(`5120${"01".repeat(32)}`, "hex"), CONNECTOR_VALUE);
  }
  tx.addOutput(Buffer.from("6a", "hex"), 0);
  tx.addOutput(Buffer.from(`5120${"02".repeat(32)}`, "hex"), ANCHOR_VALUE);
  return tx;
}

/** A ChallengeAssert laid out as btc-vault builds it, spending `vout` of `parentHash`. */
function buildChallengeAssert(parentHash: Buffer, vout: number): Transaction {
  const tx = new Transaction();
  tx.version = 3;
  tx.locktime = 0;
  tx.addInput(parentHash, vout, 0xffffffff);
  tx.addOutput(
    Buffer.from(OUTPUT_CONNECTOR_SPK, "hex"),
    CONNECTOR_VALUE - ANCHOR_VALUE,
  );
  tx.addOutput(
    Buffer.from(deriveBip86ScriptPubKeyHex(CHALLENGER).slice(2), "hex"),
    ANCHOR_VALUE,
  );
  return tx;
}

function bind(
  challengeAssertTx: Transaction,
  assertTx: Transaction,
  half: "X" | "Y",
  challengerIndex = CHALLENGER_INDEX,
): void {
  assertChallengeAssertIsCanonical({
    challengeAssertTx,
    assertTx,
    half,
    challengerIndex,
    challengerCount: CHALLENGER_COUNT,
    challengerPubkey: CHALLENGER,
    outputConnectorScriptPubKey: OUTPUT_CONNECTOR_SPK,
  });
}

describe("assertChallengeAssertIsCanonical", () => {
  it("accepts the ChallengeAssertX that spends the challenger's ConnectorX at Assert vout 1 + index", () => {
    const assertTx = buildAssert();
    const challengeAssertX = buildChallengeAssert(assertTx.getHash(), 2);

    expect(() => bind(challengeAssertX, assertTx, "X")).not.toThrow();
  });

  it("accepts the ChallengeAssertY that spends the challenger's ConnectorY at Assert vout 1 + K + index", () => {
    const assertTx = buildAssert();
    const challengeAssertY = buildChallengeAssert(assertTx.getHash(), 5);

    expect(() => bind(challengeAssertY, assertTx, "Y")).not.toThrow();
  });

  it("rejects an independently funded parent that does not spend the Assert", () => {
    const assertTx = buildAssert();
    const independent = buildChallengeAssert(Buffer.alloc(32, 0x99), 2);

    expect(() => bind(independent, assertTx, "X")).toThrow(
      "ChallengeAssertX (challenger " +
        CHALLENGER +
        ") is not the canonical transaction for this Assert",
    );
  });

  it("rejects a parent that spends the real ConnectorX into an output other than the ChallengeAssert connector", () => {
    const assertTx = buildAssert();
    const attackerKeyed = buildChallengeAssert(assertTx.getHash(), 2);
    attackerKeyed.outs[0].script = Buffer.from(
      deriveBip86ScriptPubKeyHex(ATTACKER).slice(2),
      "hex",
    );

    expect(() => bind(attackerKeyed, assertTx, "X")).toThrow(
      "is not the canonical transaction",
    );
  });

  it("rejects a ChallengeAssertX that spends the challenger's ConnectorY", () => {
    const assertTx = buildAssert();
    const atConnectorY = buildChallengeAssert(assertTx.getHash(), 5);

    expect(() => bind(atConnectorY, assertTx, "X")).toThrow(
      "is not the canonical transaction",
    );
  });

  it("rejects a parent whose anchor does not pay the challenger's BIP-86 key", () => {
    const assertTx = buildAssert();
    const foreignAnchor = buildChallengeAssert(assertTx.getHash(), 2);
    foreignAnchor.outs[1].script = Buffer.from(
      deriveBip86ScriptPubKeyHex(ATTACKER).slice(2),
      "hex",
    );

    expect(() => bind(foreignAnchor, assertTx, "X")).toThrow(
      "is not the canonical transaction",
    );
  });

  it("rejects a parent with a second input", () => {
    const assertTx = buildAssert();
    const twoInputs = buildChallengeAssert(assertTx.getHash(), 2);
    twoInputs.addInput(Buffer.alloc(32, 0x99), 0, 0xffffffff);

    expect(() => bind(twoInputs, assertTx, "X")).toThrow(
      "is not the canonical transaction",
    );
  });

  it("rejects a parent that is not version 3", () => {
    const assertTx = buildAssert();
    const versionTwo = buildChallengeAssert(assertTx.getHash(), 2);
    versionTwo.version = 2;

    expect(() => bind(versionTwo, assertTx, "X")).toThrow(
      "is not the canonical transaction",
    );
  });

  it("rejects a challenger index outside the challenger set", () => {
    const assertTx = buildAssert();
    const challengeAssertX = buildChallengeAssert(assertTx.getHash(), 4);

    expect(() => bind(challengeAssertX, assertTx, "X", 3)).toThrow(
      "challenger index 3 is outside 0..2",
    );
  });

  it("rejects an Assert that has no output at the challenger's connector vout", () => {
    const shortAssert = buildAssert(1);
    const challengeAssertY = buildChallengeAssert(shortAssert.getHash(), 5);

    expect(() => bind(challengeAssertY, shortAssert, "Y")).toThrow(
      "Assert has no output 5 for the ChallengeAssertY of challenger index 1",
    );
  });
});
