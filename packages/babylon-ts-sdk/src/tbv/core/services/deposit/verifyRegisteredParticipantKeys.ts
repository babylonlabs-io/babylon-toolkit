/**
 * RFC-006 read-after-mine verification for a freshly registered vault.
 *
 * A new peg-in is built with each participant's *current* operation key, but
 * the vault does not freeze its key epochs until `submitPeginRequest` executes.
 * An operator rotating in that window would leave the registered vault bonded
 * to keys other than the ones baked into the Bitcoin lock we are about to
 * broadcast — BTC locked into a script no counterparty will presign.
 *
 * So after the registration mines and before the BTC broadcast, re-read the
 * vault's frozen epochs, re-resolve every participant against them, and assert
 * the result is byte-identical to what we built with.
 *
 * Deliberately a sibling of `verifyRegisteredVaultVersions` rather than an
 * extension of it: that function reads `getProtocolInfoBatch` through the
 * shared 13-field ABI and must stay there, while this one needs the extended
 * key-epoch ABI.
 *
 * @module services/deposit/verifyRegisteredParticipantKeys
 */

import type { Hex } from "viem";

import type {
  OperationKeyReader,
  VaultRegistryReader,
} from "../../clients/eth/types";
import { resolveParticipantKeysAtEpochs } from "../participants/resolveParticipantKeys";
import type { ParticipantKeySet } from "../participants/types";

/**
 * Participant operation keys drifted between building the Bitcoin artifacts
 * and the vault freezing its epochs.
 *
 * A *sibling* of `RegisteredVaultVersionMismatchError`, never a subclass, and
 * the distinction is load-bearing. On a version mismatch the orchestrator drops
 * the local pending-pegin record, because the on-chain `prePeginTxHash` is
 * still the authoritative copy of the transaction and a later resume can safely
 * broadcast it from the indexer.
 *
 * Key drift breaks exactly that assumption. The registered hash commits to a
 * transaction whose scripts embed the *pre-rotation* keys, while the vault
 * froze the *post-rotation* epoch — so every counterparty resolves a different
 * funding output and the deposit can never activate. Dropping the record would
 * discard `buildParticipantOperationKeys`, the only thing that lets the resume
 * path re-detect the drift; the next attempt would fall back to the indexer's
 * copy, pass the hash check, and broadcast the very transaction this refused,
 * locking BTC until the refund timelock.
 *
 * So: callers must keep the pending record when they catch this.
 */
export class ParticipantKeyDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParticipantKeyDriftError";
  }
}

// `instanceof` alone fails across module boundaries (duplicate SDK copies,
// test mocks). Fall back to the name field, as the version guard does.
export function isParticipantKeyDriftError(
  err: unknown,
): err is ParticipantKeyDriftError {
  return (
    err instanceof ParticipantKeyDriftError ||
    (err instanceof Error && err.name === "ParticipantKeyDriftError")
  );
}

export interface VerifyRegisteredParticipantKeysParams {
  vaultRegistryReader: VaultRegistryReader;
  operationKeyReader: OperationKeyReader;
  vaultIds: readonly Hex[];
  /**
   * The exact key set the BTC artifacts were built with. Its `query` supplies
   * the rosters to re-resolve against — deliberately reused rather than
   * accepted as a separate argument, so the two can never disagree and a
   * roster that moved since the build cannot be misreported as a key drift.
   */
  expected: ParticipantKeySet;
}

function diffKeys(
  label: string,
  expected: readonly string[],
  actual: readonly string[],
): string | null {
  if (
    expected.length === actual.length &&
    expected.every((k, i) => k === actual[i])
  ) {
    return null;
  }
  return `${label} expected [${expected.join(", ")}], got [${actual.join(", ")}]`;
}

export async function verifyRegisteredParticipantKeys(
  params: VerifyRegisteredParticipantKeysParams,
): Promise<void> {
  const { vaultRegistryReader, operationKeyReader, vaultIds, expected } =
    params;
  const query = expected.query;

  if (vaultIds.length === 0) return;

  // Batch registration gives every sibling vault the same epochs, so these
  // reads are redundant across siblings. Kept per-vault anyway: it is one
  // multicall, and asserting each vault individually is what makes the error
  // name the vault that drifted.
  const epochsPerVault =
    await vaultRegistryReader.getVaultKeyEpochsBatch(vaultIds);

  const mismatches: string[] = [];

  for (const [i, epochs] of epochsPerVault.entries()) {
    const vaultId = vaultIds[i];

    let resolved: ParticipantKeySet;
    try {
      resolved = await resolveParticipantKeysAtEpochs({
        operationKeyReader,
        query,
        epochs,
      });
    } catch (error) {
      // A resolution failure here is itself a mismatch signal: the frozen
      // epochs point at a key set we cannot reconstruct, so broadcasting
      // would be worse than aborting.
      mismatches.push(
        `vault ${vaultId}: could not resolve participants at frozen epochs ` +
          `(vp=${epochs.vpKeyEpoch}, keeper=${epochs.appKeeperKeyEpoch}, ` +
          `uc=${epochs.ucKeyEpoch}): ${(error as Error).message}`,
      );
      continue;
    }

    if (
      resolved.vaultProvider.operationBtcPubkey !==
      expected.vaultProvider.operationBtcPubkey
    ) {
      mismatches.push(
        `vault ${vaultId}: vault provider key expected ` +
          `${expected.vaultProvider.operationBtcPubkey}, got ` +
          `${resolved.vaultProvider.operationBtcPubkey}`,
      );
    }

    const keeperDiff = diffKeys(
      `vault ${vaultId}: vault keeper keys`,
      expected.vaultKeeperOperationKeysSorted,
      resolved.vaultKeeperOperationKeysSorted,
    );
    if (keeperDiff) mismatches.push(keeperDiff);

    const challengerDiff = diffKeys(
      `vault ${vaultId}: universal challenger keys`,
      expected.universalChallengerOperationKeysSorted,
      resolved.universalChallengerOperationKeysSorted,
    );
    if (challengerDiff) mismatches.push(challengerDiff);
  }

  if (mismatches.length > 0) {
    throw new ParticipantKeyDriftError(
      `Aborting BTC broadcast: participant operation keys changed during registration ` +
        `(${mismatches.join("; ")}). The Pre-PegIn was not broadcast; the registered ` +
        `ETH vault will time out per protocol rules.`,
    );
  }
}
