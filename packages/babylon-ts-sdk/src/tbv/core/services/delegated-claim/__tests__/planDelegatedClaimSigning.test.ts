import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssertBindingError } from "../assertBinding";
import { planDelegatedClaimSigning } from "../planDelegatedClaimSigning";
import { copyAssertConnectorLeaf } from "../payoutInputLeaf";
import {
  CHALLENGER_A,
  CHALLENGER_B,
  DEPOSITOR_ETH_ADDRESS,
  DEPOSITOR_PUBKEY,
  REGISTERED_PAYOUT_SCRIPT,
  TIMELOCK_ASSERT,
  TIMELOCK_PEGIN,
  VAULT_ID,
  VAULT_PROVIDER_PUBKEY,
  VAULT_UTXO_SATS,
  buildDelegatedClaimFixture,
} from "./fixtures/delegatedClaimPsbts";

const wasm = vi.hoisted(() => ({
  buildClaimPsbt: vi.fn(),
  buildAssertClaimerPsbt: vi.fn(),
  buildPayoutClaimerPsbt: vi.fn(),
  buildPayoutDepositorPsbt: vi.fn(),
  buildWronglyChallengedPsbts: vi.fn(),
  computePayoutFeeFloor: vi.fn(),
}));
vi.mock("../../../wasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../wasm")>()),
  ...wasm,
}));

const fx = buildDelegatedClaimFixture();
const MOCKED_FEE_FLOOR = 800n;
/** The fixture's 1_000 sat implicit fee sits inside [800, 2 x 610] for 1 keeper + 1 challenger. */
const PROTOCOL_FEE_RATE = 2n;

function params() {
  return {
    depositorPublicKey: DEPOSITOR_PUBKEY,
    btcNetwork: "testnet" as const,
    source: { txGraphJson: "{graph}", verifyingKeyHex: "beef" },
    vault: {
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
      councilSize: 3,
      timelockPegin: TIMELOCK_PEGIN,
      timelockAssert: TIMELOCK_ASSERT,
    },
  };
}

describe("planDelegatedClaimSigning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wasm.buildClaimPsbt.mockResolvedValue(fx.claimPsbt);
    wasm.buildAssertClaimerPsbt.mockResolvedValue(fx.assertPsbt);
    wasm.buildPayoutClaimerPsbt.mockResolvedValue(fx.payoutClaimerPsbt);
    wasm.buildPayoutDepositorPsbt.mockResolvedValue(fx.payoutDepositorPsbt);
    wasm.buildWronglyChallengedPsbts.mockResolvedValue(fx.wronglyChallengedPsbts);
    // The band itself is covered by assertPayoutFeeBand.test.ts and assertPayoutFeeAndTimelocks.test.ts.
    wasm.computePayoutFeeFloor.mockResolvedValue(MOCKED_FEE_FLOOR);
  });

  it("returns the ordered requests with the depositor Payout carrying the Assert-connector leaf", async () => {
    const plan = await planDelegatedClaimSigning(params());

    expect(plan.requests.map((r) => r.id)).toEqual([
      "claim", "assert", "payoutClaimer", "payoutDepositor",
      `wronglyChallenged:${CHALLENGER_A}:0`, `wronglyChallenged:${CHALLENGER_A}:1`, `wronglyChallenged:${CHALLENGER_B}:0`,
    ]);
    expect(plan.requests[3].psbtBase64).toBe(
      copyAssertConnectorLeaf({ payoutDepositorPsbtBase64: fx.payoutDepositorPsbt, payoutClaimerPsbtBase64: fx.payoutClaimerPsbt }),
    );
    expect(plan.vault).toEqual(params().vault);
  });

  it("refuses a graph whose Payout input 1 spends a different Assert", async () => {
    const psbt = Psbt.fromBase64(fx.payoutClaimerPsbt);
    (psbt.data.globalMap.unsignedTx as unknown as { tx: { ins: { hash: Buffer }[] } }).tx.ins[1].hash = Buffer.from("ee".repeat(32), "hex");
    wasm.buildPayoutClaimerPsbt.mockResolvedValue(psbt.toBase64());
    // Keep the depositor PSBT the same tx so only the binding check trips.
    wasm.buildPayoutDepositorPsbt.mockResolvedValue(psbt.toBase64());

    await expect(planDelegatedClaimSigning(params())).rejects.toThrow(AssertBindingError);
  });
});
