/**
 * Checks on an artifacts file that arrives from disk.
 *
 * Nothing verifies an artifacts file between the day it is written and the
 * day it is claimed against, and by then the vault provider may be gone. A
 * file for the wrong vault, or one whose signatures no longer hold, has to
 * fail at selection — after the Claim is broadcast the PegIn UTXO is spent.
 */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ArtifactsVaultMismatchError,
  assertArtifactsUsableForVault,
  summarizeWatchtowerArtifacts,
} from "../readWatchtowerArtifacts";
import { VaultIdBindingError } from "../vaultIdBinding";

const verifyWatchtowerArtifacts = vi.hoisted(() => vi.fn());

vi.mock("../../../wasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../wasm")>()),
  verifyWatchtowerArtifacts,
}));

const DEPOSITOR_ETH_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
// PegIn the Claim spends, and the vault id it derives with that depositor.
// Non-palindromic, and OTHER_TXID is its byte reversal, so a lost reversal
// in the code swaps the two and fails both directions.
const PEGIN_TXID = "00112233445566778899aabbccddeeff".repeat(2);
const OTHER_TXID = "ffeeddccbbaa99887766554433221100".repeat(2);
const VAULT_ID =
  "0xf5c2a4e499a96ee2a2e32acf1f16b51d2958e7819a1d5048eccab864163806c3";
const OTHER_VAULT_ID = `0x${"ef".repeat(32)}`;

const CLAIM_TX = new Transaction();
CLAIM_TX.addInput(Buffer.from(PEGIN_TXID, "hex").reverse(), 1);
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
    expect(summary.claimableEventBlockNumber).toBe(10_985_680n);
    expect(summary.babeSessionChallengerPubkeys).toEqual(["aa".repeat(32)]);
  });

  it("reports the PegIn txid in display order, not internal order", () => {
    // The vault id is derived from this value, so a reversed one would
    // reject every file that is in fact correct.
    const summary = summarizeWatchtowerArtifacts(artifactsFile());

    expect(summary.peginTxid).toBe(PEGIN_TXID);
  });

  it("reports block 0 when the file predates the claimable event", () => {
    const summary = summarizeWatchtowerArtifacts(
      artifactsFile({ claimable_event_block_number: undefined }),
    );

    expect(summary.claimableEventBlockNumber).toBe(0n);
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

  it("rejects a negative claimable_event_block_number", () => {
    expect(() =>
      summarizeWatchtowerArtifacts(
        artifactsFile({ claimable_event_block_number: -1 }),
      ),
    ).toThrow(/claimable_event_block_number/);
  });

  it("rejects a fractional claimable_event_block_number", () => {
    // BigInt() would otherwise throw a RangeError that never names the field.
    expect(() =>
      summarizeWatchtowerArtifacts(
        artifactsFile({ claimable_event_block_number: 1.5 }),
      ),
    ).toThrow(/claimable_event_block_number/);
  });

  it("rejects a claimable_event_block_number JSON.parse has already rounded", () => {
    expect(() =>
      summarizeWatchtowerArtifacts(
        artifactsFile({ claimable_event_block_number: 2 ** 53 + 2 }),
      ),
    ).toThrow(/claimable_event_block_number/);
  });

  it("rejects a vault_core_version that is not a number", () => {
    expect(() =>
      summarizeWatchtowerArtifacts(artifactsFile({ vault_core_version: "3" })),
    ).toThrow(/vault_core_version/);
  });

  it("rejects babe_sessions that is not an object", () => {
    // Object.keys("ab") reports "0" and "1", which would pass downstream as
    // challenger public keys.
    expect(() =>
      summarizeWatchtowerArtifacts(artifactsFile({ babe_sessions: "ab" })),
    ).toThrow(/babe_sessions/);
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
      depositorEthAddress: DEPOSITOR_ETH_ADDRESS,
    });

    expect(summary.vaultId).toBe(VAULT_ID);
    expect(verifyWatchtowerArtifacts).toHaveBeenCalledWith(3, artifactsFile());
  });

  it("matches vault ids that differ only in prefix and case", async () => {
    await expect(
      assertArtifactsUsableForVault({
        artifactsJson: artifactsFile({
          vault_id: VAULT_ID.slice(2).toUpperCase(),
        }),
        expectedVaultId: VAULT_ID,
        depositorEthAddress: DEPOSITOR_ETH_ADDRESS,
      }),
    ).resolves.toBeDefined();
  });

  it("rejects a file belonging to a different vault", async () => {
    await expect(
      assertArtifactsUsableForVault({
        artifactsJson: artifactsFile(),
        expectedVaultId: OTHER_VAULT_ID,
        depositorEthAddress: DEPOSITOR_ETH_ADDRESS,
      }),
    ).rejects.toThrow(ArtifactsVaultMismatchError);
  });

  it("rejects a file whose graph belongs to another vault than its vault_id", async () => {
    const otherPeginTx = new Transaction();
    otherPeginTx.addInput(Buffer.from(OTHER_TXID, "hex").reverse(), 0);

    // vault_id says this vault; the graph the signatures cover says another.
    await expect(
      assertArtifactsUsableForVault({
        artifactsJson: artifactsFile({ claim_tx: otherPeginTx.toHex() }),
        expectedVaultId: VAULT_ID,
        depositorEthAddress: DEPOSITOR_ETH_ADDRESS,
      }),
    ).rejects.toThrow(VaultIdBindingError);
  });

  it("does not verify signatures for a file that names the wrong vault", async () => {
    await expect(
      assertArtifactsUsableForVault({
        artifactsJson: artifactsFile(),
        expectedVaultId: OTHER_VAULT_ID,
        depositorEthAddress: DEPOSITOR_ETH_ADDRESS,
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
        depositorEthAddress: DEPOSITOR_ETH_ADDRESS,
      }),
    ).rejects.toThrow(/does not verify/);
  });
});
