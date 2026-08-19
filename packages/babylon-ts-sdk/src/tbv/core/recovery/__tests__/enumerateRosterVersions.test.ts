/**
 * Tests for the two `1..latest` roster loops recovery adds.
 *
 * The behaviour that matters is the skip contract: a version that cannot be
 * resolved must reach the observer rather than vanish, because a silently
 * shrunk search space turns a recoverable deposit into "no candidate matched".
 */

import { describe, expect, it, vi } from "vitest";

import type {
  AddressBTCKeyPair,
  UniversalChallengerReader,
  VaultKeeperReader,
} from "../../clients/eth/types";
import {
  enumerateUniversalChallengerVersions,
  enumerateVaultKeeperVersions,
} from "../enumerateRosterVersions";

const APP_ENTRY_POINT = "0x2222222222222222222222222222222222222222" as const;

function keyPair(btcPubKey: string): AddressBTCKeyPair {
  return {
    ethAddress: "0x3333333333333333333333333333333333333333",
    btcPubKey: `0x${btcPubKey}`,
  };
}

describe("enumerateVaultKeeperVersions", () => {
  it("reads every version from 1 up to the current one", async () => {
    const reader: VaultKeeperReader = {
      getCurrentVaultKeepersVersion: vi.fn(async () => 3),
      getVaultKeepersByVersion: vi.fn(async (_app, version) => [
        keyPair(`${version}${"a".repeat(63)}`),
      ]),
      getCurrentVaultKeepers: vi.fn(),
    };

    const snapshots = await enumerateVaultKeeperVersions(
      reader,
      APP_ENTRY_POINT,
    );

    expect(snapshots.map((s) => s.version)).toEqual([1, 2, 3]);
    expect(reader.getVaultKeepersByVersion).toHaveBeenCalledTimes(3);
    expect(reader.getVaultKeepersByVersion).toHaveBeenCalledWith(
      APP_ENTRY_POINT,
      1,
    );
  });

  it("strips the 0x prefix so the pubkeys are ready for the WASM oracle", async () => {
    const reader: VaultKeeperReader = {
      getCurrentVaultKeepersVersion: vi.fn(async () => 1),
      getVaultKeepersByVersion: vi.fn(async () => [keyPair("ab".repeat(32))]),
      getCurrentVaultKeepers: vi.fn(),
    };

    const [snapshot] = await enumerateVaultKeeperVersions(
      reader,
      APP_ENTRY_POINT,
    );

    expect(snapshot.btcPubkeys).toEqual(["ab".repeat(32)]);
  });

  it("reports a version that fails to read instead of dropping it silently", async () => {
    const reader: VaultKeeperReader = {
      getCurrentVaultKeepersVersion: vi.fn(async () => 2),
      getVaultKeepersByVersion: vi.fn(async (_app, version) => {
        if (version === 1) throw new Error("reverted");
        return [keyPair("ab".repeat(32))];
      }),
      getCurrentVaultKeepers: vi.fn(),
    };
    const onSkipped = vi.fn();

    const snapshots = await enumerateVaultKeeperVersions(
      reader,
      APP_ENTRY_POINT,
      onSkipped,
    );

    expect(snapshots.map((s) => s.version)).toEqual([2]);
    expect(onSkipped).toHaveBeenCalledTimes(1);
    expect(onSkipped.mock.calls[0][0]).toBe(1);
    expect(onSkipped.mock.calls[0][1].message).toBe("reverted");
  });

  it("normalises a non-Error rejection so the observer always gets a message", async () => {
    const reader: VaultKeeperReader = {
      getCurrentVaultKeepersVersion: vi.fn(async () => 1),
      getVaultKeepersByVersion: vi.fn(async () => {
        // Contract clients and transports can reject with a plain string.
        throw "execution reverted";
      }),
      getCurrentVaultKeepers: vi.fn(),
    };
    const onSkipped = vi.fn();

    await enumerateVaultKeeperVersions(reader, APP_ENTRY_POINT, onSkipped);

    expect(onSkipped.mock.calls[0][1]).toBeInstanceOf(Error);
    expect(onSkipped.mock.calls[0][1].message).toBe("execution reverted");
  });

  it("treats an empty roster as unresolvable rather than as a valid candidate", async () => {
    const reader: VaultKeeperReader = {
      getCurrentVaultKeepersVersion: vi.fn(async () => 1),
      getVaultKeepersByVersion: vi.fn(async () => []),
      getCurrentVaultKeepers: vi.fn(),
    };
    const onSkipped = vi.fn();

    const snapshots = await enumerateVaultKeeperVersions(
      reader,
      APP_ENTRY_POINT,
      onSkipped,
    );

    expect(snapshots).toEqual([]);
    expect(onSkipped.mock.calls[0][1].message).toMatch(/empty roster/);
  });

  it("returns nothing when no roster version has been published", async () => {
    const reader: VaultKeeperReader = {
      getCurrentVaultKeepersVersion: vi.fn(async () => 0),
      getVaultKeepersByVersion: vi.fn(),
      getCurrentVaultKeepers: vi.fn(),
    };

    expect(await enumerateVaultKeeperVersions(reader, APP_ENTRY_POINT)).toEqual(
      [],
    );
    expect(reader.getVaultKeepersByVersion).not.toHaveBeenCalled();
  });
});

describe("enumerateUniversalChallengerVersions", () => {
  it("reads every version from 1 up to the latest one", async () => {
    const reader: UniversalChallengerReader = {
      getLatestUniversalChallengersVersion: vi.fn(async () => 2),
      getUniversalChallengersByVersion: vi.fn(async () => [
        keyPair("cd".repeat(32)),
      ]),
      getCurrentUniversalChallengers: vi.fn(),
    };

    const snapshots = await enumerateUniversalChallengerVersions(reader);

    expect(snapshots.map((s) => s.version)).toEqual([1, 2]);
    expect(snapshots[0].btcPubkeys).toEqual(["cd".repeat(32)]);
  });

  it("reports a version that fails to read instead of dropping it silently", async () => {
    const reader: UniversalChallengerReader = {
      getLatestUniversalChallengersVersion: vi.fn(async () => 1),
      getUniversalChallengersByVersion: vi.fn(async () => {
        throw new Error("reverted");
      }),
      getCurrentUniversalChallengers: vi.fn(),
    };
    const onSkipped = vi.fn();

    expect(
      await enumerateUniversalChallengerVersions(reader, onSkipped),
    ).toEqual([]);
    expect(onSkipped).toHaveBeenCalledTimes(1);
  });
});
