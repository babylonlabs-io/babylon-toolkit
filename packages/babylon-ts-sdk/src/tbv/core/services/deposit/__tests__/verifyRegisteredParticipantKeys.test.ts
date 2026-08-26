import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

import type { VaultRegistryReader } from "../../../clients/eth/types";
import {
  EPOCH_AFTER_ROTATION,
  EPOCH_GENESIS,
  FakeOperationKeyReader,
  buildQuery,
  epochsAt,
} from "../../participants/__tests__/fixtures/rotation";
import { resolveParticipantKeysAtEpochs } from "../../participants/resolveParticipantKeys";
import {
  isParticipantKeyDriftError,
  verifyRegisteredParticipantKeys,
} from "../verifyRegisteredParticipantKeys";
import { isRegisteredVaultVersionMismatchError } from "../verifyRegisteredVaultVersions";

const VAULT_ID = `0x${"11".repeat(32)}` as Hex;

function registryReaderReturning(epoch: bigint): VaultRegistryReader {
  return {
    getVaultBasicInfo: vi.fn(),
    getVaultProtocolInfo: vi.fn(),
    getProtocolInfoBatch: vi.fn(),
    getVaultData: vi.fn(),
    getVaultProviderGenesisBtcPubKey: vi.fn(),
    getPegInFee: vi.fn(),
    getVaultProviderCommission: vi.fn(),
    getVaultKeyEpochs: vi.fn(),
    getVaultKeyEpochsBatch: vi.fn().mockResolvedValue([epochsAt(epoch)]),
    getCurrentVaultProviderOperationBtcKey: vi.fn(),
  } as VaultRegistryReader;
}

async function keySetAt(epoch: bigint) {
  return resolveParticipantKeysAtEpochs({
    operationKeyReader: new FakeOperationKeyReader(),
    query: buildQuery(),
    epochs: epochsAt(epoch),
  });
}

describe("verifyRegisteredParticipantKeys", () => {
  it("passes when the frozen epochs resolve to the keys we built with", async () => {
    const expected = await keySetAt(EPOCH_AFTER_ROTATION);

    await expect(
      verifyRegisteredParticipantKeys({
        vaultRegistryReader: registryReaderReturning(EPOCH_AFTER_ROTATION),
        operationKeyReader: new FakeOperationKeyReader(),
        vaultIds: [VAULT_ID],
        expected,
      }),
    ).resolves.toBeUndefined();
  });

  it("aborts the broadcast when a rotation landed during registration", async () => {
    // Built against the pre-rotation keys, but the vault froze an epoch that
    // resolves to the rotated ones — exactly the race this check exists for.
    const expected = await keySetAt(EPOCH_GENESIS);

    await expect(
      verifyRegisteredParticipantKeys({
        vaultRegistryReader: registryReaderReturning(EPOCH_AFTER_ROTATION),
        operationKeyReader: new FakeOperationKeyReader(),
        vaultIds: [VAULT_ID],
        expected,
      }),
    ).rejects.toThrow(/vault provider key expected/i);
  });

  it("throws a key-drift error that is not a version mismatch", async () => {
    // The distinction drives cleanup: the orchestrator drops the local pending
    // record on a version mismatch, but must keep it on key drift — the record
    // holds the build-time key stamp that lets a later resume re-detect the
    // drift instead of falling back to the indexer's copy and broadcasting it.
    // Recognition must also survive the module boundary, as the sibling does.
    const expected = await keySetAt(EPOCH_GENESIS);

    const error = await verifyRegisteredParticipantKeys({
      vaultRegistryReader: registryReaderReturning(EPOCH_AFTER_ROTATION),
      operationKeyReader: new FakeOperationKeyReader(),
      vaultIds: [VAULT_ID],
      expected,
    }).catch((e: unknown) => e);

    expect(isParticipantKeyDriftError(error)).toBe(true);
    expect(isRegisteredVaultVersionMismatchError(error)).toBe(false);
    expect((error as Error).message).toMatch(/was not broadcast/i);
  });

  it("reports a keeper-set drift naming the vault", async () => {
    const expected = await keySetAt(EPOCH_GENESIS);

    await expect(
      verifyRegisteredParticipantKeys({
        vaultRegistryReader: registryReaderReturning(EPOCH_AFTER_ROTATION),
        operationKeyReader: new FakeOperationKeyReader(),
        vaultIds: [VAULT_ID],
        expected,
      }),
    ).rejects.toThrow(new RegExp(`vault ${VAULT_ID}: vault keeper keys`, "i"));
  });

  it("does nothing for an empty vault list", async () => {
    const reader = registryReaderReturning(EPOCH_GENESIS);
    const expected = await keySetAt(EPOCH_GENESIS);

    await expect(
      verifyRegisteredParticipantKeys({
        vaultRegistryReader: reader,
        operationKeyReader: new FakeOperationKeyReader(),
        vaultIds: [],
        expected,
      }),
    ).resolves.toBeUndefined();

    expect(reader.getVaultKeyEpochsBatch).not.toHaveBeenCalled();
  });
});
