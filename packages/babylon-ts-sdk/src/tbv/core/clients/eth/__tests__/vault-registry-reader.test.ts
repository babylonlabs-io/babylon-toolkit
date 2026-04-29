import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";

import { ViemVaultRegistryReader } from "../vault-registry-reader";

const MOCK_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const MOCK_VAULT_ID =
  "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd" as Hex;

const MOCK_BASIC_INFO_RESULT = {
  depositor: "0x0000000000000000000000000000000000000001" as Address,
  depositorBtcPubKey: "0xaabb" as Hex,
  amount: 1000000n,
  vaultProvider: "0x0000000000000000000000000000000000000002" as Address,
  status: 1,
  applicationEntryPoint:
    "0x0000000000000000000000000000000000000003" as Address,
  createdAt: 1700000000n,
} as const;

const MOCK_PROTOCOL_INFO_RESULT = {
  depositorSignedPeginTx: "0x0200" as Hex,
  universalChallengersVersion: 1,
  appVaultKeepersVersion: 2,
  offchainParamsVersion: 3,
  verifiedAt: 1700000001n,
  depositorWotsPkHash: "0xcc" as Hex,
  hashlock: "0xdd" as Hex,
  htlcVout: 0,
  depositorPopSignature: "0xee" as Hex,
  prePeginTxHash: "0xff" as Hex,
  vaultProviderCommissionBps: 100,
} as const;

function createMockPublicClient(overrides?: {
  basicInfoResult?: unknown;
  protocolInfoResult?: unknown;
}) {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "getBtcVaultBasicInfo") {
        return overrides?.basicInfoResult ?? MOCK_BASIC_INFO_RESULT;
      }
      if (functionName === "getBtcVaultProtocolInfo") {
        return overrides?.protocolInfoResult ?? MOCK_PROTOCOL_INFO_RESULT;
      }
      throw new Error(`Unknown function: ${functionName}`);
    }),
  };
}

describe("ViemVaultRegistryReader", () => {
  it("returns basic info with correct field mapping", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const info = await reader.getVaultBasicInfo(MOCK_VAULT_ID);

    expect(info.depositor).toBe(MOCK_BASIC_INFO_RESULT.depositor);
    expect(info.depositorBtcPubKey).toBe(
      MOCK_BASIC_INFO_RESULT.depositorBtcPubKey,
    );
    expect(info.amount).toBe(MOCK_BASIC_INFO_RESULT.amount);
    expect(info.vaultProvider).toBe(MOCK_BASIC_INFO_RESULT.vaultProvider);
    expect(info.status).toBe(MOCK_BASIC_INFO_RESULT.status);
    expect(info.applicationEntryPoint).toBe(
      MOCK_BASIC_INFO_RESULT.applicationEntryPoint,
    );
    expect(info.createdAt).toBe(MOCK_BASIC_INFO_RESULT.createdAt);
  });

  it("returns protocol info with correct field mapping", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const info = await reader.getVaultProtocolInfo(MOCK_VAULT_ID);

    expect(info.depositorSignedPeginTx).toBe(
      MOCK_PROTOCOL_INFO_RESULT.depositorSignedPeginTx,
    );
    expect(info.universalChallengersVersion).toBe(1);
    expect(info.appVaultKeepersVersion).toBe(2);
    expect(info.offchainParamsVersion).toBe(3);
    expect(info.verifiedAt).toBe(MOCK_PROTOCOL_INFO_RESULT.verifiedAt);
    expect(info.depositorWotsPkHash).toBe(
      MOCK_PROTOCOL_INFO_RESULT.depositorWotsPkHash,
    );
    expect(info.hashlock).toBe(MOCK_PROTOCOL_INFO_RESULT.hashlock);
    expect(info.vaultProviderCommissionBps).toBe(100);
  });

  it("getVaultData fetches basic and protocol info in parallel", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const data = await reader.getVaultData(MOCK_VAULT_ID);

    expect(data.basic.depositor).toBe(MOCK_BASIC_INFO_RESULT.depositor);
    expect(data.protocol.offchainParamsVersion).toBe(3);
    expect(publicClient.readContract).toHaveBeenCalledTimes(2);
  });

  it("throws when vault has no pegin transaction (0x)", async () => {
    const publicClient = createMockPublicClient({
      protocolInfoResult: {
        ...MOCK_PROTOCOL_INFO_RESULT,
        depositorSignedPeginTx: "0x" as Hex,
      },
    });
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getVaultData(MOCK_VAULT_ID)).rejects.toThrow(
      "not found on-chain",
    );
  });

  it("passes correct contract address and vault ID to readContract", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await reader.getVaultBasicInfo(MOCK_VAULT_ID);

    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: MOCK_ADDRESS,
        functionName: "getBtcVaultBasicInfo",
        args: [MOCK_VAULT_ID],
      }),
    );
  });
});
