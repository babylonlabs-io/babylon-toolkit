/**
 * Orchestration of the one signing session that authorizes a delegated claim.
 *
 * The signatures are collected months before they are used and cannot be
 * re-collected, so what matters here is that every signature ends up attached
 * to the transaction, challenger, and garbled-circuit index it was computed
 * for, and that the batch is a single wallet interaction.
 */

import type { Hex } from "viem";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import { assembleWatchtowerArtifacts } from "../assembleWatchtowerArtifacts";

const wasm = vi.hoisted(() => ({
  buildClaimPsbt: vi.fn(),
  buildAssertClaimerPsbt: vi.fn(),
  buildPayoutClaimerPsbt: vi.fn(),
  buildPayoutDepositorPsbt: vi.fn(),
  buildWronglyChallengedPsbts: vi.fn(),
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
const SIGNER_ADDRESS = "tb1psigneraddressfortests";

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
    getAddress: vi.fn(() => Promise.resolve(SIGNER_ADDRESS)),
    getPublicKeyHex: vi.fn(() => Promise.resolve(DEPOSITOR_PUBKEY)),
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
      vaultCoreVersion: 3,
      claimableEventBlockNumber: 10_985_680n,
    },
  });
}

describe("assembleWatchtowerArtifacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubPsbtPipeline();
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

  it("always signs a fresh depositor Payout signature in the same batch", async () => {
    const wallet = makeWallet();

    await assemble(wallet);

    // The builder no longer reads a presigned signature off the graph, so the
    // PSBT must ride in the one batch — not a second prompt months later.
    expect(wasm.buildPayoutDepositorPsbt).toHaveBeenCalledTimes(1);
    expect(wallet.signPsbts).toHaveBeenCalledTimes(1);
    expect(
      wasm.buildWatchtowerArtifacts.mock.calls[0][0].depositorPayoutSigHex,
    ).toBe("sig:psbt-payout-depositor");
  });

  it("asks the wallet for the script-path flags every signature depends on", async () => {
    const wallet = makeWallet();

    await assemble(wallet);

    const options = (wallet.signPsbts as unknown as Mock).mock.calls[0][1];
    expect(options).toHaveLength(4 + 3);
    for (const option of options) {
      // autoFinalized would strip the tapScriptSig these signatures are
      // extracted from; useTweakedSigner would sign with the tweaked key and
      // produce a signature no script path accepts.
      expect(option.autoFinalized).toBe(false);
      expect(option.signInputs).toHaveLength(1);
      expect(option.signInputs[0].useTweakedSigner).toBe(false);
      expect(option.signInputs[0].address).toBe(SIGNER_ADDRESS);
    }
    // The claimer Payout signs its Assert connector at input 1; every other
    // PSBT signs input 0. A wrong index yields a signature for the wrong
    // sighash, which only surfaces at claim time.
    expect(options.map((o: { signInputs: { index: number }[] }) => o.signInputs[0].index)).toEqual([
      0, 0, 1, 0, 0, 0, 0,
    ]);
  });

  it("refuses to prompt when the wallet is on another account", async () => {
    const wallet = makeWallet();
    (wallet.getPublicKeyHex as unknown as Mock).mockResolvedValue(
      "02".concat("99".repeat(32)),
    );

    await expect(assemble(wallet)).rejects.toThrow(
      /does not hold the vault's depositor key/,
    );
    expect(wallet.signPsbts).not.toHaveBeenCalled();
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
