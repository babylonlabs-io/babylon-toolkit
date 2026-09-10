/**
 * Checks on an artifacts file that arrives from disk.
 *
 * Nothing verifies an artifacts file between the day it is written and the
 * day it is claimed against, and by then the vault provider may be gone. A
 * file for the wrong vault, or one whose signatures no longer hold, has to
 * fail at selection — after the Claim is broadcast the PegIn UTXO is spent.
 */

import { Transaction } from "bitcoinjs-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ArtifactsVaultMismatchError,
  assertArtifactsUsableForVault,
  summarizeWatchtowerArtifacts,
} from "../readWatchtowerArtifacts";

const verifyWatchtowerArtifacts = vi.hoisted(() => vi.fn());

vi.mock("../../../wasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../wasm")>()),
  verifyWatchtowerArtifacts,
}));

const VAULT_ID = `0x${"cd".repeat(32)}`;
const OTHER_VAULT_ID = `0x${"ef".repeat(32)}`;

const CLAIM_TX = new Transaction();
const CLAIM_TX_HEX = CLAIM_TX.toHex();

function artifactsFile(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    vault_core_version: 3,
    tx_graph: "{graph}",
    claim_tx: CLAIM_TX_HEX,
    signatures: {},
    verifying_key: "beef",
    claimable_event_block_number: 10_985_680,
    prover_circuit_version: 7,
    vault_id: VAULT_ID,
    babe_sessions: { ["aa".repeat(32)]: { decryptor_artifacts_hex: "00" } },
    ...overrides,
  });
}

describe("summarizeWatchtowerArtifacts", () => {
  it("reports the vault, claim txid and challengers the file carries", () => {
    const summary = summarizeWatchtowerArtifacts(artifactsFile());

    expect(summary.vaultId).toBe(VAULT_ID);
    expect(summary.claimTxid).toBe(CLAIM_TX.getId());
    expect(summary.proverCircuitVersion).toBe(7);
    expect(summary.claimableEventBlockNumber).toBe(10_985_680);
    expect(summary.babeSessionChallengerPubkeys).toEqual(["aa".repeat(32)]);
  });

  it("reports block 0 when the file predates the claimable event", () => {
    const summary = summarizeWatchtowerArtifacts(
      artifactsFile({ claimable_event_block_number: undefined }),
    );

    expect(summary.claimableEventBlockNumber).toBe(0);
  });

  it("rejects a file that is not JSON", () => {
    expect(() => summarizeWatchtowerArtifacts("not json")).toThrow(
      /not valid JSON/,
    );
  });

  it("rejects a file with no vault_id", () => {
    expect(() =>
      summarizeWatchtowerArtifacts(artifactsFile({ vault_id: undefined })),
    ).toThrow(/vault_id/);
  });

  it("rejects a file whose claim_tx cannot be parsed", () => {
    expect(() =>
      summarizeWatchtowerArtifacts(artifactsFile({ claim_tx: "zz" })),
    ).toThrow(/claim_tx/);
  });
});

describe("assertArtifactsUsableForVault", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyWatchtowerArtifacts.mockResolvedValue(undefined);
  });

  it("accepts a file for the vault being claimed", async () => {
    const summary = await assertArtifactsUsableForVault({
      artifactsJson: artifactsFile(),
      expectedVaultId: VAULT_ID,
    });

    expect(summary.vaultId).toBe(VAULT_ID);
    expect(verifyWatchtowerArtifacts).toHaveBeenCalledWith(
      3,
      artifactsFile(),
    );
  });

  it("matches vault ids that differ only in prefix and case", async () => {
    await expect(
      assertArtifactsUsableForVault({
        artifactsJson: artifactsFile({ vault_id: "CD".repeat(32) }),
        expectedVaultId: VAULT_ID,
      }),
    ).resolves.toBeDefined();
  });

  it("rejects a file belonging to a different vault", async () => {
    await expect(
      assertArtifactsUsableForVault({
        artifactsJson: artifactsFile(),
        expectedVaultId: OTHER_VAULT_ID,
      }),
    ).rejects.toThrow(ArtifactsVaultMismatchError);
  });

  it("does not verify signatures for a file that names the wrong vault", async () => {
    await expect(
      assertArtifactsUsableForVault({
        artifactsJson: artifactsFile(),
        expectedVaultId: OTHER_VAULT_ID,
      }),
    ).rejects.toThrow();

    expect(verifyWatchtowerArtifacts).not.toHaveBeenCalled();
  });

  it("surfaces a signature that no longer verifies against the graph", async () => {
    verifyWatchtowerArtifacts.mockRejectedValue(
      new Error("assert_claimer_sig does not verify against the graph"),
    );

    await expect(
      assertArtifactsUsableForVault({
        artifactsJson: artifactsFile(),
        expectedVaultId: VAULT_ID,
      }),
    ).rejects.toThrow(/does not verify/);
  });
});
