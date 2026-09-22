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
import { BABE_SESSION_PLACEHOLDER_DECRYPTOR_HEX } from "./types";
import {
  assertClaimSpendsVault,
  normalizeVaultId,
  peginTxidFromClaimTx,
} from "./vaultIdBinding";
import { normalizeVerifyingKeyHex } from "./verifyingKeyBinding";

/**
 * Graph version the delegated-claim artifacts format exists for. Vaults on
 * graph v1 and v2 predate it and have no artifacts path at all.
 *
 * @experimental
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
  verifying_key?: unknown;
  babe_sessions?: unknown;
}

/**
 * The challengers a file carries sessions for, and those whose session is
 * still the placeholder.
 *
 * btc-vault requires each value to be an object whose
 * `decryptor_artifacts_hex` is a non-empty hex string
 * (`delegated_claim.rs:473-483` @ ac4954e7); anything else would reach the
 * Rust verifier as an opaque failure.
 */
function readBabeSessions(value: unknown): {
  challengerPubkeys: string[];
  placeholderChallengerPubkeys: string[];
} {
  const sessions = requireRecord(value, "babe_sessions");
  const placeholderChallengerPubkeys: string[] = [];
  for (const [challengerPubkey, session] of Object.entries(sessions)) {
    const artifactsHex =
      typeof session === "object" && session !== null
        ? (session as { decryptor_artifacts_hex?: unknown })
            .decryptor_artifacts_hex
        : undefined;
    if (typeof artifactsHex !== "string" || artifactsHex.length === 0) {
      throw new Error(
        `Artifacts file is missing a usable "babe_sessions": the entry for ` +
          `${challengerPubkey} carries no "decryptor_artifacts_hex" string.`,
      );
    }
    if (artifactsHex === BABE_SESSION_PLACEHOLDER_DECRYPTOR_HEX) {
      placeholderChallengerPubkeys.push(challengerPubkey);
    }
  }
  return {
    challengerPubkeys: Object.keys(sessions),
    placeholderChallengerPubkeys,
  };
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

  const babeSessions = readBabeSessions(parsed.babe_sessions);

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
    // Required: btc-vault's builder always writes it
    // (`delegated_claim.rs:514` @ ac4954e7), so an absent one is not a file
    // this SDK or the CLI produced.
    verifyingKeyHex: requireString(parsed.verifying_key, "verifying_key"),
    babeSessionChallengerPubkeys: babeSessions.challengerPubkeys,
    babeSessionPlaceholderChallengerPubkeys:
      babeSessions.placeholderChallengerPubkeys,
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
   * The Groth16 verifying key for the vault's `proverCircuitVersion`, from
   * the `vault-provers` release or the prover service — never from the vault
   * provider or anything it serves (btc-vault `delegated_claim.rs:405-414`
   * @ ac4954e7). A file carrying a different key proves nothing at Assert.
   */
  trustedVerifyingKeyHex: string;
  /**
   * The vault's stamped `proverCircuitVersion`, from
   * `DelegatedClaimVaultContext`. btc-vault's verifier never reads the
   * file's own `prover_circuit_version` — `delegated_claim.rs:864` @ ac4954e7
   * only writes it — while `vaultd`'s
   * `crates/vaultd/src/cli/command/watchtower/start_claim.rs:266-278` hands
   * the file's key and version to the prover together, so a wrong version
   * fails there, before Assert.
   */
  expectedProverCircuitVersion: number;
  /**
   * Graph version to verify under. Defaults to the only version the format
   * exists for. A file that records a different `vault_core_version` is
   * rejected rather than verified under this one.
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
 *         belongs to another vault whatever the file says, a plain error when
 *         its `prover_circuit_version` is not `expectedProverCircuitVersion`,
 *         its `verifying_key` is not `trustedVerifyingKeyHex` or any BaBe
 *         session is still the placeholder, or a verification error when any
 *         bundled signature does not hold against that graph.
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

  // Verifying a file under a version it does not claim yields, at best, an
  // opaque Rust error. The file states its own version, so compare it.
  const resolved = params.txGraphVersion ?? DELEGATED_CLAIM_TX_GRAPH_VERSION;
  if (
    summary.vaultCoreVersion !== undefined &&
    summary.vaultCoreVersion !== resolved
  ) {
    throw new Error(
      `Artifacts record vault core version ${summary.vaultCoreVersion}, ` +
        `but verification was asked for version ${resolved}.`,
    );
  }

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

  // Nothing verifies this field: btc-vault only writes it
  // (`delegated_claim.rs:864` @ ac4954e7), and `vaultd` hands it to the prover
  // beside the file's key (`start_claim.rs:266-278` @ ac4954e7), so a wrong
  // one fails only at start-claim, before Assert.
  if (summary.proverCircuitVersion !== params.expectedProverCircuitVersion) {
    throw new Error(
      `Artifacts record prover circuit version ${summary.proverCircuitVersion} but the vault's ` +
        `stamped params say ${params.expectedProverCircuitVersion}; a proof for the wrong circuit ` +
        `fails at start-claim, so refusing the file.`,
    );
  }

  // The Rust verification takes the key opaquely, so a substituted one would
  // let a proof the depositor never authorized pass the pre-Assert check
  // (btc-vault `delegated_claim.rs:405-414` @ ac4954e7).
  const fileVerifyingKey = normalizeVerifyingKeyHex(
    summary.verifyingKeyHex,
    'Artifacts file "verifying_key"',
  );
  const trustedVerifyingKey = normalizeVerifyingKeyHex(
    params.trustedVerifyingKeyHex,
    "trustedVerifyingKeyHex",
  );
  if (fileVerifyingKey !== trustedVerifyingKey) {
    throw new Error(
      `Artifacts carry Groth16 verifying key ${fileVerifyingKey} but the trusted key for ` +
        `prover circuit version ${params.expectedProverCircuitVersion} is ${trustedVerifyingKey}; ` +
        `refusing a file whose proof would verify under a substituted key.`,
    );
  }

  // btc-vault checks a session only for shape and non-empty hex
  // (`delegated_claim.rs:470-493` @ ac4954e7), so a placeholder file verifies
  // yet cannot answer that challenger.
  const [placeholderChallenger] =
    summary.babeSessionPlaceholderChallengerPubkeys;
  if (placeholderChallenger !== undefined) {
    throw new Error(
      `Artifacts carry a placeholder BaBe session for challenger ${placeholderChallenger}; ` +
        `join the real sessions into the file before using it (#2598).`,
    );
  }

  await verifyWatchtowerArtifacts(resolved, params.artifactsJson);

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
