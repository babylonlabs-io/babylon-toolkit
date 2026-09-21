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
import {
  assertClaimSpendsVault,
  normalizeVaultId,
  peginTxidFromClaimTx,
} from "./vaultIdBinding";

/**
 * Graph version the delegated-claim artifacts format exists for. Vaults on
 * graph v1 and v2 predate it and have no artifacts path at all.
 */
export const DELEGATED_CLAIM_TX_GRAPH_VERSION = 3;

/**
 * Thrown when an artifacts file does not describe the vault being claimed.
 *
 * @experimental
 */
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
  vault_core_version?: unknown;
  vault_id?: unknown;
  claim_tx?: unknown;
  prover_circuit_version?: unknown;
  claimable_event_block_number?: unknown;
  babe_sessions?: unknown;
}

/**
 * Reads the small, self-describing fields of an artifacts file.
 *
 * This parses the whole JSON, so it is bounded by whatever the file carries
 * in `babe_sessions`. Keep those sessions in their own file: a bundle with
 * real sessions runs to hundreds of megabytes per challenger and cannot be
 * parsed in a browser tab.
 *
 * Experimental: this API can change in a minor release. Pin the SDK
 * version if you build on it.
 *
 * @throws If the file is not JSON, or lacks the fields every artifacts file
 *         has.
 * @experimental
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
  const claimTx = parseClaimTx(requireString(parsed.claim_tx, "claim_tx"));
  const proverCircuitVersion = requireSafeInteger(
    parsed.prover_circuit_version,
    "prover_circuit_version",
  );
  // Absent on files written before the field existed; the CLI reads an
  // absent value as 0, which means "not yet known from chain". Anything
  // present must be a block number: `JSON.parse` has already rounded
  // anything above 2^53, and a negative or fractional value would otherwise
  // reach `BigInt` and throw without naming the field.
  const claimableEventBlockNumber =
    parsed.claimable_event_block_number === undefined
      ? 0n
      : BigInt(
          requireSafeInteger(
            parsed.claimable_event_block_number,
            "claimable_event_block_number",
          ),
        );

  return {
    vaultCoreVersion:
      parsed.vault_core_version === undefined
        ? undefined
        : requireSafeInteger(parsed.vault_core_version, "vault_core_version"),
    vaultId,
    claimTxid: claimTx.getId(),
    peginTxid: peginTxidFromClaimTx(claimTx),
    proverCircuitVersion,
    claimableEventBlockNumber,
    babeSessionChallengerPubkeys: Object.keys(
      requireRecord(parsed.babe_sessions, "babe_sessions"),
    ),
  };
}

/**
 * The file to check, and the vault it must belong to.
 *
 * @experimental
 */
export interface AssertArtifactsUsableParams {
  artifactsJson: string;
  /** Vault the caller intends to claim, `0x`-prefixed or bare hex. */
  expectedVaultId: string;
  /**
   * Depositor's Ethereum address, used with the file's PegIn txid to
   * re-derive the vault id. Without it the only check would be the file's
   * self-declared `vault_id`.
   */
  depositorEthAddress: string;
  /**
   * Graph version to verify under. Defaults to the only version the format
   * exists for; pass it explicitly to fail loudly on a mismatched vault.
   */
  txGraphVersion?: number;
}

/**
 * Verifies an artifacts file and confirms it is the one for this vault.
 *
 * Experimental: this API can change in a minor release. Pin the SDK
 * version if you build on it.
 *
 * @throws {@link ArtifactsVaultMismatchError} when the file names a different
 *         vault, {@link VaultIdBindingError} when the graph it carries
 *         belongs to another vault whatever the file says, or a verification
 *         error when any bundled signature does not hold against that graph.
 * @experimental
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

  // `vault_id` is a field the file declares about itself, and the Rust
  // verification only hex-normalizes it. This re-derives the id from the
  // graph the file actually carries, which catches a file whose graph
  // belongs to another vault however it was produced.
  assertClaimSpendsVault({
    peginTxid: summary.peginTxid,
    depositorEthAddress: params.depositorEthAddress,
    expectedVaultId: expected,
  });

  // A file assembled before the Ethereum withdrawal was initiated carries
  // zero here. `vaultd vp wt start-claim` would then ask the prover to prove
  // the wrong block and fail before Assert, so a function named "usable"
  // refuses it rather than passing the problem downstream. Nothing in the SDK
  // fills the field in later — reassemble the file instead.
  if (summary.claimableEventBlockNumber === 0n) {
    throw new Error(
      "Artifacts carry no claimable event block number. They were assembled " +
        "before the Ethereum withdrawal was initiated; assemble them again.",
    );
  }

  await verifyWatchtowerArtifacts(
    params.txGraphVersion ?? DELEGATED_CLAIM_TX_GRAPH_VERSION,
    params.artifactsJson,
  );

  return summary;
}

function parseClaimTx(txHex: string): Transaction {
  try {
    return Transaction.fromHex(txHex);
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

/**
 * A count or a block height: never negative, never fractional, and inside
 * the range `JSON.parse` can represent without silently rounding.
 */
function requireSafeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Artifacts file is missing a usable "${field}".`);
  }
  return value;
}

/**
 * A JSON object, not a string or an array — `Object.keys` on either reports
 * index positions, which would pass as challenger public keys.
 */
function requireRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Artifacts file is missing a usable "${field}".`);
  }
  return value as Record<string, unknown>;
}
