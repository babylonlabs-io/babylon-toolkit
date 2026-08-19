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
import { TEST_KEYS } from "../../primitives/psbt/__tests__/helpers";
import {
  enumerateUniversalChallengerVersions,
  enumerateVaultKeeperVersions,
} from "../enumerateRosterVersions";

const APP_ENTRY_POINT = "0x2222222222222222222222222222222222222222" as const;

/** Roster entries must carry real curve points — the enumeration validates them. */
const VALID_KEYS = [
  TEST_KEYS.VAULT_KEEPER_1,
  TEST_KEYS.VAULT_KEEPER_2,
  TEST_KEYS.UNIVERSAL_CHALLENGER_1,
];

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
        keyPair(VALID_KEYS[version - 1]),
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

  it("normalises keys to bare lowercase hex, ready for the WASM oracle", async () => {
    const reader: VaultKeeperReader = {
      getCurrentVaultKeepersVersion: vi.fn(async () => 1),
      getVaultKeepersByVersion: vi.fn(async () => [
        keyPair(TEST_KEYS.VAULT_KEEPER_1.toUpperCase()),
      ]),
      getCurrentVaultKeepers: vi.fn(),
    };

    const [snapshot] = await enumerateVaultKeeperVersions(
      reader,
      APP_ENTRY_POINT,
    );

    expect(snapshot.btcPubkeys).toEqual([TEST_KEYS.VAULT_KEEPER_1]);
  });

  // A malformed key would otherwise reach the WASM oracle and come back as one
  // more candidate that "did not match", hiding a bad RPC response.
  it("reports a key that is not a valid x-only point as an unresolvable version", async () => {
    const reader: VaultKeeperReader = {
      getCurrentVaultKeepersVersion: vi.fn(async () => 1),
      // The all-zero key is the canonical off-curve value: an unregistered
      // operator reads back as zeroes rather than as a usable key.
      getVaultKeepersByVersion: vi.fn(async () => [keyPair("00".repeat(32))]),
      getCurrentVaultKeepers: vi.fn(),
    };
    const onSkipped = vi.fn();

    const snapshots = await enumerateVaultKeeperVersions(
      reader,
      APP_ENTRY_POINT,
      onSkipped,
    );

    expect(snapshots).toEqual([]);
    expect(onSkipped.mock.calls[0][1].message).toMatch(/secp256k1 curve/);
    expect(onSkipped.mock.calls[0][1].message).toMatch(/entry 0/);
  });

  it("refuses a non-integer latest version rather than looping on it", async () => {
    const reader: VaultKeeperReader = {
      getCurrentVaultKeepersVersion: vi.fn(async () => Number.NaN),
      getVaultKeepersByVersion: vi.fn(),
      getCurrentVaultKeepers: vi.fn(),
    };

    await expect(
      enumerateVaultKeeperVersions(reader, APP_ENTRY_POINT),
    ).rejects.toThrow(/must be a non-negative integer/);
    expect(reader.getVaultKeepersByVersion).not.toHaveBeenCalled();
  });

  it("refuses a latest version past the ceiling rather than issuing that many reads", async () => {
    const reader: VaultKeeperReader = {
      getCurrentVaultKeepersVersion: vi.fn(async () => 10_000),
      getVaultKeepersByVersion: vi.fn(),
      getCurrentVaultKeepers: vi.fn(),
    };

    await expect(
      enumerateVaultKeeperVersions(reader, APP_ENTRY_POINT),
    ).rejects.toThrow(/exceeds the 256-version ceiling/);
    expect(reader.getVaultKeepersByVersion).not.toHaveBeenCalled();
  });

  it("reports a version that fails to read instead of dropping it silently", async () => {
    const reader: VaultKeeperReader = {
      getCurrentVaultKeepersVersion: vi.fn(async () => 2),
      getVaultKeepersByVersion: vi.fn(async (_app, version) => {
        if (version === 1) throw new Error("reverted");
        return [keyPair(TEST_KEYS.VAULT_KEEPER_1)];
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
        keyPair(TEST_KEYS.UNIVERSAL_CHALLENGER_1),
      ]),
      getCurrentUniversalChallengers: vi.fn(),
    };

    const snapshots = await enumerateUniversalChallengerVersions(reader);

    expect(snapshots.map((s) => s.version)).toEqual([1, 2]);
    expect(snapshots[0].btcPubkeys).toEqual([TEST_KEYS.UNIVERSAL_CHALLENGER_1]);
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
