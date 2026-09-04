/**
 * Orchestration of the one signing session that authorizes a delegated claim.
 *
 * The signatures are collected months before they are used and cannot be
 * re-collected, so what matters here is that every signature ends up attached
 * to the transaction, challenger, and garbled-circuit index it was computed
 * for, and that the batch is a single wallet interaction.
 */

import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import { assembleWatchtowerArtifacts } from "../assembleWatchtowerArtifacts";

const wasm = vi.hoisted(() => ({
  buildClaimPsbt: vi.fn(),
  buildAssertClaimerPsbt: vi.fn(),
  buildPayoutClaimerPsbt: vi.fn(),
  buildPayoutDepositorPsbt: vi.fn(),
  buildWronglyChallengedPsbts: vi.fn(),
  extractDepositorPayoutSig: vi.fn(),
  extractTapScriptSig: vi.fn(),
  finalizeClaimTx: vi.fn(),
  buildWatchtowerArtifacts: vi.fn(),
}));

vi.mock("../../../wasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../wasm")>()),
  ...wasm,
}));

const CHALLENGER_A = "aa".repeat(32);
const CHALLENGER_B = "bb".repeat(32);
const VAULT_ID = `0x${"cd".repeat(32)}` as Hex;
const DEPOSITOR_PUBKEY = "02".concat("11".repeat(32));

/**
 * PSBTs are opaque to this service, so the fixtures encode their own identity:
 * each signature comes back as `sig:<the psbt it was extracted from>`, which
 * is what lets the assertions below prove nothing was reordered.
 */
function stubPsbtPipeline(): void {
  wasm.buildClaimPsbt.mockResolvedValue(toBase64("psbt-claim"));
  wasm.buildAssertClaimerPsbt.mockResolvedValue(toBase64("psbt-assert"));
  wasm.buildPayoutClaimerPsbt.mockResolvedValue(toBase64("psbt-payout"));
  wasm.buildPayoutDepositorPsbt.mockResolvedValue(
    toBase64("psbt-payout-depositor"),
  );
  wasm.buildWronglyChallengedPsbts.mockResolvedValue({
    [CHALLENGER_A]: [toBase64("psbt-wc-a0"), toBase64("psbt-wc-a1")],
    [CHALLENGER_B]: [toBase64("psbt-wc-b0")],
  });
  wasm.extractTapScriptSig.mockImplementation((psbtBase64: string) =>
    Promise.resolve(`sig:${fromBase64(psbtBase64)}`),
  );
  wasm.finalizeClaimTx.mockResolvedValue("signed-claim-tx-hex");
  wasm.buildWatchtowerArtifacts.mockResolvedValue("{}");
}

/** A wallet that signs a batch and returns the PSBTs unchanged, in order. */
function makeWallet(): BitcoinWallet {
  return {
    signPsbt: vi.fn(),
    signPsbts: vi.fn((psbtHexes: string[]) => Promise.resolve(psbtHexes)),
  } as unknown as BitcoinWallet;
}

function toBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function fromBase64(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

async function assemble(wallet: BitcoinWallet): Promise<void> {
  await assembleWatchtowerArtifacts({
    btcWallet: wallet,
    depositorPublicKey: DEPOSITOR_PUBKEY,
    source: { txGraphJson: "{graph}", verifyingKeyHex: "beef" },
    vault: {
      vaultId: VAULT_ID,
      txGraphVersion: 3,
      proverCircuitVersion: 7,
      claimableEventBlockNumber: 10_985_680n,
    },
  });
}

describe("assembleWatchtowerArtifacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubPsbtPipeline();
    wasm.extractDepositorPayoutSig.mockResolvedValue("presigned-payout-sig");
  });

  it("collects every signature in one wallet interaction", async () => {
    const wallet = makeWallet();

    await assemble(wallet);

    expect(wallet.signPsbts).toHaveBeenCalledTimes(1);
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("keeps each WronglyChallenged signature with its challenger and GC index", async () => {
    await assemble(makeWallet());

    expect(
      wasm.buildWatchtowerArtifacts.mock.calls[0][0].wronglyChallengedSigs,
    ).toEqual({
      [CHALLENGER_A]: ["sig:psbt-wc-a0", "sig:psbt-wc-a1"],
      [CHALLENGER_B]: ["sig:psbt-wc-b0"],
    });
  });

  it("routes the claim, assert and payout signatures to their own fields", async () => {
    await assemble(makeWallet());

    const inputs = wasm.buildWatchtowerArtifacts.mock.calls[0][0];
    expect(inputs.assertClaimerSigHex).toBe("sig:psbt-assert");
    expect(inputs.payoutClaimerSigHex).toBe("sig:psbt-payout");
    expect(wasm.finalizeClaimTx).toHaveBeenCalledWith(
      3,
      "{graph}",
      "sig:psbt-claim",
    );
    expect(inputs.signedClaimTxHex).toBe("signed-claim-tx-hex");
  });

  it("signs the Payout claimer input at index 1, not index 0", async () => {
    await assemble(makeWallet());

    const payoutCall = wasm.extractTapScriptSig.mock.calls.find(
      ([psbtBase64]) => fromBase64(psbtBase64 as string) === "psbt-payout",
    );
    expect(payoutCall?.[1]).toBe(1);
  });

  it("reuses the graph's presigned depositor Payout signature when it carries one", async () => {
    const wallet = makeWallet();

    await assemble(wallet);

    expect(wasm.buildPayoutDepositorPsbt).not.toHaveBeenCalled();
    expect(
      wasm.buildWatchtowerArtifacts.mock.calls[0][0].depositorPayoutSigHex,
    ).toBe("presigned-payout-sig");
  });

  it("signs a fresh depositor Payout signature in the same batch when the graph carries none", async () => {
    wasm.extractDepositorPayoutSig.mockRejectedValue(
      new Error("missing signature"),
    );
    const wallet = makeWallet();

    await assemble(wallet);

    expect(wallet.signPsbts).toHaveBeenCalledTimes(1);
    expect(
      wasm.buildWatchtowerArtifacts.mock.calls[0][0].depositorPayoutSigHex,
    ).toBe("sig:psbt-payout-depositor");
  });

  it("carries the vault's on-chain facts into the artifacts", async () => {
    await assemble(makeWallet());

    const inputs = wasm.buildWatchtowerArtifacts.mock.calls[0][0];
    expect(inputs.vaultIdHex).toBe(VAULT_ID);
    expect(inputs.proverCircuitVersion).toBe(7);
    expect(inputs.claimableEventBlockNumber).toBe(10_985_680n);
    expect(inputs.verifyingKeyHex).toBe("beef");
  });
});
