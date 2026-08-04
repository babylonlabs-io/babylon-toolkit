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
import { verifyRegisteredParticipantKeys } from "../verifyRegisteredParticipantKeys";
import { isRegisteredVaultVersionMismatchError } from "../verifyRegisteredVaultVersions";

const VAULT_ID = `0x${"11".repeat(32)}` as Hex;

function registryReaderReturning(epoch: bigint): VaultRegistryReader {
  return {
    getVaultBasicInfo: vi.fn(),
    getVaultProtocolInfo: vi.fn(),
    getProtocolInfoBatch: vi.fn(),
    getVaultData: vi.fn(),
    getVaultProviderBtcPubKey: vi.fn(),
    getPegInFee: vi.fn(),
    getVaultProviderCommission: vi.fn(),
    getOffchainParamsVersionsByVaultIds: vi.fn(),
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

  it("throws an error the existing cleanup path recognises", async () => {
    // The orchestrator removes pending pegin entries on this error class only,
    // so it must survive the module boundary the same way the sibling does.
    const expected = await keySetAt(EPOCH_GENESIS);

    const error = await verifyRegisteredParticipantKeys({
      vaultRegistryReader: registryReaderReturning(EPOCH_AFTER_ROTATION),
      operationKeyReader: new FakeOperationKeyReader(),
      vaultIds: [VAULT_ID],
      expected,
    }).catch((e: unknown) => e);

    expect(isRegisteredVaultVersionMismatchError(error)).toBe(true);
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
