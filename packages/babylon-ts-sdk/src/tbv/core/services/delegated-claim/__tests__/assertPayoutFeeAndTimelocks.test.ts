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
    payoutPsbtBase64: fx.payoutClaimerPsbt,
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

  it("refuses a Payout whose outputs exceed its inputs", async () => {
    const fx = buildDelegatedClaimFixture(undefined, {
      payoutValueSats: VAULT_UTXO_SATS + 1,
    });

    await expect(
      assertPayoutFeeAndTimelocks({
        payoutPsbtBase64: fx.payoutClaimerPsbt,
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(/exceed inputs/);
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
        payoutPsbtBase64: oneInput.toBase64(),
        assertPsbtBase64: fx.assertPsbt,
        vault,
      }),
    ).rejects.toThrow(/must have exactly 2 inputs, got 1/);
  });
});
