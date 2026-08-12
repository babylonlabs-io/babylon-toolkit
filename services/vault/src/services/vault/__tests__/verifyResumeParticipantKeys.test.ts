/**
 * The pre-broadcast key-drift guard on the resume path.
 *
 * `resolveParticipantKeysAtEpochs` is mocked: resolution itself is SDK-side and
 * covered by `resolveParticipantKeys.test.ts`. What has no coverage anywhere is
 * the comparison body in this module, which is the only thing standing between a
 * rotated key set and a Pre-PegIn broadcast, and whose abort branch cannot be
 * reached on a real network (an unrelated spend fires first — see #2187).
 */

import {
  isParticipantKeyDriftError,
  isRegisteredVaultVersionMismatchError,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveParticipantKeysAtEpochs = vi.hoisted(() => vi.fn());

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  resolveParticipantKeysAtEpochs: (...args: unknown[]) =>
    mockResolveParticipantKeysAtEpochs(...args),
}));

vi.mock("@/clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: vi.fn(),
  getVaultKeyEpochsFromChain: vi.fn(),
  getVaultProviderGenesisBtcPubkeyFromChain: vi.fn(),
}));

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultKeeperReader: vi.fn().mockResolvedValue({
    getVaultKeepersByVersion: vi.fn().mockResolvedValue([
      { ethAddress: "0xkeeperA", btcPubKey: "0xvk1" },
      { ethAddress: "0xkeeperB", btcPubKey: "0xvk2" },
    ]),
  }),
  getUniversalChallengerReader: vi.fn().mockResolvedValue({
    getUniversalChallengersByVersion: vi
      .fn()
      .mockResolvedValue([{ ethAddress: "0xucA", btcPubKey: "0xuc1" }]),
  }),
  getOperationKeyReader: vi.fn().mockResolvedValue({}),
}));

import {
  getVaultFromChain,
  getVaultKeyEpochsFromChain,
  getVaultProviderGenesisBtcPubkeyFromChain,
} from "@/clients/eth-contract/btc-vault-registry/query";

import { verifyResumeParticipantKeys } from "../verifyResumeParticipantKeys";

const VAULT_ID = `0x${"11".repeat(32)}` as Hex;

const VP_KEY = "a".repeat(64);
const VP_KEY_ROTATED = "b".repeat(64);

/** Sorted, as both sides of the comparison always are. */
const KEEPER_LOW = "1".repeat(64);
const KEEPER_HIGH = "f".repeat(64);
const KEEPER_HIGH_ROTATED = "e".repeat(64);

const CHALLENGER_KEY = "c".repeat(64);
const CHALLENGER_KEY_ROTATED = "d".repeat(64);

/** What the vault's frozen epochs currently resolve to. */
function resolvesTo(keys: {
  vaultProvider: string;
  vaultKeepers: string[];
  universalChallengers: string[];
}) {
  mockResolveParticipantKeysAtEpochs.mockResolvedValue({
    vaultProvider: { operationBtcPubkey: keys.vaultProvider },
    vaultKeeperOperationKeysSorted: keys.vaultKeepers,
    universalChallengerOperationKeysSorted: keys.universalChallengers,
  });
}

const STAMPED = {
  vaultProvider: VP_KEY,
  vaultKeepers: [KEEPER_LOW, KEEPER_HIGH],
  universalChallengers: [CHALLENGER_KEY],
};

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getVaultFromChain).mockResolvedValue({
    vaultProvider: "0xprovider",
    applicationEntryPoint: "0xapp",
    appVaultKeepersVersion: 2,
    universalChallengersVersion: 3,
  } as never);
  vi.mocked(getVaultProviderGenesisBtcPubkeyFromChain).mockResolvedValue(
    `0x${VP_KEY}` as never,
  );
  vi.mocked(getVaultKeyEpochsFromChain).mockResolvedValue({
    vpKeyEpoch: 7n,
    appKeeperKeyEpoch: 7n,
    ucKeyEpoch: 7n,
  } as never);

  resolvesTo(STAMPED);
});

describe("verifyResumeParticipantKeys", () => {
  it("passes when the vault's frozen epochs resolve to the stamped keys", async () => {
    await expect(
      verifyResumeParticipantKeys({ vaultId: VAULT_ID, expected: STAMPED }),
    ).resolves.toBeUndefined();
  });

  it("resolves against the vault's frozen epochs, not the current ones", async () => {
    await verifyResumeParticipantKeys({ vaultId: VAULT_ID, expected: STAMPED });

    expect(mockResolveParticipantKeysAtEpochs).toHaveBeenCalledWith(
      expect.objectContaining({
        epochs: { vpKeyEpoch: 7n, appKeeperKeyEpoch: 7n, ucKeyEpoch: 7n },
      }),
    );
  });

  it("aborts when the vault provider's operation key drifted", async () => {
    resolvesTo({ ...STAMPED, vaultProvider: VP_KEY_ROTATED });

    await expect(
      verifyResumeParticipantKeys({ vaultId: VAULT_ID, expected: STAMPED }),
    ).rejects.toThrow(/vault provider's operation key changed/i);
  });

  it("aborts naming the keeper set when a keeper key drifted", async () => {
    resolvesTo({
      ...STAMPED,
      vaultKeepers: [KEEPER_LOW, KEEPER_HIGH_ROTATED],
    });

    await expect(
      verifyResumeParticipantKeys({ vaultId: VAULT_ID, expected: STAMPED }),
    ).rejects.toThrow(/the vault keeper set changed/i);
  });

  it("aborts naming the challenger set when a challenger key drifted", async () => {
    resolvesTo({
      ...STAMPED,
      universalChallengers: [CHALLENGER_KEY_ROTATED],
    });

    await expect(
      verifyResumeParticipantKeys({ vaultId: VAULT_ID, expected: STAMPED }),
    ).rejects.toThrow(/the universal challenger set changed/i);
  });

  it("aborts when the keeper set matches but the order does not", async () => {
    // Same two keys, opposite order. Both sides are the sorted arrays script
    // construction consumes, so this is a genuine mismatch — and this module is
    // the only place it is caught.
    resolvesTo({ ...STAMPED, vaultKeepers: [KEEPER_HIGH, KEEPER_LOW] });

    await expect(
      verifyResumeParticipantKeys({ vaultId: VAULT_ID, expected: STAMPED }),
    ).rejects.toThrow(/the vault keeper set changed/i);
  });

  it("throws a key-drift error and not a version mismatch", async () => {
    // The distinction is load-bearing: `handleBroadcast` drops the pending
    // record on a version mismatch, but must keep it on key drift, because the
    // record holds the stamp that lets a later resume re-detect the drift
    // instead of falling back to the indexer's copy and broadcasting it.
    resolvesTo({ ...STAMPED, vaultProvider: VP_KEY_ROTATED });

    const error = await verifyResumeParticipantKeys({
      vaultId: VAULT_ID,
      expected: STAMPED,
    }).catch((e: unknown) => e);

    expect(isParticipantKeyDriftError(error)).toBe(true);
    expect(isRegisteredVaultVersionMismatchError(error)).toBe(false);
    expect((error as Error).message).toMatch(/was not broadcast/i);
  });

  it("accepts stamped keys that differ from the resolved ones only in encoding", async () => {
    // `peginStorage` writes bare lowercase hex, so this cannot happen today.
    // The guard normalises anyway: an encoding difference must never read as
    // drift, or a second writer of the stamp would abort deposits whose keys
    // are identical.
    await expect(
      verifyResumeParticipantKeys({
        vaultId: VAULT_ID,
        expected: {
          vaultProvider: `0x${VP_KEY.toUpperCase()}`,
          vaultKeepers: [`0x${KEEPER_LOW}`, KEEPER_HIGH.toUpperCase()],
          universalChallengers: [`0x${CHALLENGER_KEY}`],
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("reports which stamped key is unreadable rather than reporting drift", async () => {
    const error = await verifyResumeParticipantKeys({
      vaultId: VAULT_ID,
      expected: { ...STAMPED, vaultKeepers: [KEEPER_LOW, "not-hex"] },
    }).catch((e: unknown) => e);

    expect((error as Error).message).toMatch(
      /the vault keeper set at index 1 is not a readable BTC public key/i,
    );
    expect(isParticipantKeyDriftError(error)).toBe(false);
  });
});
