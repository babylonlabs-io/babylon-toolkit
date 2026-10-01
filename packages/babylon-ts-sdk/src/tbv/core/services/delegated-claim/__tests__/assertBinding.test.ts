import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import {
  AssertBindingError,
  assertAssertBindsClaimAndPayout,
} from "../assertBinding";
import { buildDelegatedClaimFixture } from "./fixtures/delegatedClaimPsbts";

const fx = buildDelegatedClaimFixture();

/** The same PSBT with input `index`'s prevout hash replaced. */
function respend(psbtBase64: string, index: number, hashByte: string): string {
  const psbt = Psbt.fromBase64(psbtBase64);
  const tx = psbt.data.globalMap.unsignedTx as unknown as {
    tx: { ins: { hash: Buffer }[] };
  };
  tx.tx.ins[index].hash = Buffer.from(hashByte.repeat(32), "hex");
  return psbt.toBase64();
}

/** The same PSBT with input `index`'s prevout vout replaced. */
function reindex(psbtBase64: string, index: number, vout: number): string {
  const psbt = Psbt.fromBase64(psbtBase64);
  const tx = psbt.data.globalMap.unsignedTx as unknown as {
    tx: { ins: { index: number }[] };
  };
  tx.tx.ins[index].index = vout;
  return psbt.toBase64();
}

/** The same PSBT with input 0's declared prevout replaced, or removed. */
function redeclare(
  psbtBase64: string,
  witnessUtxo: { script: Buffer; value: number } | undefined,
): string {
  const psbt = Psbt.fromBase64(psbtBase64);
  if (witnessUtxo === undefined) delete psbt.data.inputs[0].witnessUtxo;
  else psbt.data.inputs[0].witnessUtxo = witnessUtxo;
  return psbt.toBase64();
}

/** Output 0 of the fixture's Claim, which Assert input 0 spends. */
const claimOutput0 = Psbt.fromBase64(fx.claimPsbt).txOutputs[0];

/** A Payout PSBT built from `psbtBase64` with only input 0 and both outputs. */
function payoutWithoutInput1(psbtBase64: string): string {
  const source = Psbt.fromBase64(psbtBase64);
  const p = new Psbt();
  p.setVersion(source.version).setLocktime(source.locktime);
  p.addInput(source.txInputs[0]);
  source.txOutputs.forEach((out) =>
    p.addOutput({ script: out.script, value: out.value }),
  );
  return p.toBase64();
}

describe("assertAssertBindsClaimAndPayout", () => {
  it("accepts an Assert that spends and declares Claim:0 and a Payout whose input 1 spends Assert:0", () => {
    expect(() =>
      assertAssertBindsClaimAndPayout({
        claimPsbtBase64: fx.claimPsbt,
        assertPsbtBase64: fx.assertPsbt,
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
      }),
    ).not.toThrow();
  });

  it("rejects an Assert whose input 0 spends something other than Claim:0", () => {
    expect(() =>
      assertAssertBindsClaimAndPayout({
        claimPsbtBase64: fx.claimPsbt,
        assertPsbtBase64: respend(fx.assertPsbt, 0, "ee"),
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
      }),
    ).toThrow(AssertBindingError);
  });

  it("rejects an Assert whose declared input 0 amount differs from Claim:0's value", () => {
    expect(() =>
      assertAssertBindsClaimAndPayout({
        claimPsbtBase64: fx.claimPsbt,
        assertPsbtBase64: redeclare(fx.assertPsbt, {
          script: claimOutput0.script,
          value: claimOutput0.value + 1,
        }),
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
      }),
    ).toThrow(
      /declares a prevout of 1001 sats but the Claim's output 0 is worth 1000/,
    );
  });

  it("rejects an Assert whose declared input 0 script differs from Claim:0's script", () => {
    expect(() =>
      assertAssertBindsClaimAndPayout({
        claimPsbtBase64: fx.claimPsbt,
        assertPsbtBase64: redeclare(fx.assertPsbt, {
          script: Buffer.from("5120".concat("ee".repeat(32)), "hex"),
          value: claimOutput0.value,
        }),
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
      }),
    ).toThrow(
      /declares a prevout script that is not the Claim's output 0 script/,
    );
  });

  it("rejects an Assert whose input 0 carries no witnessUtxo", () => {
    expect(() =>
      assertAssertBindsClaimAndPayout({
        claimPsbtBase64: fx.claimPsbt,
        assertPsbtBase64: redeclare(fx.assertPsbt, undefined),
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
      }),
    ).toThrow(/Assert input 0 carries no witnessUtxo/);
  });

  it("rejects a Payout whose input 1 spends an Assert other than the one being signed", () => {
    // The acceptance rule: the Assert we sign must be the one the Payout's
    // input 1 spends. A graph that pairs them differently would leave the
    // signed Assert unspendable by the signed Payout.
    expect(() =>
      assertAssertBindsClaimAndPayout({
        claimPsbtBase64: fx.claimPsbt,
        assertPsbtBase64: fx.assertPsbt,
        payoutClaimerPsbtBase64: respend(fx.payoutClaimerPsbt, 1, "ee"),
      }),
    ).toThrow(AssertBindingError);
  });

  it("rejects a Payout whose input 1 spends the right Assert at the wrong output index", () => {
    expect(() =>
      assertAssertBindsClaimAndPayout({
        claimPsbtBase64: fx.claimPsbt,
        assertPsbtBase64: fx.assertPsbt,
        payoutClaimerPsbtBase64: reindex(fx.payoutClaimerPsbt, 1, 1),
      }),
    ).toThrow(AssertBindingError);
  });

  it("rejects a Payout whose input 0 spends a PegIn other than the one the Claim spends", () => {
    expect(() =>
      assertAssertBindsClaimAndPayout({
        claimPsbtBase64: fx.claimPsbt,
        assertPsbtBase64: fx.assertPsbt,
        payoutClaimerPsbtBase64: respend(fx.payoutClaimerPsbt, 0, "ee"),
      }),
    ).toThrow(AssertBindingError);
  });

  it("rejects a Payout whose input 0 spends the right PegIn at an output other than the Vault UTXO", () => {
    expect(() =>
      assertAssertBindsClaimAndPayout({
        claimPsbtBase64: fx.claimPsbt,
        assertPsbtBase64: fx.assertPsbt,
        payoutClaimerPsbtBase64: reindex(fx.payoutClaimerPsbt, 0, 1),
      }),
    ).toThrow(AssertBindingError);
  });

  it("rejects a Payout that has no input 1", () => {
    expect(() =>
      assertAssertBindsClaimAndPayout({
        claimPsbtBase64: fx.claimPsbt,
        assertPsbtBase64: fx.assertPsbt,
        payoutClaimerPsbtBase64: payoutWithoutInput1(fx.payoutClaimerPsbt),
      }),
    ).toThrow(AssertBindingError);
  });
});
