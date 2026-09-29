import type { PegInConfiguration } from "@babylonlabs-io/ts-sdk/tbv/core";
import { describe, expect, it } from "vitest";

import {
  BuildLimitsDriftError,
  BuildPreconditionError,
  assertBuildWithinPinnedLimits,
  isBuildLimitsDriftError,
} from "../pinnedBuildLimits";

function config(
  minimumPegInAmount: bigint,
  maxPegInAmount: bigint,
  maxHtlcOutputCount = 2,
): PegInConfiguration {
  return {
    minimumPegInAmount,
    maxPegInAmount,
    maxHtlcOutputCount,
  } as PegInConfiguration;
}

describe("assertBuildWithinPinnedLimits amount bounds", () => {
  it("passes an amount inside the pinned bounds", () => {
    expect(() =>
      assertBuildWithinPinnedLimits([100_000n], config(10_000n, 1_000_000n)),
    ).not.toThrow();
  });

  it("accepts an amount exactly at the minimum", () => {
    // The bounds are inclusive on both ends, matching the check the form ran.
    // A re-validation that disagreed here would reject deposits the form
    // allowed for a reason that has nothing to do with drift.
    expect(() =>
      assertBuildWithinPinnedLimits([10_000n], config(10_000n, 1_000_000n)),
    ).not.toThrow();
  });

  it("accepts an amount exactly at the maximum", () => {
    expect(() =>
      assertBuildWithinPinnedLimits([1_000_000n], config(10_000n, 1_000_000n)),
    ).not.toThrow();
  });

  it("throws when the pinned minimum rose above the chosen amount", () => {
    expect(() =>
      assertBuildWithinPinnedLimits([100_000n], config(200_000n, 1_000_000n)),
    ).toThrow(BuildLimitsDriftError);
  });

  it("throws when the pinned maximum fell below the chosen amount", () => {
    expect(() =>
      assertBuildWithinPinnedLimits([100_000n], config(10_000n, 50_000n)),
    ).toThrow(BuildLimitsDriftError);
  });

  it("rejects a leg below the minimum wherever it sits in the array", () => {
    // Each leg is checked, not the total and not just the first entry. Asserted
    // in both orders so the test pins per-leg coverage on its own rather than
    // borrowing the SDK's "Vault N" wording, which this module no longer quotes.
    const bounds = config(150_000n, 1_000_000n);
    expect(() =>
      assertBuildWithinPinnedLimits([100_000n, 200_000n], bounds),
    ).toThrow(BuildLimitsDriftError);
    expect(() =>
      assertBuildWithinPinnedLimits([200_000n, 100_000n], bounds),
    ).toThrow(BuildLimitsDriftError);
  });

  it("names the offending BTCVault and the pinned bounds, and no amount", () => {
    // The amount is omitted on purpose: this message reaches Sentry verbatim,
    // and a precise deposit amount is depositor-identifying.
    let message = "";
    try {
      assertBuildWithinPinnedLimits([100_000n], config(200_000n, 900_000n));
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/BTCVault 1 of 1/);
    expect(message).toMatch(/200000 to 900000 satoshis/);
    expect(message).not.toMatch(/100000|0\.001/);
  });
});

describe("assertBuildWithinPinnedLimits caller-bug inputs", () => {
  // These are not drift. Reporting them as drift would tell the depositor the
  // chain moved and send them to change an amount that was never the problem.
  it("throws a precondition error, not a drift error, for an empty array", () => {
    // Typed, not plain: an unrecognised error becomes the callout body, which
    // would show the depositor an internal function name.
    expect(() =>
      assertBuildWithinPinnedLimits([], config(10_000n, 1_000_000n)),
    ).toThrow(BuildPreconditionError);
    expect(() =>
      assertBuildWithinPinnedLimits([], config(10_000n, 1_000_000n)),
    ).not.toThrow(BuildLimitsDriftError);
  });

  it("throws a precondition error, not a drift error, for a non-positive leg", () => {
    expect(() =>
      assertBuildWithinPinnedLimits(
        [100_000n, 0n],
        config(10_000n, 1_000_000n),
      ),
    ).toThrow(BuildPreconditionError);
    expect(() =>
      assertBuildWithinPinnedLimits([0n], config(10_000n, 1_000_000n)),
    ).not.toThrow(BuildLimitsDriftError);
  });
});

describe("assertBuildWithinPinnedLimits HTLC output count", () => {
  it("accepts a vault count exactly at the pinned cap", () => {
    expect(() =>
      assertBuildWithinPinnedLimits(
        [100_000n, 100_000n],
        config(10_000n, 1_000_000n, 2),
      ),
    ).not.toThrow();
  });

  it("throws when the pinned cap fell below the vault count", () => {
    expect(() =>
      assertBuildWithinPinnedLimits(
        [100_000n, 100_000n],
        config(10_000n, 1_000_000n, 1),
      ),
    ).toThrow(/2 HTLC outputs.*at most 1/s);
  });
});

describe("assertBuildWithinPinnedLimits drift reason", () => {
  // The reason picks the callout, and the two give opposite instructions —
  // change the amount, or stop splitting. Tagging the wrong one sends the
  // depositor to fix something that is not broken.
  it("tags an out-of-bounds amount as amount-bounds", () => {
    expect(() =>
      assertBuildWithinPinnedLimits([100_000n], config(200_000n, 1_000_000n)),
    ).toThrow(expect.objectContaining({ reason: "amount-bounds" }));
  });

  it("tags an over-cap vault count as vault-count", () => {
    expect(() =>
      assertBuildWithinPinnedLimits(
        [100_000n, 100_000n],
        config(10_000n, 1_000_000n, 1),
      ),
    ).toThrow(expect.objectContaining({ reason: "vault-count" }));
  });

  it("reports the amount when both limits are exceeded at once", () => {
    // Amounts are checked first, deliberately: the amount is what the depositor
    // typed, so it is the more actionable of the two to name.
    expect(() =>
      assertBuildWithinPinnedLimits(
        [100_000n, 100_000n],
        config(200_000n, 1_000_000n, 1),
      ),
    ).toThrow(expect.objectContaining({ reason: "amount-bounds" }));
  });
});

describe("isBuildLimitsDriftError", () => {
  it("recognises a real instance", () => {
    expect(
      isBuildLimitsDriftError(
        new BuildLimitsDriftError("limits", "amount-bounds"),
      ),
    ).toBe(true);
  });

  it("recognises a structural copy by name, for errors that crossed a realm", () => {
    const structural = new Error("limits");
    structural.name = "BuildLimitsDriftError";
    expect(isBuildLimitsDriftError(structural)).toBe(true);
  });

  it("rejects an unrelated error", () => {
    expect(isBuildLimitsDriftError(new Error("something else"))).toBe(false);
  });

  it("does not swallow the sibling guard's error, which maps to different copy", () => {
    const sibling = new Error("drift");
    sibling.name = "BuildConfigDriftError";
    expect(isBuildLimitsDriftError(sibling)).toBe(false);
  });
});
