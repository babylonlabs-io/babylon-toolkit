/**
 * The candidate parameter space `reconstructPeginParams` searches (#2203).
 *
 * A reorg destroys the vault row's version stamps but not the versioned data
 * they point at: `getOffchainParamsByVersion`, `getVaultKeepersByVersion` and
 * `getUniversalChallengersByVersion` are keyed by version, not by `vaultId`,
 * and survive. So the stamps are recoverable by enumeration.
 *
 * Two parameters are deliberately NOT axes here.
 *
 * `vaultCoreVersion` is supplied, not searched. The Pre-PegIn carries no
 * evidence of it: `getPrePeginHtlcConnectorInfo` produces a byte-identical
 * scriptPubKey for v1 and v2, and the version's only other effect on the
 * transaction is the size of the reserve folded into the HTLC value — which
 * the search inverts back out of that same value, so it matches by
 * construction. Enumerating it would guarantee an ambiguous result rather than
 * narrow one. See `__tests__/reconstructPeginParams.test.ts`, which pins the
 * identical-scriptPubKey fact so a future graph version that DOES change the
 * connector fails loudly here.
 *
 * The RFC-006 operation-key epochs are not enumerable at all. Every
 * epoch-keyed read needs `getVaultKeyEpochs(vaultId)` — the destroyed row —
 * and no ABI in this repo exposes an epoch history, a counter, or an event.
 * Only the genesis keys and the operators' current keys are reachable, which
 * is why {@link KeyEpochPolicy} has exactly two values and why they apply to
 * the whole participant set at once: a vault whose participants rotated more
 * than once since creation cannot be reconstructed.
 *
 * @module recovery/peginParamsCandidates
 */

import type { Address } from "viem";

/** One versioned offchain-params snapshot, flattened to what a trial needs. */
export interface OffchainParamsCandidate {
  /** `offchainParamsVersion` stamp this snapshot would restore. */
  version: number;
  /** `VersionedOffchainParams.feeRate`. */
  protocolFeeRate: bigint;
  minPeginFeeRate: bigint;
  councilQuorum: number;
  /** `VersionedOffchainParams.securityCouncilKeys.length`. */
  councilSize: number;
  /** `getTimelockPeginByVersion(version)` — not a field on the params struct. */
  timelockPegin: number;
  timelockAssert: number;
  /** `VersionedOffchainParams.tRefund` — the only scalar here that reaches the HTLC scriptPubKey. */
  timelockRefund: number;
}

/**
 * One participant key set: a vault provider plus the two rosters at the
 * versions the vault was stamped with.
 *
 * Every key here must be an RFC-006 **operation** key resolved at that
 * participant's own key epoch, and the two roster arrays must be sorted —
 * exactly what `resolveParticipantKeysAtEpochs` produces as
 * `vaultKeeperOperationKeysSorted` / `universalChallengerOperationKeysSorted`.
 * Registration keys are NOT interchangeable: they only coincide with operation
 * keys while nobody has rotated, so passing them yields a wrong script on every
 * candidate and a not-found that wrongly implies the true set was tried.
 *
 * The three epochs are stamped independently by three registries, so a mixed
 * state — the vault provider rotated before this deposit, a challenger after —
 * is ordinary rather than impossible. That is why epochs are resolved per
 * participant from the `PegInSubmitted` log rather than chosen as one
 * all-genesis or all-current policy.
 */
export interface ParticipantKeySetCandidate {
  vaultProvider: Address;
  /** x-only operation-key hex (no `0x`) at the vault's `vpKeyEpoch`. */
  vaultProviderBtcPubkey: string;
  appVaultKeepersVersion: number;
  /** Sorted operation keys at the vault's `appKeeperKeyEpoch`. */
  vaultKeeperBtcPubkeys: readonly string[];
  universalChallengersVersion: number;
  /** Sorted operation keys at the vault's `ucKeyEpoch`. */
  universalChallengerBtcPubkeys: readonly string[];
}

/** A fully-determined parameter set to trial against the funded Pre-PegIn. */
export interface PeginParamsCandidate {
  /**
   * Stamped tx-graph version (NOT the chain-active one). Carried so the result
   * describes itself, but constant across a candidate space — see the module
   * note on why it cannot be searched.
   */
  vaultCoreVersion: number;
  offchainParams: OffchainParamsCandidate;
  participants: ParticipantKeySetCandidate;
}

export interface BuildPeginParamsCandidatesInput {
  /**
   * The tx-graph version the stranded deposit was built with. A scalar, not a
   * list: the transaction cannot discriminate it, so this is taken on trust.
   * Read it from the orphaned `PegInSubmitted` log — `activeVaultCoreVersion()`
   * is the current version and is wrong for any deposit that predates a bump.
   */
  vaultCoreVersion: number;
  offchainParams: readonly OffchainParamsCandidate[];
  participantKeySets: readonly ParticipantKeySetCandidate[];
}

/**
 * Expand the two searchable axes into the flat candidate list
 * `reconstructPeginParams` trials.
 *
 * With the parameters read from the `PegInSubmitted` log this is called with
 * one entry per axis and produces a single candidate to verify. The
 * multi-element form is the fallback search.
 */
export function buildPeginParamsCandidates(
  input: BuildPeginParamsCandidatesInput,
): PeginParamsCandidate[] {
  const { vaultCoreVersion, offchainParams, participantKeySets } = input;
  if (!Number.isInteger(vaultCoreVersion) || vaultCoreVersion < 1) {
    throw new Error(
      `buildPeginParamsCandidates: vaultCoreVersion must be a positive integer, got ${vaultCoreVersion}`,
    );
  }
  if (offchainParams.length === 0) {
    throw new Error(
      "buildPeginParamsCandidates: at least one offchain-params version is required",
    );
  }
  if (participantKeySets.length === 0) {
    throw new Error(
      "buildPeginParamsCandidates: at least one participant key set is required",
    );
  }

  const candidates: PeginParamsCandidate[] = [];
  for (const params of offchainParams) {
    for (const participants of participantKeySets) {
      candidates.push({
        vaultCoreVersion,
        offchainParams: params,
        participants,
      });
    }
  }
  return candidates;
}

/** Which enumeration a version belongs to. */
export type CandidateAxis =
  | "offchainParams"
  | "vaultKeepers"
  | "universalChallengers";

/**
 * A version the caller enumerated over but could not resolve into candidate
 * data — dropped by `fetchAllOffchainParams`'s validation, or reported to a
 * roster loop's `onSkippedVersion` observer.
 *
 * Recorded rather than ignored because an unresolved version is UNRESOLVABLE,
 * not absent: it may be the very version that stamped the stranded vault, and
 * a search space missing its answer can still return a confident look-alike.
 */
export interface UnresolvedVersion {
  axis: CandidateAxis;
  version: number;
  reason: string;
}

/** Compact identity of an unresolved version, for error messages. */
export function describeUnresolvedVersion(
  unresolved: UnresolvedVersion,
): string {
  return `${unresolved.axis} v${unresolved.version} (${unresolved.reason})`;
}

/** Compact identity of a candidate, for error messages and result labels. */
export function describePeginParamsCandidate(
  candidate: PeginParamsCandidate,
): string {
  const { participants } = candidate;
  return (
    `core=${candidate.vaultCoreVersion} ` +
    `offchain=${candidate.offchainParams.version} ` +
    `keepers=${participants.appVaultKeepersVersion} ` +
    `challengers=${participants.universalChallengersVersion} ` +
    `vp=${participants.vaultProvider}`
  );
}
