import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  OnChainBtcPubkey,
  VaultRegistryReader,
} from "../../../clients/eth/types";
import type { PeginBuildSnapshot } from "../peginBuildSnapshot";
import { verifyResumeBroadcastSnapshot } from "../verifyResumeBroadcastSnapshot";

const VP_ADDRESS = "0xVP" as Address;
const VP_KEY = "a".repeat(64);
const VP_KEY_DIFFERENT = "b".repeat(64);

const SNAPSHOT: PeginBuildSnapshot = {
  offchainParamsVersion: 5,
  appVaultKeepersVersion: 11,
  universalChallengersVersion: 21,
  vaultProviderBtcPubkeyXOnly: VP_KEY,
};

const ON_CHAIN_MATCH = {
  offchainParamsVersion: 5,
  appVaultKeepersVersion: 11,
  universalChallengersVersion: 21,
  vaultProvider: VP_ADDRESS,
};

function buildReader(vpKey: string = VP_KEY): VaultRegistryReader {
  return {
    getVaultBasicInfo: vi.fn(),
    getVaultProtocolInfo: vi.fn(),
    getProtocolInfoBatch: vi.fn(),
    getVaultData: vi.fn(),
    getVaultProviderBtcPubKey: vi
      .fn()
      .mockResolvedValue(vpKey as OnChainBtcPubkey),
    getOffchainParamsVersionsByVaultIds: vi.fn(),
  };
}

describe("verifyResumeBroadcastSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves when versions and VP key match", async () => {
    await expect(
      verifyResumeBroadcastSnapshot({
        vaultRegistryReader: buildReader(),
        onChain: ON_CHAIN_MATCH,
        buildSnapshot: SNAPSHOT,
      }),
    ).resolves.toBeUndefined();
  });

  it("throws on offchain params version mismatch", async () => {
    await expect(
      verifyResumeBroadcastSnapshot({
        vaultRegistryReader: buildReader(),
        onChain: { ...ON_CHAIN_MATCH, offchainParamsVersion: 99 },
        buildSnapshot: SNAPSHOT,
      }),
    ).rejects.toThrow(/offchain params version mismatch/);
  });

  it("throws on keeper version mismatch", async () => {
    await expect(
      verifyResumeBroadcastSnapshot({
        vaultRegistryReader: buildReader(),
        onChain: { ...ON_CHAIN_MATCH, appVaultKeepersVersion: 99 },
        buildSnapshot: SNAPSHOT,
      }),
    ).rejects.toThrow(/vault keeper version mismatch/);
  });

  it("throws on challenger version mismatch", async () => {
    await expect(
      verifyResumeBroadcastSnapshot({
        vaultRegistryReader: buildReader(),
        onChain: { ...ON_CHAIN_MATCH, universalChallengersVersion: 99 },
        buildSnapshot: SNAPSHOT,
      }),
    ).rejects.toThrow(/universal challenger version mismatch/);
  });

  it("throws when on-chain VP key differs from the snapshot", async () => {
    await expect(
      verifyResumeBroadcastSnapshot({
        vaultRegistryReader: buildReader(VP_KEY_DIFFERENT),
        onChain: ON_CHAIN_MATCH,
        buildSnapshot: SNAPSHOT,
      }),
    ).rejects.toThrow(/vault provider BTC pubkey changed/);
  });
});
