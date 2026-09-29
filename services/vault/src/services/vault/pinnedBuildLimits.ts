/**
 * Guard that the amounts the depositor approved, and the number of vaults they
 * asked for, are still within the protocol limits the chain is publishing right
 * now — not the ones the form happened to have cached.
 *
 * ## Why this is separate from `buildConfigConsistency`
 *
 * That guard compares two *snapshots* to each other: the cached configuration
 * the form gated on, and the pinned one the build uses. This guard compares the
 * depositor's *choices* against a single snapshot. Different relation, so a
 * separate module — and `assertBuildConfigMatchesForm` explicitly scopes this
 * axis out and points here.
 *
 * ## The gap it closes
 *
 * `PegInConfiguration` is assembled from two contract reads. The
 * `getLatestOffchainParams` half carries a version label; the
 * `getTBVProtocolParams` half — `minimumPegInAmount`, `maxPegInAmount`,
 * `maxHtlcOutputCount` and three timeouts — carries none. So a governance
 * change to any of those moves no field `assertBuildConfigMatchesForm` reads,
 * and it passes.
 *
 * The amounts are bound-checked once, early in the flow, against the cached
 * React Query configuration — a snapshot with a five minute `staleTime` that
 * nothing invalidates. If a bound tightened after that snapshot was taken, the
 * build proceeds and the registration reverts on-chain, after the depositor has
 * completed a signing ceremony. This runs against the pinned read instead, so
 * the deposit stops while restarting is still free.
 *
 * ## Re-validate the choices, do not compare the bounds
 *
 * Comparing the cached bounds against the pinned ones is the wrong test, and
 * deliberately not what this does. A `maxPegInAmount` that moves *up* makes the
 * two differ while leaving the chosen amount perfectly valid, so a comparison
 * would abort a deposit that had nothing wrong with it. Re-validating the
 * amounts catches a bound that tightened and ignores one that loosened.
 *
 * @module services/vault/pinnedBuildLimits
 */

import type { PegInConfiguration } from "@babylonlabs-io/ts-sdk/tbv/core";
import { validateVaultAmounts } from "@babylonlabs-io/ts-sdk/tbv/core/services";

/**
 * Which limit was exceeded. Carried on the error because the two need different
 * copy: an amount outside the bounds is fixed by entering a different amount,
 * a vault count over the cap by not splitting. One message covering both would
 * give the wrong instruction for whichever case it was not written for.
 */
export type BuildLimitsDriftReason = "amount-bounds" | "vault-count";

/**
 * The depositor's amounts or vault count fall outside the protocol limits read
 * at the build's pinned block.
 */
export class BuildLimitsDriftError extends Error {
  readonly reason: BuildLimitsDriftReason;

  constructor(message: string, reason: BuildLimitsDriftReason) {
    super(message);
    this.name = "BuildLimitsDriftError";
    this.reason = reason;
  }
}

// `instanceof` alone fails across module boundaries (duplicate copies, test
// mocks). Fall back to the name field, as the sibling drift guards do.
export function isBuildLimitsDriftError(
  err: unknown,
): err is BuildLimitsDriftError {
  return (
    err instanceof BuildLimitsDriftError ||
    (err instanceof Error && err.name === "BuildLimitsDriftError")
  );
}

/**
 * The caller handed this guard something it cannot judge — no amounts at all,
 * or a non-positive one.
 *
 * Typed rather than a plain `Error` so `mapDepositError` recognises it: the
 * mapper's last resort renders an unrecognised message straight into the
 * callout, which would put an internal function name in front of a depositor.
 * The detail stays on the error for the bug report.
 */
export class BuildPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildPreconditionError";
  }
}

// Name fallback for cross-realm recognition, as the sibling guards do.
export function isBuildPreconditionError(
  err: unknown,
): err is BuildPreconditionError {
  return (
    err instanceof BuildPreconditionError ||
    (err instanceof Error && err.name === "BuildPreconditionError")
  );
}

/**
 * Throw when the chosen amounts or the vault count exceed the pinned limits.
 *
 * The bounds comparison delegates to the SDK's {@link validateVaultAmounts} —
 * the same function the flow already ran against the cached bounds earlier —
 * rather than being re-derived here. Two gates that must agree on what "within
 * bounds" means should not each own a copy of it, and the bounds are inclusive
 * at both ends, which is easy to get subtly wrong on a second writing.
 *
 * It is called per leg rather than over the whole array, for two reasons. It
 * yields the index, so the message can name the offending BTCVault without
 * quoting the SDK's string. And it leaves the validator's non-bounds failures —
 * an empty array, a non-positive leg — to the explicit checks below, which
 * throw {@link BuildPreconditionError}. Those are application bugs, not
 * governance changes, and tagging them as drift would tell the depositor the
 * chain moved and send them to change an amount that was never the problem.
 *
 * No vault amount is interpolated into any message here. The flow hands a
 * thrown error straight to `logger.error`, which scrubs only the console mirror
 * and passes the message to Sentry verbatim; a precise deposit amount is
 * depositor-identifying, which is the rule `telemetryEvents.amountBucket`
 * states. The bounds themselves are public protocol parameters and are safe to
 * name.
 *
 * The SDK validator documents vault-count limits as the caller's
 * responsibility, so the `maxHtlcOutputCount` check lives here. Every vault in
 * a batch is one HTLC output in the single Pre-PegIn transaction, so the vault
 * count is the output count the contract bounds.
 *
 * @param vaultAmounts - Per-vault amounts in satoshis, one entry per vault.
 * @param buildConfig - Configuration read at the build's pinned block.
 * @throws {BuildLimitsDriftError} when a limit read at the pinned block
 *   excludes what the depositor approved.
 * @throws {BuildPreconditionError} when `vaultAmounts` is empty or holds a
 *   non-positive leg — caller bugs, deliberately not tagged as drift.
 */
export function assertBuildWithinPinnedLimits(
  vaultAmounts: bigint[],
  buildConfig: PegInConfiguration,
): void {
  if (vaultAmounts.length === 0) {
    throw new BuildPreconditionError(
      "assertBuildWithinPinnedLimits requires at least one vault amount",
    );
  }

  vaultAmounts.forEach((amount, index) => {
    if (amount <= 0n) {
      throw new BuildPreconditionError(
        `assertBuildWithinPinnedLimits: vault amount at index ${index} must be positive`,
      );
    }

    const leg = validateVaultAmounts(
      [amount],
      buildConfig.minimumPegInAmount,
      buildConfig.maxPegInAmount,
    );

    if (!leg.valid) {
      throw new BuildLimitsDriftError(
        `Deposit limits changed while preparing this deposit: BTCVault ` +
          `${index + 1} of ${vaultAmounts.length} falls outside the range the ` +
          `chain now reports, ${buildConfig.minimumPegInAmount} to ` +
          `${buildConfig.maxPegInAmount} satoshis per BTCVault.`,
        "amount-bounds",
      );
    }
  });

  if (vaultAmounts.length > buildConfig.maxHtlcOutputCount) {
    throw new BuildLimitsDriftError(
      `Deposit limits changed while preparing this deposit: this deposit needs ` +
        `${vaultAmounts.length} HTLC outputs, and the chain now allows at most ` +
        `${buildConfig.maxHtlcOutputCount} per Pre-PegIn transaction.`,
      "vault-count",
    );
  }
}
