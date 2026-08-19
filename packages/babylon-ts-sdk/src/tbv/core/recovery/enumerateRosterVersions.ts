/**
 * Enumerate every historical vault-keeper and universal-challenger roster
 * version (#2203).
 *
 * A reorg destroys the vault row's roster version stamps, but both rosters are
 * read by version, not by `vaultId`, so every historical version survives. The
 * contracts expose a per-version getter and a latest-version getter but no
 * batch helper — `fetchAllOffchainParams` is the only enumeration that already
 * exists — so these two `1..latest` loops are what recovery adds.
 *
 * Neither loop trusts the indexer: `fetchAllUniversalChallengers` on the
 * indexer would enumerate the same data, but it is unpaginated and
 * indexer-sourced, which every other signing-critical path here refuses.
 *
 * @module recovery/enumerateRosterVersions
 */

import type { Address } from "viem";

import type {
  UniversalChallengerReader,
  VaultKeeperReader,
} from "../clients/eth/types";
import { stripHexPrefix } from "../primitives/utils/bitcoin";

/** The lowest roster version the contracts assign; version 0 means "none yet". */
const FIRST_ROSTER_VERSION = 1;

export interface RosterVersionSnapshot {
  version: number;
  /** x-only BTC pubkeys, `0x` stripped, in the contract's stored order. */
  btcPubkeys: string[];
}

/**
 * Observer invoked once per version that could not be resolved into a usable
 * roster. Mirrors `fetchAllOffchainParams`'s `onSkippedVersion` so callers can
 * telemeter without the SDK depending on a logger.
 *
 * A skipped version is UNRESOLVABLE, never absent: dropping it silently would
 * shrink the search space and turn a recoverable deposit into "no candidate
 * matched".
 */
export type OnSkippedRosterVersion = (version: number, error: Error) => void;

async function enumerateVersions(
  latestVersion: number,
  read: (version: number) => Promise<{ btcPubKey: string }[]>,
  label: string,
  onSkippedVersion?: OnSkippedRosterVersion,
): Promise<RosterVersionSnapshot[]> {
  const snapshots: RosterVersionSnapshot[] = [];
  for (
    let version = FIRST_ROSTER_VERSION;
    version <= latestVersion;
    version++
  ) {
    try {
      const roster = await read(version);
      if (roster.length === 0) {
        throw new Error(
          `${label} version ${version} resolved to an empty roster`,
        );
      }
      snapshots.push({
        version,
        btcPubkeys: roster.map((entry) => stripHexPrefix(entry.btcPubKey)),
      });
    } catch (error) {
      onSkippedVersion?.(
        version,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
  return snapshots;
}

/**
 * Read every vault-keeper roster version `1..getCurrentVaultKeepersVersion`
 * for one application entry point.
 */
export async function enumerateVaultKeeperVersions(
  reader: VaultKeeperReader,
  appEntryPoint: Address,
  onSkippedVersion?: OnSkippedRosterVersion,
): Promise<RosterVersionSnapshot[]> {
  const latestVersion =
    await reader.getCurrentVaultKeepersVersion(appEntryPoint);
  return enumerateVersions(
    latestVersion,
    (version) => reader.getVaultKeepersByVersion(appEntryPoint, version),
    "Vault keeper",
    onSkippedVersion,
  );
}

/**
 * Read every universal-challenger roster version
 * `1..getLatestUniversalChallengersVersion`.
 */
export async function enumerateUniversalChallengerVersions(
  reader: UniversalChallengerReader,
  onSkippedVersion?: OnSkippedRosterVersion,
): Promise<RosterVersionSnapshot[]> {
  const latestVersion = await reader.getLatestUniversalChallengersVersion();
  return enumerateVersions(
    latestVersion,
    (version) => reader.getUniversalChallengersByVersion(version),
    "Universal challenger",
    onSkippedVersion,
  );
}
