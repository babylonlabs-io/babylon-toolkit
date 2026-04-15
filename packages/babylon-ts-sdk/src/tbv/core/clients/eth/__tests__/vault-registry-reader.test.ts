import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";

import { ViemVaultRegistryReader } from "../vault-registry-reader";

const MOCK_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const MOCK_VAULT_ID =
  "0xaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd" as Hex;

const MOCK_BASIC_INFO_RESULT = [
  "0x0000000000000000000000000000000000000001" as Address, // depositor
  "0xaabb" as Hex, // depositorBtcPubKey
  1000000n, // amount
  "0x0000000000000000000000000000000000000002" as Address, // vaultProvider
  1, // status (viem returns number for uint8)
  "0x0000000000000000000000000000000000000003" as Address, // applicationEntryPoint
  1700000000n, // createdAt
] as const;

const MOCK_PROTOCOL_INFO_RESULT = [
  "0x0200" as Hex, // depositorSignedPeginTx
  1, // universalChallengersVersion (viem returns number for uint32)
  2, // appVaultKeepersVersion
  3, // offchainParamsVersion
  1700000001n, // verifiedAt
  "0xcc" as Hex, // depositorWotsPkHash
  "0xdd" as Hex, // hashlock
  0, // htlcVout
  "0xee" as Hex, // depositorPopSignature
  "0xff" as Hex, // prePeginTxHash
  100, // vaultProviderCommissionBps
] as const;

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

    expect(info.depositor).toBe(MOCK_BASIC_INFO_RESULT[0]);
    expect(info.depositorBtcPubKey).toBe(MOCK_BASIC_INFO_RESULT[1]);
    expect(info.amount).toBe(MOCK_BASIC_INFO_RESULT[2]);
    expect(info.vaultProvider).toBe(MOCK_BASIC_INFO_RESULT[3]);
    expect(info.status).toBe(MOCK_BASIC_INFO_RESULT[4]);
    expect(info.applicationEntryPoint).toBe(MOCK_BASIC_INFO_RESULT[5]);
    expect(info.createdAt).toBe(MOCK_BASIC_INFO_RESULT[6]);
  });

  it("returns protocol info with correct field mapping", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const info = await reader.getVaultProtocolInfo(MOCK_VAULT_ID);

    expect(info.depositorSignedPeginTx).toBe(MOCK_PROTOCOL_INFO_RESULT[0]);
    expect(info.universalChallengersVersion).toBe(1);
    expect(info.appVaultKeepersVersion).toBe(2);
    expect(info.offchainParamsVersion).toBe(3);
    expect(info.verifiedAt).toBe(MOCK_PROTOCOL_INFO_RESULT[4]);
    expect(info.vaultProviderCommissionBps).toBe(100);
  });

  it("getVaultData fetches basic and protocol info in parallel", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const data = await reader.getVaultData(MOCK_VAULT_ID);

    expect(data.basic.depositor).toBe(MOCK_BASIC_INFO_RESULT[0]);
    expect(data.protocol.offchainParamsVersion).toBe(3);
    expect(publicClient.readContract).toHaveBeenCalledTimes(2);
  });

  it("throws when vault has no pegin transaction (0x)", async () => {
    const publicClient = createMockPublicClient({
      protocolInfoResult: [
        "0x" as Hex,
        ...MOCK_PROTOCOL_INFO_RESULT.slice(1),
      ],
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
