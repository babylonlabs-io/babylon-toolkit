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
  protocolInfoByVaultId?: Map<Hex, unknown>;
  vpBtcKeyResult?: unknown;
}) {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "getBtcVaultBasicInfo") {
        return overrides?.basicInfoResult ?? MOCK_BASIC_INFO_RESULT;
      }
      if (functionName === "getBtcVaultProtocolInfo") {
        return overrides?.protocolInfoResult ?? MOCK_PROTOCOL_INFO_RESULT;
      }
      if (functionName === "getVaultProviderBTCKey") {
        return overrides?.vpBtcKeyResult;
      }
      throw new Error(`Unknown function: ${functionName}`);
    }),
    multicall: vi.fn(
      async ({
        contracts,
      }: {
        contracts: Array<{
          functionName: string;
          args?: readonly unknown[];
        }>;
      }) => {
        return contracts.map((c) => {
          if (c.functionName === "getBtcVaultProtocolInfo") {
            const id = c.args?.[0] as Hex | undefined;
            const byId =
              id && overrides?.protocolInfoByVaultId?.get(id);
            return (
              byId ?? overrides?.protocolInfoResult ?? MOCK_PROTOCOL_INFO_RESULT
            );
          }
          throw new Error(`Unknown function in multicall: ${c.functionName}`);
        });
      },
    ),
  };
}

// A real x-only secp256k1 point (the x-coordinate of the standard
// generator G). Used as a "valid" pubkey fixture.
const VALID_XONLY_HEX =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

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

  it("getVaultProviderBtcPubKey returns the prefix-stripped lowercase hex for a valid x-only point", async () => {
    const publicClient = createMockPublicClient({
      vpBtcKeyResult: `0x${VALID_XONLY_HEX}` as Hex,
    });
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const key = await reader.getVaultProviderBtcPubKey(MOCK_ADDRESS);
    expect(key).toBe(VALID_XONLY_HEX);
  });

  it("getVaultProviderBtcPubKey throws on a malformed (non-hex / wrong length) value", async () => {
    const publicClient = createMockPublicClient({
      vpBtcKeyResult: "0xdeadbeef" as Hex,
    });
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(
      reader.getVaultProviderBtcPubKey(MOCK_ADDRESS),
    ).rejects.toThrow(/unexpected value/);
  });

  it("getVaultProviderBtcPubKey throws when the bytes32 is not a valid x-only secp256k1 point", async () => {
    // 32-byte all-zeros is well-formed bytes32 but not on the curve.
    // Without the curve check, this would have branded as a trusted
    // OnChainBtcPubkey and degraded into a generic BIP-322 verify
    // failure later. The brand should mean "validated x-only pubkey".
    const publicClient = createMockPublicClient({
      vpBtcKeyResult: `0x${"00".repeat(32)}` as Hex,
    });
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(
      reader.getVaultProviderBtcPubKey(MOCK_ADDRESS),
    ).rejects.toThrow(/not on the secp256k1 curve/);
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

  describe("getOffchainParamsVersionsByVaultIds", () => {
    const VAULT_ID_A =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
    const VAULT_ID_B =
      "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex;

    it("returns versions in input order via a single multicall", async () => {
      const publicClient = createMockPublicClient({
        protocolInfoByVaultId: new Map([
          [VAULT_ID_A, { ...MOCK_PROTOCOL_INFO_RESULT, offchainParamsVersion: 7 }],
          [VAULT_ID_B, { ...MOCK_PROTOCOL_INFO_RESULT, offchainParamsVersion: 3 }],
        ]),
      });
      const reader = new ViemVaultRegistryReader(
        publicClient as never,
        MOCK_ADDRESS,
      );

      const versions = await reader.getOffchainParamsVersionsByVaultIds([
        VAULT_ID_A,
        VAULT_ID_B,
      ]);

      expect(versions).toEqual([7, 3]);
      expect(publicClient.multicall).toHaveBeenCalledTimes(1);
    });

    it("returns an empty array for an empty input without making any RPC", async () => {
      const publicClient = createMockPublicClient();
      const reader = new ViemVaultRegistryReader(
        publicClient as never,
        MOCK_ADDRESS,
      );

      const versions = await reader.getOffchainParamsVersionsByVaultIds([]);

      expect(versions).toEqual([]);
      expect(publicClient.multicall).not.toHaveBeenCalled();
      expect(publicClient.readContract).not.toHaveBeenCalled();
    });

    it("throws if any vault has no pegin transaction", async () => {
      const publicClient = createMockPublicClient({
        protocolInfoByVaultId: new Map([
          [VAULT_ID_A, MOCK_PROTOCOL_INFO_RESULT],
          [
            VAULT_ID_B,
            { ...MOCK_PROTOCOL_INFO_RESULT, depositorSignedPeginTx: "0x" as Hex },
          ],
        ]),
      });
      const reader = new ViemVaultRegistryReader(
        publicClient as never,
        MOCK_ADDRESS,
      );

      await expect(
        reader.getOffchainParamsVersionsByVaultIds([VAULT_ID_A, VAULT_ID_B]),
      ).rejects.toThrow(/not found on-chain/);
    });

    it("throws if a vault's offchainParamsVersion is not a valid uint32", async () => {
      // Same hardening as `getLatestOffchainParamsVersion`: a malformed
      // RPC payload mustn't propagate as a NaN/fractional version label.
      const publicClient = createMockPublicClient({
        protocolInfoByVaultId: new Map([
          [
            VAULT_ID_A,
            {
              ...MOCK_PROTOCOL_INFO_RESULT,
              offchainParamsVersion: -1,
            },
          ],
        ]),
      });
      const reader = new ViemVaultRegistryReader(
        publicClient as never,
        MOCK_ADDRESS,
      );

      await expect(
        reader.getOffchainParamsVersionsByVaultIds([VAULT_ID_A]),
      ).rejects.toThrow(/Invalid offchainParamsVersion from contract/);
    });
  });
});
