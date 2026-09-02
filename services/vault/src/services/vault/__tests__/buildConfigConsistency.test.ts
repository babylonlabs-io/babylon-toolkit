import type { PegInConfiguration } from "@babylonlabs-io/ts-sdk/tbv/core";
import { describe, expect, it } from "vitest";

import {
  BuildConfigDriftError,
  assertBuildConfigMatchesForm,
  isBuildConfigDriftError,
} from "../buildConfigConsistency";

function config(
  offchainParamsVersion: number,
  activeVaultCoreVersion: number,
): PegInConfiguration {
  return {
    offchainParamsVersion,
    activeVaultCoreVersion,
  } as PegInConfiguration;
}

describe("assertBuildConfigMatchesForm", () => {
  it("passes when both version axes agree", () => {
    expect(() =>
      assertBuildConfigMatchesForm(config(7, 3), config(7, 3)),
    ).not.toThrow();
  });

  it("throws when the offchain params version moved under the form", () => {
    expect(() =>
      assertBuildConfigMatchesForm(config(8, 3), config(7, 3)),
    ).toThrow(BuildConfigDriftError);
  });

  it("throws when the vault core version moved under the form", () => {
    // The case the form's own "update the app" gate cannot see, because it
    // checks the cached version and nothing re-checks it before the build.
    expect(() =>
      assertBuildConfigMatchesForm(config(7, 4), config(7, 3)),
    ).toThrow(BuildConfigDriftError);
  });

  it("names both parameter sets so the drift is diagnosable from the message", () => {
    expect(() =>
      assertBuildConfigMatchesForm(config(8, 4), config(7, 3)),
    ).toThrow(/v7 \/ vaultCore v3.*v8 \/ vaultCore v4/s);
  });

  it("is recognised across a module boundary by name, not only by instance", () => {
    const structural = new Error("drift");
    structural.name = "BuildConfigDriftError";

    expect(isBuildConfigDriftError(structural)).toBe(true);
    expect(isBuildConfigDriftError(new Error("something else"))).toBe(false);
  });
});
