import type {
  AllOffchainParamsData,
  VersionedOffchainParams,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { describe, expect, it } from "vitest";

import { resolveTimelockAssertBlocks } from "../useOffchainParams";

function paramsWithTimelock(timelockAssert: bigint): VersionedOffchainParams {
  // Only timelockAssert matters for the resolver.
  return { timelockAssert } as unknown as VersionedOffchainParams;
}

function offchainData(
  entries: Array<[number, bigint]>,
  latestVersion: number,
): AllOffchainParamsData {
  return {
    byVersion: new Map(
      entries.map(([version, timelock]) => [
        version,
        paramsWithTimelock(timelock),
      ]),
    ),
    latestVersion,
  };
}

describe("resolveTimelockAssertBlocks", () => {
  it("returns undefined while the params are still loading", () => {
    expect(resolveTimelockAssertBlocks(undefined, 1)).toBeUndefined();
  });

  it("returns the requested version's timelockAssert as a number", () => {
    const data = offchainData(
      [
        [1, 100n],
        [2, 144n],
      ],
      2,
    );
    expect(resolveTimelockAssertBlocks(data, 1)).toBe(100);
    expect(resolveTimelockAssertBlocks(data, 2)).toBe(144);
  });

  it("falls back to the latest version when the requested version is missing", () => {
    // Version 1 was skipped (e.g. failed validation); latest is 2.
    const data = offchainData([[2, 144n]], 2);
    expect(resolveTimelockAssertBlocks(data, 1)).toBe(144);
  });

  it("returns undefined when no version and no latest can be resolved", () => {
    const data = offchainData([], 0);
    expect(resolveTimelockAssertBlocks(data, 1)).toBeUndefined();
  });
});
