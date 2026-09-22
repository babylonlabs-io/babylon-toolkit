import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertScriptPathSchnorrSignature } from "../../../primitives/psbt/verifyScriptPathSchnorrSignature";
import {
  SigningPlanMismatchError,
  assembleWatchtowerArtifactsFromSignatures,
} from "../assembleWatchtowerArtifactsFromSignatures";
import { planDelegatedClaimSigning } from "../planDelegatedClaimSigning";
import {
  CHALLENGER_A,
  CHALLENGER_B,
  DEPOSITOR_ETH_ADDRESS,
  DEPOSITOR_PUBKEY,
  DEPOSITOR_XONLY_PUBKEY,
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
  finalizeClaimTx: vi.fn(),
  buildWatchtowerArtifacts: vi.fn(),
}));
vi.mock("../../../wasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../wasm")>()),
  ...wasm,
}));
// The signatures below are routing labels, not signatures, so the verifier
// is stubbed; realSchnorrVerification.test.ts runs the real one.
vi.mock("../../../primitives/psbt/verifyScriptPathSchnorrSignature", () => ({
  assertScriptPathSchnorrSignature: vi.fn(),
}));

const fx = buildDelegatedClaimFixture();
const MOCKED_FEE_FLOOR = 800n;
/** The fixture's 1_000 sat implicit fee sits inside [800, 2 x 610] for 1 keeper + 1 challenger. */
const PROTOCOL_FEE_RATE = 2n;
const vault = {
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
};
const source = { txGraphJson: "{graph}", verifyingKeyHex: "beef" };
/** The key from the vault-provers release; the vault provider serves the same. */
const TRUSTED_VERIFYING_KEY = "beef";

function signaturesFor(ids: string[]): Map<string, string> {
  return new Map(ids.map((id) => [id, `sig:${id}`]));
}

describe("assembleWatchtowerArtifactsFromSignatures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    wasm.buildClaimPsbt.mockResolvedValue(fx.claimPsbt);
    wasm.buildAssertClaimerPsbt.mockResolvedValue(fx.assertPsbt);
    wasm.buildPayoutClaimerPsbt.mockResolvedValue(fx.payoutClaimerPsbt);
    wasm.buildPayoutDepositorPsbt.mockResolvedValue(fx.payoutDepositorPsbt);
    wasm.buildWronglyChallengedPsbts.mockResolvedValue(
      fx.wronglyChallengedPsbts,
    );
    // The band itself is covered by assertPayoutFeeBand.test.ts and assertPayoutFeeAndTimelocks.test.ts.
    wasm.computePayoutFeeFloor.mockResolvedValue(MOCKED_FEE_FLOOR);
    wasm.finalizeClaimTx.mockResolvedValue("signed-claim-tx-hex");
    wasm.buildWatchtowerArtifacts.mockResolvedValue("{artifacts}");
  });

  it("routes every signature to its field and returns the artifacts", async () => {
    const plan = await planDelegatedClaimSigning({
      depositorPublicKey: DEPOSITOR_PUBKEY,
      btcNetwork: "testnet",
      source,
      trustedVerifyingKeyHex: TRUSTED_VERIFYING_KEY,
      vault,
    });
    const out = await assembleWatchtowerArtifactsFromSignatures({
      plan,
      signatures: signaturesFor(plan.requests.map((r) => r.id)),
    });

    expect(out).toBe("{artifacts}");
    expect(wasm.finalizeClaimTx).toHaveBeenCalledWith(
      3,
      "{graph}",
      "sig:claim",
    );
    expect(wasm.buildWatchtowerArtifacts.mock.calls[0][0]).toMatchObject({
      assertClaimerSigHex: "sig:assert",
      payoutClaimerSigHex: "sig:payoutClaimer",
      depositorPayoutSigHex: "sig:payoutDepositor",
      wronglyChallengedSigs: {
        [CHALLENGER_A]: [
          `sig:wronglyChallenged:${CHALLENGER_A}:0`,
          `sig:wronglyChallenged:${CHALLENGER_A}:1`,
        ],
        [CHALLENGER_B]: [`sig:wronglyChallenged:${CHALLENGER_B}:0`],
      },
      signedClaimTxHex: "signed-claim-tx-hex",
      vaultIdHex: VAULT_ID,
      expectedVaultCoreVersion: 3,
    });
  });

  it("rejects a signature that does not verify against its rebuilt request before finalizing", async () => {
    const plan = await planDelegatedClaimSigning({
      depositorPublicKey: DEPOSITOR_PUBKEY,
      btcNetwork: "testnet",
      source,
      trustedVerifyingKeyHex: TRUSTED_VERIFYING_KEY,
      vault,
    });
    (assertScriptPathSchnorrSignature as unknown as Mock).mockImplementation(
      ({ signatureHex }: { signatureHex: string }) => {
        if (signatureHex === "sig:claim")
          throw new Error("signature does not verify");
      },
    );

    await expect(
      assembleWatchtowerArtifactsFromSignatures({
        plan,
        signatures: signaturesFor(plan.requests.map((r) => r.id)),
      }),
    ).rejects.toThrow(/does not verify/);
    expect(assertScriptPathSchnorrSignature).toHaveBeenCalledWith({
      requestedPsbtHex: Buffer.from(fx.claimPsbt, "base64").toString("hex"),
      signatureHex: "sig:claim",
      signerXOnlyPubkeyHex: DEPOSITOR_PUBKEY.slice(2),
      inputIndex: 0,
    });
    expect(wasm.finalizeClaimTx).not.toHaveBeenCalled();
    expect(wasm.buildWatchtowerArtifacts).not.toHaveBeenCalled();
  });

  it("refuses a plan whose PSBTs no longer match what the graph builds", async () => {
    const plan = await planDelegatedClaimSigning({
      depositorPublicKey: DEPOSITOR_PUBKEY,
      btcNetwork: "testnet",
      source,
      trustedVerifyingKeyHex: TRUSTED_VERIFYING_KEY,
      vault,
    });
    const tampered = {
      ...plan,
      requests: plan.requests.map((r) =>
        r.id === "assert" ? { ...r, psbtBase64: fx.claimPsbt } : r,
      ),
    };

    await expect(
      assembleWatchtowerArtifactsFromSignatures({
        plan: tampered,
        signatures: signaturesFor(plan.requests.map((r) => r.id)),
      }),
    ).rejects.toThrow(SigningPlanMismatchError);
    expect(wasm.buildWatchtowerArtifacts).not.toHaveBeenCalled();
  });

  it("names the request and field that differ from the rebuilt set", async () => {
    const plan = await planDelegatedClaimSigning({
      depositorPublicKey: DEPOSITOR_PUBKEY,
      btcNetwork: "testnet",
      source,
      trustedVerifyingKeyHex: TRUSTED_VERIFYING_KEY,
      vault,
    });
    const tampered = {
      ...plan,
      requests: plan.requests.map((r) =>
        r.id === "payoutClaimer" ? { ...r, inputIndex: 0 } : r,
      ),
    };

    await expect(
      assembleWatchtowerArtifactsFromSignatures({
        plan: tampered,
        signatures: signaturesFor(plan.requests.map((r) => r.id)),
      }),
    ).rejects.toThrow(/"payoutClaimer".*inputIndex/);
    expect(wasm.finalizeClaimTx).not.toHaveBeenCalled();
  });

  it("rejects a plan whose requests are reordered", async () => {
    const plan = await planDelegatedClaimSigning({
      depositorPublicKey: DEPOSITOR_PUBKEY,
      btcNetwork: "testnet",
      source,
      trustedVerifyingKeyHex: TRUSTED_VERIFYING_KEY,
      vault,
    });
    const [claim, assert, ...rest] = plan.requests;
    const tampered = { ...plan, requests: [assert, claim, ...rest] };

    await expect(
      assembleWatchtowerArtifactsFromSignatures({
        plan: tampered,
        signatures: signaturesFor(plan.requests.map((r) => r.id)),
      }),
    ).rejects.toThrow(/position 0 is "assert" but the graph builds "claim"/);
    expect(wasm.finalizeClaimTx).not.toHaveBeenCalled();
  });

  it("rejects a plan whose request kind was altered", async () => {
    const plan = await planDelegatedClaimSigning({
      depositorPublicKey: DEPOSITOR_PUBKEY,
      btcNetwork: "testnet",
      source,
      trustedVerifyingKeyHex: TRUSTED_VERIFYING_KEY,
      vault,
    });
    const tampered = {
      ...plan,
      requests: plan.requests.map((r) =>
        r.id === "assert" ? { ...r, kind: "claim" as const } : r,
      ),
    };

    await expect(
      assembleWatchtowerArtifactsFromSignatures({
        plan: tampered,
        signatures: signaturesFor(plan.requests.map((r) => r.id)),
      }),
    ).rejects.toThrow(/"assert" has kind "claim"/);
    expect(wasm.finalizeClaimTx).not.toHaveBeenCalled();
  });

  it("refuses a plan with a request the graph does not build", async () => {
    const plan = await planDelegatedClaimSigning({
      depositorPublicKey: DEPOSITOR_PUBKEY,
      btcNetwork: "testnet",
      source,
      trustedVerifyingKeyHex: TRUSTED_VERIFYING_KEY,
      vault,
    });
    const tampered = {
      ...plan,
      requests: [...plan.requests, { ...plan.requests[0], id: "claim-again" }],
    };
    const sigs = signaturesFor(tampered.requests.map((r) => r.id));

    await expect(
      assembleWatchtowerArtifactsFromSignatures({
        plan: tampered,
        signatures: sigs,
      }),
    ).rejects.toThrow(/8 requests.*builds 7/);
    expect(wasm.finalizeClaimTx).not.toHaveBeenCalled();
  });

  it("refuses an incomplete signature set", async () => {
    const plan = await planDelegatedClaimSigning({
      depositorPublicKey: DEPOSITOR_PUBKEY,
      btcNetwork: "testnet",
      source,
      trustedVerifyingKeyHex: TRUSTED_VERIFYING_KEY,
      vault,
    });
    const sigs = signaturesFor(plan.requests.map((r) => r.id));
    sigs.delete(`wronglyChallenged:${CHALLENGER_B}:0`);

    await expect(
      assembleWatchtowerArtifactsFromSignatures({ plan, signatures: sigs }),
    ).rejects.toThrow(/wronglyChallenged:.*:0/);
    expect(wasm.finalizeClaimTx).not.toHaveBeenCalled();
  });

  it("refuses a plan whose vault-provider verifying key was altered after planning", async () => {
    const plan = await planDelegatedClaimSigning({
      depositorPublicKey: DEPOSITOR_PUBKEY,
      btcNetwork: "testnet",
      source,
      trustedVerifyingKeyHex: TRUSTED_VERIFYING_KEY,
      vault,
    });
    const tampered = {
      ...plan,
      source: { ...plan.source, verifyingKeyHex: "dead" },
    };

    await expect(
      assembleWatchtowerArtifactsFromSignatures({
        plan: tampered,
        signatures: signaturesFor(plan.requests.map((r) => r.id)),
      }),
    ).rejects.toThrow(
      /served Groth16 verifying key dead but the trusted key .* is beef/,
    );
    expect(wasm.buildWatchtowerArtifacts).not.toHaveBeenCalled();
  });

  it("writes the trusted verifying key into the artifacts as bare lowercase hex, not the vault provider's value", async () => {
    const plan = await planDelegatedClaimSigning({
      depositorPublicKey: DEPOSITOR_PUBKEY,
      btcNetwork: "testnet",
      source,
      trustedVerifyingKeyHex: "0xBEEF",
      vault,
    });

    await assembleWatchtowerArtifactsFromSignatures({
      plan,
      signatures: signaturesFor(plan.requests.map((r) => r.id)),
    });

    // btc-vault decodes the field with `hex::decode`, which rejects a `0x`
    // prefix (`delegated_claim.rs:569-571` @ ac4954e7).
    expect(wasm.buildWatchtowerArtifacts.mock.calls[0][0].verifyingKeyHex).toBe(
      "beef",
    );
  });

  it("refuses a signature set with an id the plan has no request for", async () => {
    const plan = await planDelegatedClaimSigning({
      depositorPublicKey: DEPOSITOR_PUBKEY,
      btcNetwork: "testnet",
      source,
      trustedVerifyingKeyHex: TRUSTED_VERIFYING_KEY,
      vault,
    });
    const sigs = signaturesFor(plan.requests.map((r) => r.id));
    sigs.set("stray", "sig:stray");

    await expect(
      assembleWatchtowerArtifactsFromSignatures({ plan, signatures: sigs }),
    ).rejects.toThrow(/"stray"/);
    expect(wasm.finalizeClaimTx).not.toHaveBeenCalled();
  });
});
