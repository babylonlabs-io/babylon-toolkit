/**
 * Orchestration of the one signing session that authorizes a delegated claim.
 *
 * The signatures are collected months before they are used and cannot be
 * re-collected, so what matters here is that every signature ends up attached
 * to the transaction, challenger, and garbled-circuit index it was computed
 * for, and that the batch is a single wallet interaction.
 *
 * Every wasm call is mocked, so nothing here says anything about the bytes
 * the file ends up carrying. That guarantee lives in btc-vault#2655's
 * `crates/vault/src/delegated_claim/artifacts.rs` round-trip test, which is
 * where an `artifacts.json` format change has to be caught.
 */

import type { Hex } from "viem";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import { assembleWatchtowerArtifacts } from "../assembleWatchtowerArtifacts";
import { ChallengerSetMismatchError } from "../challengerBinding";
import { PayoutDestinationError } from "../payoutBinding";
import { VaultIdBindingError } from "../vaultIdBinding";

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

// The vault's on-chain sets: keeper A is the local challenger for a
// depositor-as-claimer graph, B is universal.
const CHALLENGER_A = "aa".repeat(32);
const CHALLENGER_B = "bb".repeat(32);
const VAULT_PROVIDER_PUBKEY = "02".concat("77".repeat(32));

// The secp256k1 generator point, so the P2TR address below really derives
// from this key — the signer check would reject a made-up one.
const DEPOSITOR_PUBKEY =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const SIGNER_ADDRESS =
  "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2";
const OTHER_ADDRESS =
  "tb1pet7ep3czdu9k4wvdlz2fp5p8x2yp7t6ttyqg2c6cmh0lgeuu9lasvfnc28";

const DEPOSITOR_ETH_ADDRESS =
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Hex;
// A Claim PSBT whose only input spends the PegIn below, and the vault id
// that PegIn txid derives with the depositor address above. The txid is
// non-palindromic, so the byte-order flip in the binding is load-bearing.
const CLAIM_PSBT =
  "cHNidP8BADMCAAAAAf/u3cy7qpmId2ZVRDMiEQD/7t3Mu6qZiHdmVUQzIhEAAQAAAAD/////AAAAAAAAAAA=";
const VAULT_ID =
  "0xf5c2a4e499a96ee2a2e32acf1f16b51d2958e7819a1d5048eccab864163806c3" as Hex;
// The same PSBT shape spending a different PegIn, so it derives another id.
const OTHER_VAULT_CLAIM_PSBT =
  "cHNidP8BADMCAAAAAQARIjNEVWZ3iJmqu8zd7v8AESIzRFVmd4iZqrvM3e7/AAAAAAD/////AAAAAAAAAAA=";

// The vault's registered payout script, and Payout PSBTs that pay it. The
// canonical claimer layout is [payout, CPFP anchor at 546 sats].
const REGISTERED_PAYOUT_SCRIPT =
  "512079be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const PAYOUT_CLAIMER_PSBT =
  "cHNidP8BALICAAAAAv/u3cy7qpmId2ZVRDMiEQD/7t3Mu6qZiHdmVUQzIhEAAAAAAAD//////+7dzLuqmYh3ZlVEMyIRAP/u3cy7qpmId2ZVRDMiEQABAAAAAP////8CuIIBAAAAAAAiUSB5vmZ++dy7rFWgYpXOhwsHApv82y3OKNlZ8oFbFvgXmCICAAAAAAAAIlEgeb5mfvncu6xVoGKVzocLBwKb/NstzijZWfKBWxb4F5gAAAAAAAAAAAA=";
// The same canonical layout, distinguishable only by input sequence, so the
// two Payout signatures can be told apart in the assertions below.
const PAYOUT_DEPOSITOR_PSBT =
  "cHNidP8BALICAAAAAv/u3cy7qpmId2ZVRDMiEQD/7t3Mu6qZiHdmVUQzIhEAAAAAAAD9/////+7dzLuqmYh3ZlVEMyIRAP/u3cy7qpmId2ZVRDMiEQABAAAAAP3///8CuIIBAAAAAAAiUSB5vmZ++dy7rFWgYpXOhwsHApv82y3OKNlZ8oFbFvgXmCICAAAAAAAAIlEgeb5mfvncu6xVoGKVzocLBwKb/NstzijZWfKBWxb4F5gAAAAAAAAAAAA=";
// Same layout, output 0 pays somebody else.
const PAYOUT_PSBT_WRONG_DESTINATION =
  "cHNidP8BALICAAAAAv/u3cy7qpmId2ZVRDMiEQD/7t3Mu6qZiHdmVUQzIhEAAAAAAAD//////+7dzLuqmYh3ZlVEMyIRAP/u3cy7qpmId2ZVRDMiEQABAAAAAP////8CuIIBAAAAAAAiUSDGBH+UQe19bTBFQG6VwHzYXHeOS4zvPKerrAm5XHCe5SICAAAAAAAAIlEgeb5mfvncu6xVoGKVzocLBwKb/NstzijZWfKBWxb4F5gAAAAAAAAAAAA=";

/**
 * PSBTs are opaque to this service, so the fixtures encode their own identity:
 * each signature comes back as `sig:<the psbt it was extracted from>`, which
 * is what lets the assertions below prove nothing was reordered. The Claim is
 * the exception — it has to parse, so it is named by lookup instead.
 */
function stubPsbtPipeline(): void {
  wasm.buildClaimPsbt.mockResolvedValue(CLAIM_PSBT);
  wasm.buildAssertClaimerPsbt.mockResolvedValue(toBase64("psbt-assert"));
  wasm.buildPayoutClaimerPsbt.mockResolvedValue(PAYOUT_CLAIMER_PSBT);
  wasm.buildPayoutDepositorPsbt.mockResolvedValue(PAYOUT_DEPOSITOR_PSBT);
  wasm.buildWronglyChallengedPsbts.mockResolvedValue({
    [CHALLENGER_A]: [toBase64("psbt-wc-a0"), toBase64("psbt-wc-a1")],
    [CHALLENGER_B]: [toBase64("psbt-wc-b0")],
  });
  // Real PSBTs have to parse, so they are named by lookup; the opaque ones
  // still carry their own identity, which is what proves nothing reordered.
  const named: Record<string, string> = {
    [CLAIM_PSBT]: "sig:psbt-claim",
    [PAYOUT_CLAIMER_PSBT]: "sig:psbt-payout",
    [PAYOUT_DEPOSITOR_PSBT]: "sig:psbt-payout-depositor",
  };
  wasm.extractTapScriptSig.mockImplementation((psbtBase64: string) =>
    Promise.resolve(named[psbtBase64] ?? `sig:${fromBase64(psbtBase64)}`),
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
    btcNetwork: "testnet",
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
      ([psbtBase64]) => psbtBase64 === PAYOUT_CLAIMER_PSBT,
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
    expect(
      options.map(
        (o: { signInputs: { index: number }[] }) => o.signInputs[0].index,
      ),
    ).toEqual([0, 0, 1, 0, 0, 0, 0]);
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

  it("refuses to prompt when the wallet's address is not the depositor key's", async () => {
    const wallet = makeWallet();
    (wallet.getAddress as unknown as Mock).mockResolvedValue(OTHER_ADDRESS);

    // The sign options name the signer by address, so an address from another
    // account signs the whole batch for that account.
    await expect(assemble(wallet)).rejects.toThrow(
      /is not derived from the vault's depositor key/,
    );
    expect(wallet.signPsbts).not.toHaveBeenCalled();
  });

  it("refuses a graph whose Claim spends a different vault's PegIn", async () => {
    wasm.buildClaimPsbt.mockResolvedValue(OTHER_VAULT_CLAIM_PSBT);
    const wallet = makeWallet();

    // The graph comes from the vault provider and declares no vault id of its
    // own, so the Claim's PegIn input is the only thing that binds it.
    await expect(assemble(wallet)).rejects.toThrow(VaultIdBindingError);
    expect(wallet.signPsbts).not.toHaveBeenCalled();
  });

  it("refuses a Payout that pays anything but the registered script", async () => {
    wasm.buildPayoutDepositorPsbt.mockResolvedValue(
      PAYOUT_PSBT_WRONG_DESTINATION,
    );
    const wallet = makeWallet();

    // The graph is correctly bound to this vault; only the destination is
    // wrong, which is the case the vault-id binding cannot catch.
    await expect(assemble(wallet)).rejects.toThrow(PayoutDestinationError);
    expect(wallet.signPsbts).not.toHaveBeenCalled();
  });

  it("refuses a graph that omits one of the vault's challengers", async () => {
    wasm.buildWronglyChallengedPsbts.mockResolvedValue({
      [CHALLENGER_A]: [toBase64("psbt-wc-a0")],
    });
    const wallet = makeWallet();

    // Undersigning is the asymmetric failure: the file would verify and the
    // omitted challenger would be unanswerable at claim time.
    await expect(assemble(wallet)).rejects.toThrow(ChallengerSetMismatchError);
    expect(wallet.signPsbts).not.toHaveBeenCalled();
  });

  it("refuses a graph that adds a challenger the vault does not have", async () => {
    wasm.buildWronglyChallengedPsbts.mockResolvedValue({
      [CHALLENGER_A]: [toBase64("psbt-wc-a0")],
      [CHALLENGER_B]: [toBase64("psbt-wc-b0")],
      ["cc".repeat(32)]: [toBase64("psbt-wc-c0")],
    });
    const wallet = makeWallet();

    await expect(assemble(wallet)).rejects.toThrow(ChallengerSetMismatchError);
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
