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
  computePayoutFeeFloor: vi.fn(),
  extractTapScriptSig: vi.fn(),
  finalizeClaimTx: vi.fn(),
  buildWatchtowerArtifacts: vi.fn(),
}));

vi.mock("../../../wasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../wasm")>()),
  ...wasm,
}));
// The signer verifies each signature against its PSBT; the named stubs above
// are routing labels, not signatures, so that seam is stubbed like the wasm.
vi.mock("../../../primitives/psbt/verifyScriptPathSchnorrSignature", () => ({
  assertScriptPathSchnorrSignature: vi.fn(),
}));

import { copyAssertConnectorLeaf } from "../payoutInputLeaf";
import {
  CHALLENGER_A,
  CHALLENGER_B,
  DEPOSITOR_ETH_ADDRESS,
  DEPOSITOR_PUBKEY,
  DEPOSITOR_XONLY_PUBKEY,
  OTHER_ADDRESS,
  OTHER_VAULT_CLAIM_PSBT,
  REGISTERED_PAYOUT_SCRIPT,
  SIGNER_ADDRESS,
  TIMELOCK_ASSERT,
  TIMELOCK_PEGIN,
  VAULT_ID,
  VAULT_PROVIDER_PUBKEY,
  VAULT_UTXO_SATS,
  buildDelegatedClaimFixture,
} from "./fixtures/delegatedClaimPsbts";

const fx = buildDelegatedClaimFixture();
const MOCKED_FEE_FLOOR = 800n;
/** The fixture's 1_000 sat implicit fee sits inside [800, 2 x 610] for 1 keeper + 1 challenger. */
const PROTOCOL_FEE_RATE = 2n;
// The planner copies the Assert-connector leaf onto the depositor Payout
// before signing, so the wallet sees the augmented PSBT, not the builder's.
const PAYOUT_DEPOSITOR_AUGMENTED = copyAssertConnectorLeaf({
  payoutDepositorPsbtBase64: fx.payoutDepositorPsbt,
  payoutClaimerPsbtBase64: fx.payoutClaimerPsbt,
});

function stubPsbtPipeline(): void {
  wasm.buildClaimPsbt.mockResolvedValue(fx.claimPsbt);
  wasm.buildAssertClaimerPsbt.mockResolvedValue(fx.assertPsbt);
  wasm.buildPayoutClaimerPsbt.mockResolvedValue(fx.payoutClaimerPsbt);
  wasm.buildPayoutDepositorPsbt.mockResolvedValue(fx.payoutDepositorPsbt);
  wasm.buildWronglyChallengedPsbts.mockResolvedValue(fx.wronglyChallengedPsbts);
  // The band itself is covered by assertPayoutFeeBand.test.ts and assertPayoutFeeAndTimelocks.test.ts.
  wasm.computePayoutFeeFloor.mockResolvedValue(MOCKED_FEE_FLOOR);
  // Each signature names the PSBT it came from, which is what proves nothing
  // was reordered between the request list and the artifacts.
  const named: Record<string, string> = {
    [fx.claimPsbt]: "sig:psbt-claim",
    [fx.assertPsbt]: "sig:psbt-assert",
    [fx.payoutClaimerPsbt]: "sig:psbt-payout",
    [PAYOUT_DEPOSITOR_AUGMENTED]: "sig:psbt-payout-depositor",
    [fx.wronglyChallengedPsbts[CHALLENGER_A][0]]: "sig:psbt-wc-a0",
    [fx.wronglyChallengedPsbts[CHALLENGER_A][1]]: "sig:psbt-wc-a1",
    [fx.wronglyChallengedPsbts[CHALLENGER_B][0]]: "sig:psbt-wc-b0",
  };
  wasm.extractTapScriptSig.mockImplementation((psbtBase64: string) => {
    const sig = named[psbtBase64];
    if (!sig) throw new Error("extractTapScriptSig: unknown PSBT in test");
    return Promise.resolve(sig);
  });
  wasm.finalizeClaimTx.mockResolvedValue("signed-claim-tx-hex");
  wasm.buildWatchtowerArtifacts.mockResolvedValue("{}");
}

function makeWallet(): BitcoinWallet {
  return {
    getAddress: vi.fn(() => Promise.resolve(SIGNER_ADDRESS)),
    getPublicKeyHex: vi.fn(() => Promise.resolve(DEPOSITOR_PUBKEY)),
    signPsbt: vi.fn(),
    signPsbts: vi.fn((psbtHexes: string[]) => Promise.resolve(psbtHexes)),
  } as unknown as BitcoinWallet;
}

async function assemble(wallet: BitcoinWallet): Promise<void> {
  await assembleWatchtowerArtifacts({
    btcWallet: wallet,
    depositorPublicKey: DEPOSITOR_PUBKEY,
    btcNetwork: "testnet",
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
      ([psbtBase64]) => psbtBase64 === fx.payoutClaimerPsbt,
    );
    expect(payoutCall?.[1]).toBe(1);
  });

  it("always signs a fresh depositor Payout signature in the same batch", async () => {
    const wallet = makeWallet();

    await assemble(wallet);

    // The builder no longer reads a presigned signature off the graph, so the
    // PSBT must ride in the one batch — not a second prompt months later.
    // Built twice: once to plan, once to prove the plan was not altered.
    expect(wasm.buildPayoutDepositorPsbt).toHaveBeenCalledTimes(2);
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
      fx.payoutWrongDestinationPsbt,
    );
    const wallet = makeWallet();

    // The graph is correctly bound to this vault; only the destination is
    // wrong, which is the case the vault-id binding cannot catch.
    await expect(assemble(wallet)).rejects.toThrow(PayoutDestinationError);
    expect(wallet.signPsbts).not.toHaveBeenCalled();
  });

  it("refuses a graph that omits one of the vault's challengers", async () => {
    // Only the keys matter to this check, so the PSBTs need no shape.
    wasm.buildWronglyChallengedPsbts.mockResolvedValue({
      [CHALLENGER_A]: [fx.wronglyChallengedPsbts[CHALLENGER_A][0]],
    });
    const wallet = makeWallet();

    // Undersigning is the asymmetric failure: the file would verify and the
    // omitted challenger would be unanswerable at claim time.
    await expect(assemble(wallet)).rejects.toThrow(ChallengerSetMismatchError);
    expect(wallet.signPsbts).not.toHaveBeenCalled();
  });

  it("refuses a graph that adds a challenger the vault does not have", async () => {
    wasm.buildWronglyChallengedPsbts.mockResolvedValue({
      [CHALLENGER_A]: [fx.wronglyChallengedPsbts[CHALLENGER_A][0]],
      [CHALLENGER_B]: [fx.wronglyChallengedPsbts[CHALLENGER_B][0]],
      ["cc".repeat(32)]: [fx.wronglyChallengedPsbts[CHALLENGER_B][0]],
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
