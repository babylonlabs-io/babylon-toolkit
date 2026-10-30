/**
 * The served-graph check through the real WASM, on the graph-v1 depositor-as-
 * claimer graph in `fixtures/watchtowerArtifacts` (btc-vault 5bc96f5c). Each
 * tamper case changes one presignature, participant key or timelock the
 * vault provider controls and must be refused before anything is built or
 * signed.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { OnChainBtcPubkey } from "../../../clients/eth/types";
import {
  GraphParticipantMismatchError,
  GraphPresignatureError,
  assertServedGraphPresigned,
  type ServedGraphParticipants,
} from "../servedGraphBinding";

interface Fixture {
  inputs: { graphJson: string; txGraphVersion: number };
  vault: { depositorBtcXOnlyPubkey: string; vaultProviderPubkey: string };
}

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/watchtowerArtifacts/fixture.json", import.meta.url),
    "utf8",
  ),
) as Fixture;

const DEPOSITOR = fixture.vault.depositorBtcXOnlyPubkey as OnChainBtcPubkey;
const VAULT_PROVIDER = fixture.vault.vaultProviderPubkey;
const KEEPER_A = "4de1345aa847bf96342fb0fc601878a966948ae218a54d32510b7678afe3e5dc";
const KEEPER_B = "6a2ad005308822622b23482468e740a36caa838d8c9faa7afb8a63019b5af4b7";
const UNIVERSAL = "e49662aea97a89551401ce54de10474b24b4ab71383b69cf164ea59b3a209e0d";
/** The fixture vault's participants, as the chain records them. */
const VAULT: ServedGraphParticipants = {
  depositorBtcPubkey: DEPOSITOR,
  vaultProviderBtcPubkey: VAULT_PROVIDER,
  vaultKeeperBtcPubkeys: [KEEPER_A, KEEPER_B],
  universalChallengerBtcPubkeys: [UNIVERSAL],
  timelockPegin: 684,
  timelockAssert: 684,
};

interface Sig {
  signature: string;
}

/** The fixture graph fields these tests change (btc-vault 5bc96f5c TxGraph). */
interface ServedGraph {
  [field: string]: unknown;
  claimer_pubkey?: string;
  vault_keepers?: string[];
  challenger_pubkeys: Record<string, string[]>;
  config: { network: string };
  pegin_tx: { depositor_claim_connector: { pubkey: string } };
  claim_tx: { assert_connector: { claimer: string } };
  payout_tx: {
    vault_utxo_spender: {
      vault_provider_sig: Sig;
      vault_keeper_sigs: Record<string, Sig>;
      connector: {
        vault_keepers: string[];
        universal_challengers: string[];
        vault_provider: string;
        depositor: string;
        timelock_pegin: number;
      };
    };
    assert_payout_spender: {
      challenger_sigs: Record<string, Sig>;
      connector: { challengers: { local: string[] } };
    };
  };
  assert_tx: {
    input_signatures: { uc_sigs: Record<string, number[]> };
    claim_connector: { claimer: string };
    challenger_connectors_x: { claimer: string }[];
    assert_payout_nopayout_council_connector: { timelock_assert: number };
  };
  challenger_subgraphs: Record<string, { nopayout_tx: { claimer_assert_sig: Sig } }>;
}

/** The fixture graph with one field changed by `mutate`. */
function tampered(mutate: (graph: ServedGraph) => void): string {
  const graph = JSON.parse(fixture.inputs.graphJson) as ServedGraph;
  mutate(graph);
  return JSON.stringify(graph);
}

/** Same length and hex, different last nibble: parses, but fails to verify. */
function flipHex(hex: string): string {
  return hex.slice(0, -1) + (hex.endsWith("0") ? "1" : "0");
}

function flipByte(bytes: number[]): number[] {
  return [...bytes.slice(0, -1), bytes[bytes.length - 1] ^ 1];
}

function check(graphJson: string, vault: ServedGraphParticipants = VAULT) {
  return assertServedGraphPresigned({
    txGraphVersion: fixture.inputs.txGraphVersion,
    graphJson,
    vault,
  });
}

describe("assertServedGraphPresigned (real WASM)", () => {
  it("accepts the vault provider's graph as served", async () => {
    await expect(check(fixture.inputs.graphJson)).resolves.toBeUndefined();
  });

  it("refuses a Payout whose vault provider presignature is altered", async () => {
    const graph = tampered((g) => {
      const sig = g.payout_tx.vault_utxo_spender.vault_provider_sig;
      sig.signature = flipHex(sig.signature);
    });

    await expect(check(graph)).rejects.toBeInstanceOf(GraphPresignatureError);
  });

  it("refuses a Payout missing a vault keeper presignature", async () => {
    const graph = tampered((g) => {
      const sigs = g.payout_tx.vault_utxo_spender.vault_keeper_sigs;
      delete sigs[Object.keys(sigs)[0]];
    });

    await expect(check(graph)).rejects.toBeInstanceOf(GraphPresignatureError);
  });

  it("refuses a Payout whose challenger presignature on input 1 is altered", async () => {
    const graph = tampered((g) => {
      const sigs = g.payout_tx.assert_payout_spender.challenger_sigs;
      const first = sigs[Object.keys(sigs)[0]];
      first.signature = flipHex(first.signature);
    });

    await expect(check(graph)).rejects.toBeInstanceOf(GraphPresignatureError);
  });

  it("refuses an Assert whose universal challenger presignature is altered", async () => {
    const graph = tampered((g) => {
      const sigs = g.assert_tx.input_signatures.uc_sigs;
      const key = Object.keys(sigs)[0];
      sigs[key] = flipByte(sigs[key]);
    });

    await expect(check(graph)).rejects.toBeInstanceOf(GraphPresignatureError);
  });

  it("refuses a NoPayout whose depositor presignature is altered", async () => {
    const graph = tampered((g) => {
      const subgraph = Object.values(g.challenger_subgraphs)[0];
      const sig = subgraph.nopayout_tx.claimer_assert_sig;
      sig.signature = flipHex(sig.signature);
    });

    await expect(check(graph)).rejects.toBeInstanceOf(GraphPresignatureError);
  });

  it("keeps the WASM rejection as the cause", async () => {
    const graph = tampered((g) => {
      const sig = g.payout_tx.vault_utxo_spender.vault_provider_sig;
      sig.signature = flipHex(sig.signature);
    });

    const error = await check(graph).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphPresignatureError);
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  it("refuses a graph whose top-level claimer is the vault provider", async () => {
    const graph = tampered((g) => {
      g.claimer_pubkey = VAULT_PROVIDER;
    });

    await expect(check(graph)).rejects.toThrow(
      new GraphParticipantMismatchError("claimer_pubkey", VAULT_PROVIDER, DEPOSITOR),
    );
  });

  it("refuses a graph whose Assert claim connector names another claimer", async () => {
    const graph = tampered((g) => {
      g.assert_tx.claim_connector.claimer = VAULT_PROVIDER;
    });

    await expect(check(graph)).rejects.toThrow(
      new GraphParticipantMismatchError(
        "assert_tx.claim_connector.claimer",
        VAULT_PROVIDER,
        DEPOSITOR,
      ),
    );
  });

  it("refuses a graph whose challenger connector inside a list names another claimer", async () => {
    const graph = tampered((g) => {
      g.assert_tx.challenger_connectors_x[0].claimer = VAULT_PROVIDER;
    });

    await expect(check(graph)).rejects.toThrow(
      new GraphParticipantMismatchError(
        "assert_tx.challenger_connectors_x[0].claimer",
        VAULT_PROVIDER,
        DEPOSITOR,
      ),
    );
  });

  it("reports a non-key claimer value without echoing it", async () => {
    const graph = tampered((g) => {
      g.claim_tx.assert_connector.claimer = "SENTINEL-not-a-key";
    });

    const error = await check(graph).catch((e: unknown) => e);

    expect(error).toEqual(
      new GraphParticipantMismatchError(
        "claim_tx.assert_connector.claimer",
        "a malformed value",
        DEPOSITOR,
      ),
    );
    expect((error as Error).message).not.toContain("SENTINEL");
  });

  it("does not echo a served field name that is not a plain identifier", async () => {
    const graph = tampered((g) => {
      g["SENTINEL key"] = { claimer: VAULT_PROVIDER };
    });

    const error = await check(graph).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphParticipantMismatchError);
    expect((error as GraphParticipantMismatchError).path).toBe("<key>.claimer");
    expect((error as Error).message).not.toContain("SENTINEL");
  });

  it("keeps served graph content out of a presignature failure's message", async () => {
    const graph = tampered((g) => {
      g.config.network = "SENTINEL";
    });

    const error = await check(graph).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphPresignatureError);
    expect((error as Error).message).not.toContain("SENTINEL");
  });

  it("refuses a graph with no top-level claimer key", async () => {
    const graph = tampered((g) => {
      delete g.claimer_pubkey;
    });

    await expect(check(graph)).rejects.toBeInstanceOf(
      GraphParticipantMismatchError,
    );
  });

  it("refuses the served graph for a vault registered to another depositor", async () => {
    await expect(
      check(fixture.inputs.graphJson, {
        ...VAULT,
        depositorBtcPubkey: VAULT_PROVIDER as OnChainBtcPubkey,
      }),
    ).rejects.toBeInstanceOf(GraphParticipantMismatchError);
  });

  it("refuses a Payout whose vault keeper key is swapped for one the vault provider controls", async () => {
    const graph = tampered((g) => {
      g.payout_tx.vault_utxo_spender.connector.vault_keepers = [
        VAULT_PROVIDER,
        KEEPER_B,
      ];
    });

    await expect(check(graph)).rejects.toThrow(
      new GraphParticipantMismatchError(
        "payout_tx.vault_utxo_spender.connector.vault_keepers",
        `[${VAULT_PROVIDER}, ${KEEPER_B}]`,
        `[${KEEPER_A}, ${KEEPER_B}]`,
      ),
    );
  });

  it("refuses a Payout with an extra vault keeper", async () => {
    const graph = tampered((g) => {
      g.payout_tx.vault_utxo_spender.connector.vault_keepers.push(UNIVERSAL);
    });

    await expect(check(graph)).rejects.toBeInstanceOf(
      GraphParticipantMismatchError,
    );
  });

  it("refuses a Payout whose universal challenger is swapped", async () => {
    const graph = tampered((g) => {
      g.payout_tx.vault_utxo_spender.connector.universal_challengers = [
        VAULT_PROVIDER,
      ];
    });

    await expect(check(graph)).rejects.toThrow(
      new GraphParticipantMismatchError(
        "payout_tx.vault_utxo_spender.connector.universal_challengers",
        `[${VAULT_PROVIDER}]`,
        `[${UNIVERSAL}]`,
      ),
    );
  });

  it("refuses a Payout whose vault provider key is swapped", async () => {
    const graph = tampered((g) => {
      g.payout_tx.vault_utxo_spender.connector.vault_provider = KEEPER_A;
    });

    await expect(check(graph)).rejects.toThrow(
      new GraphParticipantMismatchError(
        "payout_tx.vault_utxo_spender.connector.vault_provider",
        KEEPER_A,
        VAULT_PROVIDER,
      ),
    );
  });

  it("refuses a Payout whose depositor key is swapped", async () => {
    const graph = tampered((g) => {
      g.payout_tx.vault_utxo_spender.connector.depositor = VAULT_PROVIDER;
    });

    await expect(check(graph)).rejects.toThrow(
      new GraphParticipantMismatchError(
        "payout_tx.vault_utxo_spender.connector.depositor",
        VAULT_PROVIDER,
        DEPOSITOR,
      ),
    );
  });

  it("refuses a Payout input 1 connector whose local challengers are swapped", async () => {
    const graph = tampered((g) => {
      g.payout_tx.assert_payout_spender.connector.challengers.local = [
        VAULT_PROVIDER,
        KEEPER_B,
      ];
    });

    await expect(check(graph)).rejects.toThrow(
      new GraphParticipantMismatchError(
        "payout_tx.assert_payout_spender.connector.challengers",
        `local [${VAULT_PROVIDER}, ${KEEPER_B}] universal [${UNIVERSAL}]`,
        `local [${KEEPER_A}, ${KEEPER_B}] universal [${UNIVERSAL}]`,
      ),
    );
  });

  it("refuses a challenger set carrying an extra role", async () => {
    const graph = tampered((g) => {
      g.challenger_pubkeys.extra = [VAULT_PROVIDER];
    });

    await expect(check(graph)).rejects.toBeInstanceOf(
      GraphParticipantMismatchError,
    );
  });

  it("refuses a Payout whose PegIn timelock is changed", async () => {
    const graph = tampered((g) => {
      g.payout_tx.vault_utxo_spender.connector.timelock_pegin = 1;
    });

    await expect(check(graph)).rejects.toThrow(
      new GraphParticipantMismatchError(
        "payout_tx.vault_utxo_spender.connector.timelock_pegin",
        "1",
        "684",
      ),
    );
  });

  it("refuses an Assert connector whose Assert timelock is changed", async () => {
    const graph = tampered((g) => {
      g.assert_tx.assert_payout_nopayout_council_connector.timelock_assert = 1;
    });

    await expect(check(graph)).rejects.toBeInstanceOf(
      GraphParticipantMismatchError,
    );
  });

  it("refuses a graph with no top-level vault keeper set", async () => {
    const graph = tampered((g) => {
      delete g.vault_keepers;
    });

    await expect(check(graph)).rejects.toThrow(
      new GraphParticipantMismatchError(
        "vault_keepers",
        "nothing",
        `[${KEEPER_A}, ${KEEPER_B}]`,
      ),
    );
  });

  it("refuses the served graph when the chain records another vault keeper", async () => {
    await expect(
      check(fixture.inputs.graphJson, {
        ...VAULT,
        vaultKeeperBtcPubkeys: [KEEPER_A, UNIVERSAL],
      }),
    ).rejects.toBeInstanceOf(GraphParticipantMismatchError);
  });

  it("refuses a graph whose Claim signing key is swapped", async () => {
    const graph = tampered((g) => {
      g.pegin_tx.depositor_claim_connector.pubkey = VAULT_PROVIDER;
    });

    await expect(check(graph)).rejects.toThrow(
      new GraphParticipantMismatchError(
        "pegin_tx.depositor_claim_connector.pubkey",
        VAULT_PROVIDER,
        DEPOSITOR,
      ),
    );
  });

  it("accepts the served graph when the vault context holds compressed keys", async () => {
    const compressed = (key: string) => `02${key}`;

    await expect(
      check(fixture.inputs.graphJson, {
        ...VAULT,
        depositorBtcPubkey: compressed(DEPOSITOR) as OnChainBtcPubkey,
        vaultProviderBtcPubkey: compressed(VAULT_PROVIDER),
        vaultKeeperBtcPubkeys: [compressed(KEEPER_A), compressed(KEEPER_B)],
        universalChallengerBtcPubkeys: [compressed(UNIVERSAL)],
      }),
    ).resolves.toBeUndefined();
  });

  it("refuses a vault context that lists a universal challenger twice", async () => {
    await expect(
      check(fixture.inputs.graphJson, {
        ...VAULT,
        universalChallengerBtcPubkeys: [UNIVERSAL, UNIVERSAL],
      }),
    ).rejects.toThrow(
      "The vault context lists the same universal challenger key more than once.",
    );
  });

  it("refuses a graph that is not JSON without quoting it", async () => {
    const error = await check("{SENTINEL").catch((e: unknown) => e);

    expect(error).toEqual(new Error("Served graph is not valid JSON."));
    expect((error as Error).cause).toBeUndefined();
  });
});
