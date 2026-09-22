import { Psbt } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { PayoutInputLeafError, copyAssertConnectorLeaf } from "../payoutInputLeaf";
import { buildDelegatedClaimFixture } from "./fixtures/delegatedClaimPsbts";

const fx = buildDelegatedClaimFixture();

describe("copyAssertConnectorLeaf", () => {
  it("gives the depositor Payout the same input-1 leaf as the claimer Payout and changes nothing else", () => {
    const out = Psbt.fromBase64(
      copyAssertConnectorLeaf({
        payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
      }),
    );
    const claimer = Psbt.fromBase64(fx.payoutClaimerPsbt);
    const before = Psbt.fromBase64(fx.payoutDepositorPsbt);

    expect(out.data.inputs[1].tapLeafScript).toEqual(claimer.data.inputs[1].tapLeafScript);
    // Input 0 (the vault UTXO leaf the depositor signs) is untouched.
    expect(out.data.inputs[0]).toEqual(before.data.inputs[0]);
    expect(out.data.globalMap.unsignedTx.toBuffer()).toEqual(before.data.globalMap.unsignedTx.toBuffer());
  });

  it("refuses two PSBTs that are not the same unsigned transaction", () => {
    expect(() =>
      copyAssertConnectorLeaf({
        payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
        payoutClaimerPsbtBase64: fx.payoutWrongDestinationPsbt,
      }),
    ).toThrow(PayoutInputLeafError);
  });

  it("refuses a depositor Payout that already carries an input-1 leaf", () => {
    expect(() =>
      copyAssertConnectorLeaf({
        payoutDepositorPsbtBase64: fx.payoutClaimerPsbt,
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
      }),
    ).toThrow(PayoutInputLeafError);
  });

  it("rejects a claimer Payout whose input 1 carries no Assert-connector leaf", () => {
    const claimer = Psbt.fromBase64(fx.payoutClaimerPsbt);
    // `delete`, not `= undefined`: bip174 serialises every own key, so an
    // undefined value would throw in the encoder instead of reaching the guard.
    delete claimer.data.inputs[1].tapLeafScript;

    expect(() =>
      copyAssertConnectorLeaf({
        payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
        payoutClaimerPsbtBase64: claimer.toBase64(),
      }),
    ).toThrow(PayoutInputLeafError);
  });

  it("rejects Payouts that have no input 1", () => {
    const source = Psbt.fromBase64(fx.payoutClaimerPsbt);
    const onlyInput0 = new Psbt();
    onlyInput0.setVersion(source.version).setLocktime(source.locktime);
    onlyInput0.addInput(source.txInputs[0]);
    source.txOutputs.forEach((out) => onlyInput0.addOutput({ script: out.script, value: out.value }));
    const onlyInput0Base64 = onlyInput0.toBase64();

    // Same PSBT on both sides, so the unsigned-tx check passes and the
    // missing-input-1 check is the one that throws.
    expect(() =>
      copyAssertConnectorLeaf({
        payoutDepositorPsbtBase64: onlyInput0Base64,
        payoutClaimerPsbtBase64: onlyInput0Base64,
      }),
    ).toThrow(PayoutInputLeafError);
  });
});
