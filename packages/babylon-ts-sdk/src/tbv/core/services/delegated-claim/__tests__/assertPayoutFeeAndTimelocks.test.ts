import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeAll, describe, expect, it } from "vitest";

import { initializeWasmForTests } from "../../../primitives/psbt/__tests__/helpers";
import { computePayoutFeeFloor } from "../../../wasm";
import { assertPayoutFeeAndTimelocks } from "../assertPayoutFeeAndTimelocks";
import type { DelegatedClaimVaultContext } from "../types";
import {
  CHALLENGER_A,
  CHALLENGER_B,
  DEPOSITOR_ETH_ADDRESS,
  DEPOSITOR_XONLY_PUBKEY,
  REGISTERED_PAYOUT_SCRIPT,
  TIMELOCK_ASSERT,
  TIMELOCK_PEGIN,
  VAULT_ID,
  VAULT_PROVIDER_PUBKEY,
  VAULT_UTXO_SATS,
  buildDelegatedClaimFixture,
  type PayoutOverrides,
} from "./fixtures/delegatedClaimPsbts";

const COUNCIL_SIZE = 3;
const PROTOCOL_FEE_RATE = 1n;
/** 1 sat/vB x (500 + 55 x 2 participants) vB — assertPayoutFeeBand.ts:46-47. */
const CEILING_SATS = 610;
/** The fixture's payout script, whose length the floor is measured for. */
const PAYOUT_SCRIPT_LEN = REGISTERED_PAYOUT_SCRIPT.length / 2;

const vault: DelegatedClaimVaultContext = {
  vaultId: VAULT_ID,
  depositorEthAddress: DEPOSITOR_ETH_ADDRESS,
  depositorBtcPubkey: DEPOSITOR_XONLY_PUBKEY,
  registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT,
  vaultProviderBtcPubkey: VAULT_PROVIDER_PUBKEY,
  vaultKeeperBtcPubkeys: [CHALLENGER_A],
  universalChallengerBtcPubkeys: [CHALLENGER_B],
  txGraphVersion: 3,
  proverCircuitVersion: 7,
  vaultCoreVersion: 3,
  claimableEventBlockNumber: 10_985_680n,
  peginVaultOutputValueSats: VAULT_UTXO_SATS,
  protocolFeeRate: PROTOCOL_FEE_RATE,
  councilSize: COUNCIL_SIZE,
  timelockPegin: TIMELOCK_PEGIN,
  timelockAssert: TIMELOCK_ASSERT,
};

/** The Assert connector is worth the same on both sides, so it cancels: fee = PegIn:0 - payout output. */
function checkWithFee(feeSats: number, over: PayoutOverrides = {}) {
  const fx = buildDelegatedClaimFixture(undefined, {
    payoutValueSats: VAULT_UTXO_SATS - feeSats,
    ...over,
  });
  return assertPayoutFeeAndTimelocks({
    payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
    payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
    assertPsbtBase64: fx.assertPsbt,
    vault,
  });
}

describe("assertPayoutFeeAndTimelocks", () => {
  let floorSats: number;
  beforeAll(async () => {
    await initializeWasmForTests();
    floorSats = Number(
      await computePayoutFeeFloor(
        vault.vaultCoreVersion,
        vault.vaultKeeperBtcPubkeys.length,
        vault.universalChallengerBtcPubkeys.length,
        vault.vaultKeeperBtcPubkeys.length,
        COUNCIL_SIZE,
        PAYOUT_SCRIPT_LEN,
        undefined,
        PROTOCOL_FEE_RATE,
      ),
    );
  });

  it("accepts a Payout whose implicit fee is exactly the WASM floor", async () => {
    await expect(checkWithFee(floorSats)).resolves.toBeUndefined();
  });

  it("refuses a Payout whose implicit fee is one sat below the floor", async () => {
    await expect(checkWithFee(floorSats - 1)).rejects.toThrow(
      /is below the floor of/,
    );
  });

  it("refuses a Payout whose implicit fee is one sat above the safety cap", async () => {
    await expect(checkWithFee(CEILING_SATS + 1)).rejects.toThrow(
      /exceeds the safety cap/,
    );
  });

  it("refuses a Payout whose input 0 sequence is not the PegIn CSV timelock", async () => {
    await expect(
      checkWithFee(floorSats, { peginInputSequence: TIMELOCK_PEGIN + 1 }),
    ).rejects.toThrow(
      `Payout input 0 sequence ${TIMELOCK_PEGIN + 1} must equal the PegIn CSV timelock ${TIMELOCK_PEGIN}`,
    );
  });

  it("refuses a Payout whose input 1 sequence is not the Assert CSV timelock", async () => {
    await expect(
      checkWithFee(floorSats, { assertInputSequence: TIMELOCK_ASSERT - 1 }),
    ).rejects.toThrow(
      `Payout input 1 sequence ${TIMELOCK_ASSERT - 1} must equal the Assert CSV timelock ${TIMELOCK_ASSERT}`,
    );
  });

  it("refuses a Payout whose input 0 declares a prevout worth more than the Vault UTXO", async () => {
    const fx = buildDelegatedClaimFixture(undefined, {
      payoutValueSats: VAULT_UTXO_SATS - floorSats,
    });
    const overstated = Psbt.fromBase64(fx.payoutClaimerPsbt);
    overstated.data.inputs[0].witnessUtxo = {
      script: Buffer.from(REGISTERED_PAYOUT_SCRIPT, "hex"),
      value: VAULT_UTXO_SATS + 1,
    };

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: overstated.toBase64(),
        payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(
      `Claimer Payout input 0 declares a prevout of ${VAULT_UTXO_SATS + 1} sats but the vault's PegIn output 0 is worth ${VAULT_UTXO_SATS}`,
    );
  });

  it("refuses a Payout whose input 0 declares no prevout at all", async () => {
    const fx = buildDelegatedClaimFixture(undefined, {
      payoutValueSats: VAULT_UTXO_SATS - floorSats,
    });
    const noWitnessUtxo = Psbt.fromBase64(fx.payoutClaimerPsbt);
    delete noWitnessUtxo.data.inputs[0].witnessUtxo;

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: noWitnessUtxo.toBase64(),
        payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(/Claimer Payout input 0 carries no witnessUtxo/);
  });

  it("refuses a depositor Payout whose input 0 declares a prevout worth more than the Vault UTXO", async () => {
    const fx = buildDelegatedClaimFixture(undefined, {
      payoutValueSats: VAULT_UTXO_SATS - floorSats,
    });
    const overstated = Psbt.fromBase64(fx.payoutDepositorPsbt);
    overstated.data.inputs[0].witnessUtxo = {
      script: Buffer.from(REGISTERED_PAYOUT_SCRIPT, "hex"),
      value: VAULT_UTXO_SATS + 1,
    };

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
        payoutDepositorPsbtBase64: overstated.toBase64(),
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(
      `Depositor Payout input 0 declares a prevout of ${VAULT_UTXO_SATS + 1} sats but the vault's PegIn output 0 is worth ${VAULT_UTXO_SATS}`,
    );
  });

  it("refuses a depositor Payout whose input 1 declares a prevout that is not the Assert's output 0", async () => {
    const fx = buildDelegatedClaimFixture(undefined, {
      payoutValueSats: VAULT_UTXO_SATS - floorSats,
    });
    const assertOutputSats = Psbt.fromBase64(fx.assertPsbt).txOutputs[0].value;
    const misstated = Psbt.fromBase64(fx.payoutDepositorPsbt);
    misstated.data.inputs[1].witnessUtxo = {
      script: Buffer.from(REGISTERED_PAYOUT_SCRIPT, "hex"),
      value: assertOutputSats + 1,
    };

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
        payoutDepositorPsbtBase64: misstated.toBase64(),
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(
      `Depositor Payout input 1 declares a prevout of ${assertOutputSats + 1} sats but the Assert's output 0 is worth ${assertOutputSats}`,
    );
  });

  it("refuses a claimer Payout whose input 1 declares a prevout that is not the Assert's output 0", async () => {
    const fx = buildDelegatedClaimFixture(undefined, {
      payoutValueSats: VAULT_UTXO_SATS - floorSats,
    });
    const assertOutputSats = Psbt.fromBase64(fx.assertPsbt).txOutputs[0].value;
    const misstated = Psbt.fromBase64(fx.payoutClaimerPsbt);
    misstated.data.inputs[1].witnessUtxo = {
      script: Buffer.from(REGISTERED_PAYOUT_SCRIPT, "hex"),
      value: assertOutputSats + 1,
    };

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: misstated.toBase64(),
        payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(
      `Claimer Payout input 1 declares a prevout of ${assertOutputSats + 1} sats but the Assert's output 0 is worth ${assertOutputSats}`,
    );
  });

  it("refuses a claimer Payout whose input 1 declares no prevout at all", async () => {
    const fx = buildDelegatedClaimFixture(undefined, {
      payoutValueSats: VAULT_UTXO_SATS - floorSats,
    });
    const noWitnessUtxo = Psbt.fromBase64(fx.payoutClaimerPsbt);
    delete noWitnessUtxo.data.inputs[1].witnessUtxo;

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: noWitnessUtxo.toBase64(),
        payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(/Claimer Payout input 1 carries no witnessUtxo/);
  });

  it("refuses a depositor Payout that is not the same transaction as the claimer's", async () => {
    const fx = buildDelegatedClaimFixture(undefined, {
      payoutValueSats: VAULT_UTXO_SATS - floorSats,
    });
    // The same set rebuilt with one input sequence changed, so only the
    // depositor PSBT's unsigned transaction differs from the claimer's.
    const divergent = buildDelegatedClaimFixture(undefined, {
      payoutValueSats: VAULT_UTXO_SATS - floorSats,
      peginInputSequence: TIMELOCK_PEGIN + 1,
    });

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
        payoutDepositorPsbtBase64: divergent.payoutDepositorPsbt,
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(/describe different transactions/);
  });

  it("refuses a Payout whose outputs exceed its inputs", async () => {
    const fx = buildDelegatedClaimFixture(undefined, {
      payoutValueSats: VAULT_UTXO_SATS + 1,
    });

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
        payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(/exceed inputs/);
  });

  it("refuses a Payout PSBT that cannot be parsed", async () => {
    const fx = buildDelegatedClaimFixture();

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: Buffer.from("not a psbt", "utf8").toString(
          "base64",
        ),
        payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(/Claimer Payout PSBT cannot be parsed/);
  });

  it("refuses an Assert PSBT that cannot be parsed", async () => {
    const fx = buildDelegatedClaimFixture();

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
        payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
        assertPsbtBase64: Buffer.from("not a psbt", "utf8").toString("base64"),
        vault,
      }),
    ).rejects.toThrow(/Assert PSBT cannot be parsed/);
  });

  it("refuses an Assert with no output 0, whose value the fee is measured against", async () => {
    const fx = buildDelegatedClaimFixture();
    const noOutputs = new Psbt();
    noOutputs.setVersion(2);
    noOutputs.addInput({
      hash: Psbt.fromBase64(fx.assertPsbt).txInputs[0].hash,
      index: 0,
    });

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
        payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
        assertPsbtBase64: noOutputs.toBase64(),
        vault,
      }),
    ).rejects.toThrow(/Assert transaction has no output 0/);
  });

  it("refuses a Payout carrying a third output beside the destination and the anchor", async () => {
    const fx = buildDelegatedClaimFixture();
    const extraOutput = {
      script: Buffer.from(REGISTERED_PAYOUT_SCRIPT, "hex"),
      value: 1,
    };
    // Both PSBTs describe one transaction, so the third output is on both.
    const threeOutputs = Psbt.fromBase64(fx.payoutClaimerPsbt);
    threeOutputs.addOutput(extraOutput);
    const threeOutputsDepositor = Psbt.fromBase64(fx.payoutDepositorPsbt);
    threeOutputsDepositor.addOutput(extraOutput);

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: threeOutputs.toBase64(),
        payoutDepositorPsbtBase64: threeOutputsDepositor.toBase64(),
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(/has 3 output\(s\), expected exactly 2/);
  });

  it("refuses a Payout that spends only the Vault UTXO", async () => {
    const fx = buildDelegatedClaimFixture();
    const oneInput = new Psbt();
    oneInput.setVersion(2);
    oneInput.addInput({
      hash: Psbt.fromBase64(fx.payoutClaimerPsbt).txInputs[0].hash,
      index: 0,
      sequence: TIMELOCK_PEGIN,
    });
    oneInput.addOutput({
      script: Buffer.from(REGISTERED_PAYOUT_SCRIPT, "hex"),
      value: VAULT_UTXO_SATS - floorSats,
    });

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutClaimerPsbtBase64: oneInput.toBase64(),
        // The same one-input transaction, so the input count is what refuses.
        payoutDepositorPsbtBase64: oneInput.toBase64(),
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(/must have exactly 2 inputs, got 1/);
  });
});
