import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  VaultProtocolInfo,
  VaultRegistryReader,
} from "../../../clients/eth/types";
import {
  RegisteredVaultVersionMismatchError,
  verifyRegisteredVaultVersions,
} from "../verifyRegisteredVaultVersions";

const VAULT_ID_A =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
const VAULT_ID_B =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;

const OFFCHAIN = 7;
const KEEPERS = 3;
const CHALLENGERS = 5;

function info(overrides: Partial<VaultProtocolInfo> = {}): VaultProtocolInfo {
  return {
    depositorSignedPeginTx: "0xdeadbeef" as Hex,
    universalChallengersVersion: CHALLENGERS,
    appVaultKeepersVersion: KEEPERS,
    offchainParamsVersion: OFFCHAIN,
    verifiedAt: 0n,
    depositorWotsPkHash: "0x00" as Hex,
    hashlock: "0x00" as Hex,
    htlcVout: 0,
    depositorPopSignature: "0x00" as Hex,
    prePeginTxHash: "0x00" as Hex,
    vaultProviderCommissionBps: 0,
    ...overrides,
  };
}

function buildRegistryReader(
  resolved: VaultProtocolInfo[] | Error,
): VaultRegistryReader {
  const getProtocolInfoBatch = vi.fn();
  if (resolved instanceof Error) {
    getProtocolInfoBatch.mockRejectedValue(resolved);
  } else {
    getProtocolInfoBatch.mockResolvedValue(resolved);
  }
  return {
    getVaultBasicInfo: vi.fn(),
    getVaultProtocolInfo: vi.fn(),
    getProtocolInfoBatch,
    getVaultData: vi.fn(),
    getVaultProviderBtcPubKey: vi.fn(),
    getOffchainParamsVersionsByVaultIds: vi.fn(),
  };
}

describe("verifyRegisteredVaultVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves on the happy path", async () => {
    const reader = buildRegistryReader([info(), info()]);

    await expect(
      verifyRegisteredVaultVersions({
        vaultRegistryReader: reader,
        vaultIds: [VAULT_ID_A, VAULT_ID_B],
        expectedOffchainParamsVersion: OFFCHAIN,
        expectedAppVaultKeepersVersion: KEEPERS,
        expectedUniversalChallengersVersion: CHALLENGERS,
      }),
    ).resolves.toBeUndefined();

    expect(reader.getProtocolInfoBatch).toHaveBeenCalledWith([
      VAULT_ID_A,
      VAULT_ID_B,
    ]);
  });

  it("throws RegisteredVaultVersionMismatchError on offchain version mismatch", async () => {
    const reader = buildRegistryReader([info({ offchainParamsVersion: 99 })]);

    await expect(
      verifyRegisteredVaultVersions({
        vaultRegistryReader: reader,
        vaultIds: [VAULT_ID_A],
        expectedOffchainParamsVersion: OFFCHAIN,
        expectedAppVaultKeepersVersion: KEEPERS,
        expectedUniversalChallengersVersion: CHALLENGERS,
      }),
    ).rejects.toThrow(RegisteredVaultVersionMismatchError);
  });

  it("throws on keeper version mismatch", async () => {
    const reader = buildRegistryReader([info({ appVaultKeepersVersion: 99 })]);

    await expect(
      verifyRegisteredVaultVersions({
        vaultRegistryReader: reader,
        vaultIds: [VAULT_ID_A],
        expectedOffchainParamsVersion: OFFCHAIN,
        expectedAppVaultKeepersVersion: KEEPERS,
        expectedUniversalChallengersVersion: CHALLENGERS,
      }),
    ).rejects.toThrow(RegisteredVaultVersionMismatchError);
  });

  it("throws on challenger version mismatch", async () => {
    const reader = buildRegistryReader([
      info({ universalChallengersVersion: 99 }),
    ]);

    await expect(
      verifyRegisteredVaultVersions({
        vaultRegistryReader: reader,
        vaultIds: [VAULT_ID_A],
        expectedOffchainParamsVersion: OFFCHAIN,
        expectedAppVaultKeepersVersion: KEEPERS,
        expectedUniversalChallengersVersion: CHALLENGERS,
      }),
    ).rejects.toThrow(RegisteredVaultVersionMismatchError);
  });

  it("resolves without RPC for empty vaultIds", async () => {
    const reader = buildRegistryReader([]);

    await verifyRegisteredVaultVersions({
      vaultRegistryReader: reader,
      vaultIds: [],
      expectedOffchainParamsVersion: OFFCHAIN,
      expectedAppVaultKeepersVersion: KEEPERS,
      expectedUniversalChallengersVersion: CHALLENGERS,
    });

    expect(reader.getProtocolInfoBatch).toHaveBeenCalledWith([]);
  });

  it("rethrows non-typed errors when the multicall RPC fails", async () => {
    const reader = buildRegistryReader(new Error("rpc down"));

    await expect(
      verifyRegisteredVaultVersions({
        vaultRegistryReader: reader,
        vaultIds: [VAULT_ID_A],
        expectedOffchainParamsVersion: OFFCHAIN,
        expectedAppVaultKeepersVersion: KEEPERS,
        expectedUniversalChallengersVersion: CHALLENGERS,
      }),
    ).rejects.toThrow("rpc down");
    await expect(
      verifyRegisteredVaultVersions({
        vaultRegistryReader: reader,
        vaultIds: [VAULT_ID_A],
        expectedOffchainParamsVersion: OFFCHAIN,
        expectedAppVaultKeepersVersion: KEEPERS,
        expectedUniversalChallengersVersion: CHALLENGERS,
      }),
    ).rejects.not.toBeInstanceOf(RegisteredVaultVersionMismatchError);
  });
});
