import { secp256k1 } from "@noble/curves/secp256k1.js";
import { Psbt, payments } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssertBindingError } from "../assertBinding";
import { copyAssertConnectorLeaf } from "../payoutInputLeaf";
import { planDelegatedClaimSigning } from "../planDelegatedClaimSigning";
import {
  CHALLENGER_A,
  CHALLENGER_B,
  DEPOSITOR_ETH_ADDRESS,
  DEPOSITOR_PUBKEY,
  DEPOSITOR_XONLY_PUBKEY,
  OTHER_BIP86_P2TR_SCRIPT,
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
    trustedVerifyingKeyHex: "beef",
    vault: {
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
    wasm.buildWronglyChallengedPsbts.mockResolvedValue(
      fx.wronglyChallengedPsbts,
    );
    // The band itself is covered by assertPayoutFeeBand.test.ts and assertPayoutFeeAndTimelocks.test.ts.
    wasm.computePayoutFeeFloor.mockResolvedValue(MOCKED_FEE_FLOOR);
  });

  it("returns the ordered requests with the depositor Payout carrying the Assert-connector leaf", async () => {
    const plan = await planDelegatedClaimSigning(params());

    expect(plan.requests.map((r) => r.id)).toEqual([
      "claim",
      "assert",
      "payoutClaimer",
      "payoutDepositor",
      `wronglyChallenged:${CHALLENGER_A}:0`,
      `wronglyChallenged:${CHALLENGER_A}:1`,
      `wronglyChallenged:${CHALLENGER_B}:0`,
    ]);
    expect(plan.requests[3].psbtBase64).toBe(
      copyAssertConnectorLeaf({
        payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
        payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
      }),
    );
    expect(plan.vault).toEqual(params().vault);
  });

  it("refuses a graph whose Payout input 0 sequence is not the stamped PegIn timelock", async () => {
    const wrongSequence = buildDelegatedClaimFixture(undefined, {
      peginInputSequence: TIMELOCK_PEGIN + 1,
    });
    wasm.buildPayoutClaimerPsbt.mockResolvedValue(
      wrongSequence.payoutClaimerPsbt,
    );
    wasm.buildPayoutDepositorPsbt.mockResolvedValue(
      wrongSequence.payoutDepositorPsbt,
    );

    await expect(planDelegatedClaimSigning(params())).rejects.toThrow(
      `Payout input 0 sequence ${TIMELOCK_PEGIN + 1} must equal the PegIn CSV timelock ${TIMELOCK_PEGIN}`,
    );
  });

  it("refuses a depositor Payout whose unsigned transaction is not the claimer's", async () => {
    // The leaf-copy step is the byte-equality guard that refuses at the
    // planner; the fee module's own guard is pinned by its unit test.
    wasm.buildPayoutDepositorPsbt.mockResolvedValue(
      buildDelegatedClaimFixture(undefined, {
        peginInputSequence: TIMELOCK_PEGIN + 1,
      }).payoutDepositorPsbt,
    );

    await expect(planDelegatedClaimSigning(params())).rejects.toThrow(
      /describe different transactions; the graph is inconsistent/,
    );
  });

  it("refuses a depositor Payout whose input 0 declares a prevout that is not the Vault UTXO", async () => {
    // The unsigned transaction is untouched, so the byte-equality guard passes
    // and the per-PSBT input map is what refuses.
    const overstated = Psbt.fromBase64(fx.payoutDepositorPsbt);
    overstated.data.inputs[0].witnessUtxo = {
      script: Buffer.from(REGISTERED_PAYOUT_SCRIPT, "hex"),
      value: VAULT_UTXO_SATS + 1,
    };
    wasm.buildPayoutDepositorPsbt.mockResolvedValue(overstated.toBase64());

    await expect(planDelegatedClaimSigning(params())).rejects.toThrow(
      /Depositor Payout input 0 declares a prevout/,
    );
  });

  it("refuses a depositor key that is not the vault's registered depositor key", async () => {
    // secp256k1's 2G: a valid x-only key that is not the fixture's depositor.
    const otherKey =
      "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

    await expect(
      planDelegatedClaimSigning({ ...params(), depositorPublicKey: otherKey }),
    ).rejects.toThrow(/not the vault's registered depositor key/);
    expect(wasm.buildClaimPsbt).not.toHaveBeenCalled();
    expect(wasm.buildPayoutClaimerPsbt).not.toHaveBeenCalled();
  });

  it("refuses a registered payout script that is not hex", async () => {
    const p = params();
    p.vault.registeredPayoutScriptPubKey = `${REGISTERED_PAYOUT_SCRIPT}zz`;

    await expect(planDelegatedClaimSigning(p)).rejects.toThrow(
      /failed the depositor-key derivation check: depositorPayoutScriptPubKey must be non-empty, even-length hex/,
    );
  });

  it("refuses a registered payout script that is P2TR of another key", async () => {
    const p = params();
    // Well-formed, so only the derivation from the depositor's own key
    // refuses it — the registered script otherwise rests on the node's log.
    p.vault.registeredPayoutScriptPubKey = OTHER_BIP86_P2TR_SCRIPT;

    await expect(planDelegatedClaimSigning(p)).rejects.toThrow(
      /failed the depositor-key derivation check/,
    );
    expect(wasm.buildClaimPsbt).not.toHaveBeenCalled();
    expect(wasm.buildPayoutClaimerPsbt).not.toHaveBeenCalled();
  });

  it("names the cause when a P2WPKH payout script is given only the x-only depositor key", async () => {
    const p = params();
    const p2wpkh = payments.p2wpkh({
      pubkey: Buffer.from(DEPOSITOR_PUBKEY, "hex"),
    });
    p.vault.registeredPayoutScriptPubKey = Buffer.from(
      p2wpkh.output as Uint8Array,
    ).toString("hex");
    p.depositorPublicKey = DEPOSITOR_XONLY_PUBKEY;

    await expect(planDelegatedClaimSigning(p)).rejects.toThrow(
      /failed the depositor-key derivation check: A P2WPKH payout requires a compressed BTC pubkey/,
    );
    expect(wasm.buildClaimPsbt).not.toHaveBeenCalled();
    expect(wasm.buildPayoutClaimerPsbt).not.toHaveBeenCalled();
  });

  it("refuses an uncompressed depositor key the signer cannot use", async () => {
    const p = params();
    p.depositorPublicKey =
      secp256k1.Point.fromHex(DEPOSITOR_PUBKEY).toHex(false);

    await expect(planDelegatedClaimSigning(p)).rejects.toThrow(
      /Public key must be 33-byte compressed or 32-byte x-only hex, got 65 bytes/,
    );
    expect(wasm.buildClaimPsbt).not.toHaveBeenCalled();
    expect(wasm.buildPayoutClaimerPsbt).not.toHaveBeenCalled();
  });

  it("refuses a vault on a graph version that has no delegated-claim path", async () => {
    const p = params();
    p.vault.vaultCoreVersion = 2;
    p.vault.txGraphVersion = 2;

    await expect(planDelegatedClaimSigning(p)).rejects.toThrow(
      "Graph version 2 is not the delegated-claim graph version 3; vaults on earlier graphs have no delegated-claim path.",
    );
    expect(wasm.buildClaimPsbt).not.toHaveBeenCalled();
    expect(wasm.buildPayoutClaimerPsbt).not.toHaveBeenCalled();
  });

  it("refuses a trusted verifying key that is not even-length hex", async () => {
    const p = params();
    p.trustedVerifyingKeyHex = "abc";

    await expect(planDelegatedClaimSigning(p)).rejects.toThrow(
      /trustedVerifyingKeyHex must be non-empty, even-length hex/,
    );
    expect(wasm.buildClaimPsbt).not.toHaveBeenCalled();
    expect(wasm.buildPayoutClaimerPsbt).not.toHaveBeenCalled();
  });

  it("refuses a Payout whose CPFP anchor is not the depositor's BIP-86 P2TR", async () => {
    const strangerAnchor = buildDelegatedClaimFixture(undefined, {
      anchorScriptHex: OTHER_BIP86_P2TR_SCRIPT,
    });
    wasm.buildPayoutClaimerPsbt.mockResolvedValue(
      strangerAnchor.payoutClaimerPsbt,
    );
    wasm.buildPayoutDepositorPsbt.mockResolvedValue(
      strangerAnchor.payoutDepositorPsbt,
    );

    await expect(planDelegatedClaimSigning(params())).rejects.toThrow(
      /Payout CPFP anchor pays .*, not the depositor's BIP-86 P2TR/,
    );
  });

  it("refuses a verifying key the vault provider substituted for the trusted one", async () => {
    const p = params();
    p.source = { ...p.source, verifyingKeyHex: "dead" };

    await expect(planDelegatedClaimSigning(p)).rejects.toThrow(
      /Vault provider served Groth16 verifying key dead but the trusted key for prover circuit version 7 is beef/,
    );
    expect(wasm.buildClaimPsbt).not.toHaveBeenCalled();
    expect(wasm.buildPayoutClaimerPsbt).not.toHaveBeenCalled();
  });

  it("accepts a trusted verifying key that differs only in prefix and case", async () => {
    const p = params();
    p.trustedVerifyingKeyHex = "0xBEEF";

    const plan = await planDelegatedClaimSigning(p);

    expect(plan.trustedVerifyingKeyHex).toBe("0xBEEF");
  });

  it("refuses a vault context whose vault core version is not the graph version", async () => {
    const p = params();
    p.vault.vaultCoreVersion = 2;

    await expect(planDelegatedClaimSigning(p)).rejects.toThrow(/one axis/);
    expect(wasm.buildClaimPsbt).not.toHaveBeenCalled();
    expect(wasm.buildPayoutClaimerPsbt).not.toHaveBeenCalled();
  });

  it("refuses a graph whose Payout input 1 spends a different Assert", async () => {
    const psbt = Psbt.fromBase64(fx.payoutClaimerPsbt);
    (
      psbt.data.globalMap.unsignedTx as unknown as {
        tx: { ins: { hash: Buffer }[] };
      }
    ).tx.ins[1].hash = Buffer.from("ee".repeat(32), "hex");
    wasm.buildPayoutClaimerPsbt.mockResolvedValue(psbt.toBase64());
    // Keep the depositor PSBT the same tx so only the binding check trips.
    wasm.buildPayoutDepositorPsbt.mockResolvedValue(psbt.toBase64());

    await expect(planDelegatedClaimSigning(params())).rejects.toThrow(
      AssertBindingError,
    );
  });
});
