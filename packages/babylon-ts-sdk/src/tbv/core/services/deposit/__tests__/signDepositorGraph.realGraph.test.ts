/**
 * Depositor-graph presigning through the real WASM on a Vault Core 1
 * depositor graph built by btc-vault's own code (the watchtower-artifacts
 * fixture, see `delegated-claim/__tests__/fixtures/watchtowerArtifacts/README.md`).
 *
 * The other signDepositorGraph tests mock the primitives; this file proves an
 * honest btc-vault graph clears every check and reaches the wallet, and that
 * a VP substituting a NoPayout's ChallengeAssert parents is refused before
 * the wallet is asked to sign.
 */

import { Buffer } from "buffer";
import { readFileSync } from "node:fs";

import { Transaction } from "bitcoinjs-lib";
import { describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import type {
  DepositorGraphTransactions,
  PresignDataPerChallenger,
} from "../../../clients/vault-provider/types";
import { deriveBip86ScriptPubKeyHex } from "../../../primitives/utils/bitcoin";
import { serializeGraphTx } from "../graphFingerprint";
import {
  type DepositorGraphSigningContext,
  signDepositorGraph,
} from "../signDepositorGraph";

interface SerializedTx {
  tx: unknown;
}

interface FixtureGraph {
  pegin_tx: SerializedTx & {
    pegin_payout_connector: { timelock_pegin: number };
  };
  claim_tx: SerializedTx;
  assert_tx: SerializedTx;
  payout_tx: SerializedTx;
  challenger_subgraphs: Record<
    string,
    {
      challenger_pubkey: string;
      challenge_assert_x_tx: SerializedTx;
      challenge_assert_y_tx: SerializedTx;
      nopayout_tx: SerializedTx;
      output_label_hashes: string[];
    }
  >;
  depositor_pubkey: string;
  vault_provider_pubkey: string;
  vault_keepers: string[];
  universal_challengers: string[];
  payout_btc_address: string;
  config: {
    timelock_assert: number;
    timelock_challenge_assert: number;
    fee_rate: { sats_per_vbyte: number };
    council: { members: string[]; quorum: number };
    offchain_params_version: number;
    vault_core_version: number;
  };
}

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../delegated-claim/__tests__/fixtures/watchtowerArtifacts/fixture.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { inputs: { graphJson: string } };
const graph = JSON.parse(fixture.inputs.graphJson) as FixtureGraph;

/** BIP340 test-vector x-only key, standing in for a colluding challenger's own key. */
const ATTACKER =
  "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";

const WALLET_REACHED = "reached the wallet";

function txHex(node: SerializedTx, path: string): string {
  return Buffer.from(serializeGraphTx(node.tx, path)).toString("hex");
}

function presignData(): PresignDataPerChallenger[] {
  return Object.values(graph.challenger_subgraphs).map((sub) => ({
    challenger_pubkey: sub.challenger_pubkey,
    challenge_assert_x_tx: {
      tx_hex: txHex(sub.challenge_assert_x_tx, "challenge_assert_x_tx"),
    },
    challenge_assert_y_tx: {
      tx_hex: txHex(sub.challenge_assert_y_tx, "challenge_assert_y_tx"),
    },
    nopayout_tx: { tx_hex: txHex(sub.nopayout_tx, "nopayout_tx") },
    nopayout_psbt: "",
    challenge_assert_connectors: [],
    output_label_hashes: sub.output_label_hashes,
  }));
}

function depositorGraph(
  challengerPresignData: PresignDataPerChallenger[],
): DepositorGraphTransactions {
  return {
    claim_tx: { tx_hex: txHex(graph.claim_tx, "claim_tx") },
    assert_tx: { tx_hex: txHex(graph.assert_tx, "assert_tx") },
    payout_tx: { tx_hex: txHex(graph.payout_tx, "payout_tx") },
    payout_psbt: "",
    challenger_presign_data: challengerPresignData,
    offchain_params_version: graph.config.offchain_params_version,
  };
}

const signingContext: DepositorGraphSigningContext = {
  vaultCoreVersion: graph.config.vault_core_version,
  peginTxHex: txHex(graph.pegin_tx, "pegin_tx"),
  depositorBtcPubkey: graph.depositor_pubkey,
  vaultProviderBtcPubkey: graph.vault_provider_pubkey,
  vaultKeeperBtcPubkeys: graph.vault_keepers,
  universalChallengerBtcPubkeys: graph.universal_challengers,
  timelockPegin: graph.pegin_tx.pegin_payout_connector.timelock_pegin,
  timelockAssert: graph.config.timelock_assert,
  timelockChallengeAssert: graph.config.timelock_challenge_assert,
  councilMembers: graph.config.council.members,
  councilQuorum: graph.config.council.quorum,
  network: "regtest",
  registeredPayoutScriptPubKey: graph.payout_btc_address,
  protocolFeeRate: BigInt(graph.config.fee_rate.sats_per_vbyte),
  // Unused by the depositor-as-claimer role.
  vkClaimerPayoutScriptPubKeys: {},
  vpCommissionScriptPubKey: `0014${"00".repeat(20)}`,
};

/** A wallet that records the PSBTs it is asked to sign and signs none. */
function walletThatStopsAtSigning() {
  const signPsbts = vi.fn<(psbtHexes: string[]) => Promise<string[]>>(
    async () => {
      throw new Error(WALLET_REACHED);
    },
  );
  const signPsbt = vi.fn<(psbtHex: string) => Promise<string>>(async () => {
    throw new Error(WALLET_REACHED);
  });
  const wallet = {
    getPublicKeyHex: vi.fn(async () => graph.depositor_pubkey),
    signPsbt,
    signPsbts,
  } as unknown as BitcoinWallet;
  return { wallet, signPsbts, signPsbt };
}

/**
 * Replace the first challenger's ChallengeAssertX with `forge(realCaX)` and
 * re-point its NoPayout's input 1 at the forgery, keeping the graph
 * self-consistent the way a malicious VP would.
 */
function withForgedChallengeAssertX(
  forge: (challengeAssertX: Transaction) => void,
): PresignDataPerChallenger[] {
  const data = presignData();
  const target = data[0];
  const challengeAssertX = Transaction.fromHex(
    target.challenge_assert_x_tx.tx_hex,
  );
  forge(challengeAssertX);
  const noPayout = Transaction.fromHex(target.nopayout_tx.tx_hex);
  noPayout.ins[1].hash = challengeAssertX.getHash();
  target.challenge_assert_x_tx = { tx_hex: challengeAssertX.toHex() };
  target.nopayout_tx = { tx_hex: noPayout.toHex() };
  return data;
}

describe("signDepositorGraph on a btc-vault-built graph", () => {
  it("clears every check and asks the wallet to sign the Payout and one NoPayout per challenger", async () => {
    const { wallet, signPsbts } = walletThatStopsAtSigning();

    await expect(
      signDepositorGraph({
        depositorGraph: depositorGraph(presignData()),
        btcWallet: wallet,
        signingContext,
      }),
    ).rejects.toThrow(WALLET_REACHED);

    expect(signPsbts).toHaveBeenCalledOnce();
    expect(signPsbts.mock.calls[0][0]).toHaveLength(
      1 + Object.keys(graph.challenger_subgraphs).length,
    );
  });

  it("clears every check whatever order the VP lists the challengers in", async () => {
    const { wallet, signPsbts } = walletThatStopsAtSigning();

    await expect(
      signDepositorGraph({
        depositorGraph: depositorGraph(presignData().reverse()),
        btcWallet: wallet,
        signingContext,
      }),
    ).rejects.toThrow(WALLET_REACHED);

    expect(signPsbts).toHaveBeenCalledOnce();
  });

  it("clears every check when the VP sends the label hashes in uppercase hex", async () => {
    const { wallet, signPsbts } = walletThatStopsAtSigning();
    const data = presignData().map((challenger) => ({
      ...challenger,
      output_label_hashes: challenger.output_label_hashes.map((hash) =>
        hash.toUpperCase(),
      ),
    }));

    await expect(
      signDepositorGraph({
        depositorGraph: depositorGraph(data),
        btcWallet: wallet,
        signingContext,
      }),
    ).rejects.toThrow(WALLET_REACHED);

    expect(signPsbts).toHaveBeenCalledOnce();
  });

  it("refuses an independently funded ChallengeAssertX before the wallet", async () => {
    const { wallet, signPsbts, signPsbt } = walletThatStopsAtSigning();
    const forged = withForgedChallengeAssertX((tx) => {
      tx.ins[0].hash = Buffer.alloc(32, 0x99);
    });

    await expect(
      signDepositorGraph({
        depositorGraph: depositorGraph(forged),
        btcWallet: wallet,
        signingContext,
      }),
    ).rejects.toThrow("is not the canonical transaction for this Assert");

    expect(signPsbts).not.toHaveBeenCalled();
    expect(signPsbt).not.toHaveBeenCalled();
  });

  it("refuses a ChallengeAssertX that spends the real connector into an attacker key before the wallet", async () => {
    const { wallet, signPsbts } = walletThatStopsAtSigning();
    const forged = withForgedChallengeAssertX((tx) => {
      tx.outs[0].script = Buffer.from(
        deriveBip86ScriptPubKeyHex(ATTACKER).slice(2),
        "hex",
      );
    });

    await expect(
      signDepositorGraph({
        depositorGraph: depositorGraph(forged),
        btcWallet: wallet,
        signingContext,
      }),
    ).rejects.toThrow("is not the canonical transaction for this Assert");

    expect(signPsbts).not.toHaveBeenCalled();
  });

  it("refuses label hashes that do not match the ChallengeAssert output connector", async () => {
    const { wallet, signPsbts } = walletThatStopsAtSigning();
    const data = presignData();
    data[0].output_label_hashes = [
      "ff".repeat(32),
      ...data[0].output_label_hashes.slice(1),
    ];

    await expect(
      signDepositorGraph({
        depositorGraph: depositorGraph(data),
        btcWallet: wallet,
        signingContext,
      }),
    ).rejects.toThrow("is not the canonical transaction for this Assert");

    expect(signPsbts).not.toHaveBeenCalled();
  });

  it("refuses a NoPayout whose ChallengeAssert inputs drop the timelock before the wallet", async () => {
    const { wallet, signPsbts } = walletThatStopsAtSigning();
    const data = presignData();
    const noPayout = Transaction.fromHex(data[0].nopayout_tx.tx_hex);
    noPayout.ins[1].sequence = 0;
    data[0].nopayout_tx = { tx_hex: noPayout.toHex() };

    await expect(
      signDepositorGraph({
        depositorGraph: depositorGraph(data),
        btcWallet: wallet,
        signingContext,
      }),
    ).rejects.toThrow(
      `sequence must be ${graph.config.timelock_challenge_assert}, got 0`,
    );

    expect(signPsbts).not.toHaveBeenCalled();
  });
});
