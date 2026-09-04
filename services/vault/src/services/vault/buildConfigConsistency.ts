/**
 * Guard that the parameters the deposit form validated against are the same
 * parameters the Bitcoin lock is about to be built from.
 *
 * The form reads the peg-in configuration from the React Query context — a
 * cached snapshot with a five minute `staleTime` that nothing invalidates. The
 * build re-reads it from chain, pinned to a block. Those two are normally the
 * same, and before the build was pinned they could not diverge at all, because
 * both halves read one object.
 *
 * They can diverge now. A governance change landing between the cache being
 * filled and the deposit being built leaves the form having gated and sized
 * against one parameter set while the lock commits to another. Two consequences
 * are already reachable today:
 *
 * - The form's "update the app" gate compares the *cached* vault core version
 *   against what this bundle's WASM can construct. Nothing re-checks it on the
 *   fresh-deposit path — `assertVaultCoreVersionSupported` is wired into the
 *   resume, payout and refund paths only — so a version bump inside the window
 *   lets the build reach the WASM with a version it cannot construct, and the
 *   depositor gets a raw facade error after completing a signing ceremony
 *   rather than the actionable message that exists for exactly this case.
 * - The Max button reserves fees from the cached rates while the build funds
 *   from the pinned ones, so a rate rise inside the window can leave the
 *   deposit short and fail in UTXO selection after the amount is committed.
 *
 * Both are fail-closed — nothing is signed, broadcast or paid — so this guard
 * is about turning a confusing failure into a clear one, not about protecting
 * funds. It runs before the build for that reason: at this point restarting
 * costs the depositor nothing, unlike the post-registration drift guards, where
 * a restart means a stranded vault and a spent fee.
 *
 * @module services/vault/buildConfigConsistency
 */

import type { PegInConfiguration } from "@babylonlabs-io/ts-sdk/tbv/core";

/**
 * The cached configuration the form used and the pinned configuration the build
 * would use describe different protocol parameter sets.
 */
export class BuildConfigDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildConfigDriftError";
  }
}

// `instanceof` alone fails across module boundaries (duplicate copies, test
// mocks). Fall back to the name field, as the SDK's drift guards do.
export function isBuildConfigDriftError(
  err: unknown,
): err is BuildConfigDriftError {
  return (
    err instanceof BuildConfigDriftError ||
    (err instanceof Error && err.name === "BuildConfigDriftError")
  );
}

/**
 * Throw when the form's cached configuration and the build's pinned
 * configuration disagree on either version axis.
 *
 * Only the two version fields are compared, and deliberately so. They are the
 * identifiers the protocol itself uses to say "these parameters changed": every
 * field of the `offchainParams` struct moves under `offchainParamsVersion`, and
 * the transaction shape moves under `activeVaultCoreVersion`. Comparing the
 * individual values instead would be both redundant and more brittle, since a
 * value can be re-published unchanged under a new version.
 *
 * What that does NOT cover: `PegInConfiguration` is composed from two contract
 * reads, and the `getTBVProtocolParams` half — `minimumPegInAmount`,
 * `maxPegInAmount`, `pegInAckTimeout`, `pegInActivationTimeout`,
 * `maxHtlcOutputCount`, `expiredPegInGraceBlocks` — carries no version label at
 * all, so a change there moves no field this guard reads. The deposit amount is
 * gated against the cached `minimumPegInAmount` / `maxPegInAmount` before this
 * runs, so a bound tightened inside the cache window gets past this guard
 * untouched.
 *
 * That axis is deliberately out of scope *for this guard*, which exists to close
 * the divergence that pinning introduced — between the two snapshots, not
 * between a snapshot and the chain. It is now covered, one call site later, by
 * `assertBuildWithinPinnedLimits` in `./pinnedBuildLimits`, which re-validates
 * the chosen amounts and the vault count against the pinned read rather than
 * comparing the bounds (a bound that moves *up* leaves the chosen amount valid,
 * so comparing them would abort a deposit that has nothing wrong with it).
 *
 * @param buildConfig - Read from chain, pinned to the build's block.
 * @param formConfig - The cached snapshot the form gated and sized against.
 * @throws {BuildConfigDriftError} when the two disagree.
 */
export function assertBuildConfigMatchesForm(
  buildConfig: PegInConfiguration,
  formConfig: PegInConfiguration,
): void {
  if (
    buildConfig.offchainParamsVersion === formConfig.offchainParamsVersion &&
    buildConfig.activeVaultCoreVersion === formConfig.activeVaultCoreVersion
  ) {
    return;
  }

  throw new BuildConfigDriftError(
    `Protocol parameters changed while preparing this deposit: the form used ` +
      `offchainParams v${formConfig.offchainParamsVersion} / vaultCore ` +
      `v${formConfig.activeVaultCoreVersion}, the chain now reports ` +
      `offchainParams v${buildConfig.offchainParamsVersion} / vaultCore ` +
      `v${buildConfig.activeVaultCoreVersion}.`,
  );
}
