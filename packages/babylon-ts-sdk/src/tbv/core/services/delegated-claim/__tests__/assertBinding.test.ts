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
  it("accepts an Assert that spends Claim:0 and a Payout whose input 1 spends Assert:0", () => {
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
