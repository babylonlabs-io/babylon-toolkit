/**
 * Reading and checking a watchtower `artifacts.json` that already exists.
 *
 * An artifacts file is the depositor's only path to their funds when the
 * vault provider is gone, and nothing checks it between the day it is written
 * and the day it is used. These functions close that gap: they re-verify
 * every signature in the file against its own embedded graph, and confirm the
 * file belongs to the vault it is about to be claimed for.
 *
 * Run them before handing the file to `vaultd vp wt`, not after a claim has
 * already spent the PegIn UTXO.
 *
 * @module services/delegated-claim/readWatchtowerArtifacts
 */

import { Transaction } from "bitcoinjs-lib";

import { verifyWatchtowerArtifacts } from "../../wasm";

import type { WatchtowerArtifactsSummary } from "./types";

/**
 * Graph version the delegated-claim artifacts format exists for. Vaults on
 * graph v1 and v2 predate it and have no artifacts path at all.
 */
export const DELEGATED_CLAIM_TX_GRAPH_VERSION = 3;

/** Thrown when an artifacts file does not describe the vault being claimed. */
export class ArtifactsVaultMismatchError extends Error {
  constructor(
    readonly expectedVaultId: string,
    readonly actualVaultId: string,
  ) {
    super(
      `Artifacts belong to vault ${actualVaultId}, not ${expectedVaultId}. ` +
        `Select the artifacts file saved for this vault.`,
    );
    this.name = "ArtifactsVaultMismatchError";
  }
}

/** Raw shape of the fields this module reads out of the file. */
interface ArtifactsFileFields {
  vault_core_version?: number;
  vault_id?: unknown;
  claim_tx?: unknown;
  prover_circuit_version?: unknown;
  claimable_event_block_number?: unknown;
  babe_sessions?: Record<string, unknown>;
}

/**
 * Reads the small, self-describing fields of an artifacts file.
 *
 * This parses the whole JSON, so it is bounded by whatever the file carries
 * in `babe_sessions`. Keep those sessions in their own file: a bundle with
 * real sessions runs to hundreds of megabytes per challenger and cannot be
 * parsed in a browser tab.
 *
 * @throws If the file is not JSON, or lacks the fields every artifacts file
 *         has.
 */
export function summarizeWatchtowerArtifacts(
  artifactsJson: string,
): WatchtowerArtifactsSummary {
  let parsed: ArtifactsFileFields;
  try {
    parsed = JSON.parse(artifactsJson) as ArtifactsFileFields;
  } catch (cause) {
    throw new Error("Artifacts file is not valid JSON.", { cause });
  }

  const vaultId = requireString(parsed.vault_id, "vault_id");
  const claimTxHex = requireString(parsed.claim_tx, "claim_tx");
  const proverCircuitVersion = requireNumber(
    parsed.prover_circuit_version,
    "prover_circuit_version",
  );
  // Absent on files written before the field existed; the CLI reads an
  // absent value as 0, which means "not yet known from chain".
  const claimableEventBlockNumber =
    parsed.claimable_event_block_number === undefined
      ? 0
      : requireNumber(
          parsed.claimable_event_block_number,
          "claimable_event_block_number",
        );

  return {
    vaultCoreVersion: parsed.vault_core_version,
    vaultId,
    claimTxid: computeTxid(claimTxHex),
    proverCircuitVersion,
    claimableEventBlockNumber,
    babeSessionChallengerPubkeys: Object.keys(parsed.babe_sessions ?? {}),
  };
}

export interface AssertArtifactsUsableParams {
  artifactsJson: string;
  /** Vault the caller intends to claim, `0x`-prefixed or bare hex. */
  expectedVaultId: string;
  /**
   * Graph version to verify under. Defaults to the only version the format
   * exists for; pass it explicitly to fail loudly on a mismatched vault.
   */
  txGraphVersion?: number;
}

/**
 * Verifies an artifacts file and confirms it is the one for this vault.
 *
 * @throws {@link ArtifactsVaultMismatchError} when the file names a different
 *         vault, or a verification error when any bundled signature does not
 *         hold against the file's own graph.
 */
export async function assertArtifactsUsableForVault(
  params: AssertArtifactsUsableParams,
): Promise<WatchtowerArtifactsSummary> {
  const summary = summarizeWatchtowerArtifacts(params.artifactsJson);

  const expected = normalizeVaultId(params.expectedVaultId);
  const actual = normalizeVaultId(summary.vaultId);
  if (expected !== actual) {
    throw new ArtifactsVaultMismatchError(expected, actual);
  }

  await verifyWatchtowerArtifacts(
    params.txGraphVersion ?? DELEGATED_CLAIM_TX_GRAPH_VERSION,
    params.artifactsJson,
  );

  return summary;
}

function normalizeVaultId(vaultId: string): string {
  const bare = vaultId.startsWith("0x") ? vaultId.slice(2) : vaultId;
  return `0x${bare.toLowerCase()}`;
}

/** Display-order txid of the file's signed Claim transaction. */
function computeTxid(txHex: string): string {
  try {
    return Transaction.fromHex(txHex).getId();
  } catch (cause) {
    throw new Error("Artifacts file carries an unparseable claim_tx.", {
      cause,
    });
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Artifacts file is missing a usable "${field}".`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Artifacts file is missing a usable "${field}".`);
  }
  return value;
}
