import type { Address, Hex } from "viem";
import { getAbiItem, toEventSelector } from "viem";
import { describe, expect, it, vi } from "vitest";

import { BTCVaultRegistryABI } from "../../../contracts/abis/BTCVaultRegistry.abi";
import {
  isRegistrationLogsUnavailableError,
  RegistrationLogsUnavailableError,
} from "../registration-logs-error";
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
  vpCommissionResult?: unknown;
}) {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "getBtcVaultBasicInfo") {
        return overrides?.basicInfoResult ?? MOCK_BASIC_INFO_RESULT;
      }
      if (functionName === "getBtcVaultProtocolInfo") {
        return overrides?.protocolInfoResult ?? MOCK_PROTOCOL_INFO_RESULT;
      }
      if (functionName === "getOperationBtcKeyAtEpoch") {
        return overrides?.vpBtcKeyResult;
      }
      if (functionName === "getVaultProviderCommission") {
        return overrides?.vpCommissionResult;
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
          if (c.functionName === "getBtcVaultBasicInfo") {
            return overrides?.basicInfoResult ?? MOCK_BASIC_INFO_RESULT;
          }
          if (c.functionName === "getBtcVaultProtocolInfo") {
            const id = c.args?.[0] as Hex | undefined;
            const byId = id && overrides?.protocolInfoByVaultId?.get(id);
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

  it("getVaultData fetches basic and protocol info in a single multicall", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const data = await reader.getVaultData(MOCK_VAULT_ID);

    // Every field must survive the batched read unchanged — both structs are
    // signing-critical (refund / payout / broadcast rebind from this).
    expect(data.basic.depositor).toBe(MOCK_BASIC_INFO_RESULT.depositor);
    expect(data.basic.amount).toBe(MOCK_BASIC_INFO_RESULT.amount);
    expect(data.basic.vaultProvider).toBe(MOCK_BASIC_INFO_RESULT.vaultProvider);
    expect(data.protocol.depositorSignedPeginTx).toBe(
      MOCK_PROTOCOL_INFO_RESULT.depositorSignedPeginTx,
    );
    expect(data.protocol.depositorWotsPkHash).toBe(
      MOCK_PROTOCOL_INFO_RESULT.depositorWotsPkHash,
    );
    expect(data.protocol.hashlock).toBe(MOCK_PROTOCOL_INFO_RESULT.hashlock);
    expect(data.protocol.offchainParamsVersion).toBe(3);

    // One round-trip carrying both reads (the field assertions above already
    // prove each struct maps to the right side, so we don't pin call order).
    expect(publicClient.multicall).toHaveBeenCalledTimes(1);
    expect(publicClient.readContract).not.toHaveBeenCalled();
    const { contracts } = publicClient.multicall.mock.calls[0][0];
    expect(contracts).toHaveLength(2);
    expect(
      contracts.map((c: { functionName: string }) => c.functionName).sort(),
    ).toEqual(["getBtcVaultBasicInfo", "getBtcVaultProtocolInfo"]);
  });

  it("getVaultData rejects when the multicall reverts (hard-fail, matching the old parallel reads)", async () => {
    const publicClient = {
      readContract: vi.fn(),
      multicall: vi
        .fn()
        .mockRejectedValue(new Error("execution reverted: Vault not found")),
    };
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getVaultData(MOCK_VAULT_ID)).rejects.toThrow(
      /execution reverted/,
    );
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

  it("getProtocolInfoBatch names the empty vault, not the first one, when a later entry has no pegin transaction", async () => {
    const populatedId =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
    const emptyId =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;
    const publicClient = createMockPublicClient({
      protocolInfoByVaultId: new Map<Hex, unknown>([
        [populatedId, MOCK_PROTOCOL_INFO_RESULT],
        [
          emptyId,
          { ...MOCK_PROTOCOL_INFO_RESULT, depositorSignedPeginTx: "0x" },
        ],
      ]),
    });
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    // The message is matched as a substring by the vault app's error mapper
    // (utils/errors/depositErrors.ts) to render "still confirming" copy, so
    // both the wording and the per-entry vault id are load-bearing.
    await expect(
      reader.getProtocolInfoBatch([populatedId, emptyId]),
    ).rejects.toThrow(
      `Vault ${emptyId} not found on-chain or has no pegin transaction`,
    );
  });

  it("getProtocolInfoBatch returns an empty array without calling the chain", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getProtocolInfoBatch([])).resolves.toEqual([]);
    expect(publicClient.multicall).not.toHaveBeenCalled();
  });

  it("getVaultProviderGenesisBtcPubKey returns the prefix-stripped lowercase hex for a valid x-only point", async () => {
    const publicClient = createMockPublicClient({
      vpBtcKeyResult: `0x${VALID_XONLY_HEX}` as Hex,
    });
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const key = await reader.getVaultProviderGenesisBtcPubKey(MOCK_ADDRESS);
    expect(key).toBe(VALID_XONLY_HEX);
  });

  // The genesis key is read as "the operation key at epoch 0" because
  // vault-contracts-aave-v4#539 removes the dedicated `getVaultProviderBTCKey`
  // getter. Both halves matter and neither is checked by the assertions above:
  // the wrong function name reverts on selector mismatch once #539 deploys, and
  // a non-zero epoch would silently return a *rotated* key, which would then be
  // used as the genesis fallback for epoch resolution.
  it("getVaultProviderGenesisBtcPubKey reads getOperationBtcKeyAtEpoch at epoch 0", async () => {
    const publicClient = createMockPublicClient({
      vpBtcKeyResult: `0x${VALID_XONLY_HEX}` as Hex,
    });
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await reader.getVaultProviderGenesisBtcPubKey(MOCK_ADDRESS);

    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "getOperationBtcKeyAtEpoch",
        args: [MOCK_ADDRESS, 0n],
      }),
    );
  });

  // A registry that predates RFC-006 has no `getOperationBtcKeyAtEpoch`, so the
  // read reverts rather than returning a plausible-looking key. That is the
  // intended failure: every caller of this method also resolves keys through
  // `OperationKeyReader`, so all of them already require an RFC-006 registry.
  it("getVaultProviderGenesisBtcPubKey surfaces a revert from a pre-RFC-006 registry", async () => {
    const publicClient = {
      readContract: vi.fn(async () => {
        throw new Error('Unknown function: "getOperationBtcKeyAtEpoch"');
      }),
    };
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(
      reader.getVaultProviderGenesisBtcPubKey(MOCK_ADDRESS),
    ).rejects.toThrow(/getOperationBtcKeyAtEpoch/);
  });

  it("getVaultProviderGenesisBtcPubKey throws on a malformed (non-hex / wrong length) value", async () => {
    const publicClient = createMockPublicClient({
      vpBtcKeyResult: "0xdeadbeef" as Hex,
    });
    const reader = new ViemVaultRegistryReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(
      reader.getVaultProviderGenesisBtcPubKey(MOCK_ADDRESS),
    ).rejects.toThrow(/unexpected value/);
  });

  it("getVaultProviderGenesisBtcPubKey throws when the bytes32 is not a valid x-only secp256k1 point", async () => {
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
      reader.getVaultProviderGenesisBtcPubKey(MOCK_ADDRESS),
    ).rejects.toThrow(/not on the secp256k1 curve/);
  });

  describe("getVaultProviderCommission", () => {
    it("returns the bps when the contract value is inside the [0, 9999] range", async () => {
      const publicClient = createMockPublicClient({ vpCommissionResult: 150 });
      const reader = new ViemVaultRegistryReader(
        publicClient as never,
        MOCK_ADDRESS,
      );

      await expect(
        reader.getVaultProviderCommission(MOCK_ADDRESS),
      ).resolves.toBe(150);
    });

    it("accepts the inclusive 0 lower bound", async () => {
      const publicClient = createMockPublicClient({ vpCommissionResult: 0 });
      const reader = new ViemVaultRegistryReader(
        publicClient as never,
        MOCK_ADDRESS,
      );

      await expect(
        reader.getVaultProviderCommission(MOCK_ADDRESS),
      ).resolves.toBe(0);
    });

    it("accepts the inclusive 9999 upper bound", async () => {
      const publicClient = createMockPublicClient({ vpCommissionResult: 9999 });
      const reader = new ViemVaultRegistryReader(
        publicClient as never,
        MOCK_ADDRESS,
      );

      await expect(
        reader.getVaultProviderCommission(MOCK_ADDRESS),
      ).resolves.toBe(9999);
    });

    it("throws when the contract value exceeds 9999 (signals wrong address or ABI drift)", async () => {
      const publicClient = createMockPublicClient({
        vpCommissionResult: 10000,
      });
      const reader = new ViemVaultRegistryReader(
        publicClient as never,
        MOCK_ADDRESS,
      );

      await expect(
        reader.getVaultProviderCommission(MOCK_ADDRESS),
      ).rejects.toThrow(/outside the protocol range \[0, 9999\]/);
    });

    it("throws when the contract value is negative", async () => {
      const publicClient = createMockPublicClient({ vpCommissionResult: -1 });
      const reader = new ViemVaultRegistryReader(
        publicClient as never,
        MOCK_ADDRESS,
      );

      await expect(
        reader.getVaultProviderCommission(MOCK_ADDRESS),
      ).rejects.toThrow(/outside the protocol range \[0, 9999\]/);
    });

    it("throws when the contract value is not an integer", async () => {
      const publicClient = createMockPublicClient({ vpCommissionResult: 12.5 });
      const reader = new ViemVaultRegistryReader(
        publicClient as never,
        MOCK_ADDRESS,
      );

      await expect(
        reader.getVaultProviderCommission(MOCK_ADDRESS),
      ).rejects.toThrow(/outside the protocol range \[0, 9999\]/);
    });
  });

  describe("getMaxAcceptableCommissionBpsBatch", () => {
    const CREATED_AT = 11_561_176n;
    const VAULT_A =
      "0xaaaa00000000000000000000000000000000000000000000000000000000000a" as Hex;
    const VAULT_B =
      "0xbbbb00000000000000000000000000000000000000000000000000000000000b" as Hex;
    const OTHER_VAULT =
      "0xcccc00000000000000000000000000000000000000000000000000000000000c" as Hex;

    // Decoded logs as viem's strict getLogs hands them back: topics lowercase.
    const v1Log = (vaultId: Hex) => ({
      eventName: "PegInSubmitted",
      args: { vaultId },
      blockNumber: CREATED_AT,
    });
    const v2Log = (vaultId: Hex, maxAcceptableCommissionBps: number) => ({
      eventName: "PegInSubmittedV2",
      args: { vaultId, maxAcceptableCommissionBps },
      blockNumber: CREATED_AT,
    });

    function readerWithLogs(logs: unknown[]) {
      const publicClient = { getLogs: vi.fn().mockResolvedValue(logs) };
      const reader = new ViemVaultRegistryReader(
        publicClient as never,
        MOCK_ADDRESS,
      );
      return { publicClient, reader };
    }

    it("returns each vault's ceiling from one query of both registration events at the block, aligned to the input order", async () => {
      const { publicClient, reader } = readerWithLogs([
        v1Log(VAULT_A),
        v2Log(VAULT_A, 35),
        v1Log(VAULT_B),
        v2Log(VAULT_B, 125),
      ]);

      await expect(
        reader.getMaxAcceptableCommissionBpsBatch(
          [VAULT_B, VAULT_A],
          CREATED_AT,
        ),
      ).resolves.toEqual([125, 35]);

      // One answer must carry BOTH events so "no V2" can be told apart from
      // "the node served nothing": exactly the registration block, strict so
      // a log that does not decode against the ABI cannot pass as args: {}.
      expect(publicClient.getLogs).toHaveBeenCalledTimes(1);
      expect(publicClient.getLogs).toHaveBeenCalledWith({
        address: MOCK_ADDRESS,
        events: [
          getAbiItem({ abi: BTCVaultRegistryABI, name: "PegInSubmitted" }),
          getAbiItem({ abi: BTCVaultRegistryABI, name: "PegInSubmittedV2" }),
        ],
        fromBlock: CREATED_AT,
        toBlock: CREATED_AT,
        strict: true,
      });
    });

    // The node returns lowercase topics; a checksummed or uppercase caller id
    // must still match rather than read as "no log".
    it("matches vault ids case-insensitively", async () => {
      const { reader } = readerWithLogs([v1Log(VAULT_A), v2Log(VAULT_A, 35)]);

      await expect(
        reader.getMaxAcceptableCommissionBpsBatch(
          [VAULT_A.toUpperCase().replace("0X", "0x") as Hex],
          CREATED_AT,
        ),
      ).resolves.toEqual([35]);
    });

    // Every registered vault has its PegInSubmitted log in its createdAt
    // block, so an empty answer means the node did not serve the block's logs
    // (load-balanced public RPCs answer [] for a block a backend lacks).
    it("throws the typed transient error when the node returns no registration logs for the block", async () => {
      const { reader } = readerWithLogs([]);

      const caught = await reader
        .getMaxAcceptableCommissionBpsBatch([VAULT_A], CREATED_AT)
        .then(
          () => null,
          (err: unknown) => err,
        );

      expect(caught).toBeInstanceOf(RegistrationLogsUnavailableError);
      expect(isRegistrationLogsUnavailableError(caught)).toBe(true);
      expect((caught as Error).message).toContain(`block ${CREATED_AT}`);
    });

    it("throws naming the vault when only its V1 log is present (registered before PegInSubmittedV2)", async () => {
      const { reader } = readerWithLogs([v1Log(VAULT_A)]);

      const caught = await reader
        .getMaxAcceptableCommissionBpsBatch([VAULT_A], CREATED_AT)
        .then(
          () => null,
          (err: unknown) => err,
        );

      expect(isRegistrationLogsUnavailableError(caught)).toBe(false);
      expect((caught as Error).message).toMatch(
        new RegExp(
          `Vault ${VAULT_A} was registered before the registry emitted the depositor's commission ceiling`,
        ),
      );
    });

    it("throws when the block's registration logs do not include the vault at all", async () => {
      const { reader } = readerWithLogs([
        v1Log(OTHER_VAULT),
        v2Log(OTHER_VAULT, 5),
      ]);

      await expect(
        reader.getMaxAcceptableCommissionBpsBatch([VAULT_A], CREATED_AT),
      ).rejects.toThrow(
        `Vault ${VAULT_A} has no registration log at its on-chain registration block ${CREATED_AT}`,
      );
    });

    it("throws when a vault has more than one V2 log at the block", async () => {
      const { reader } = readerWithLogs([
        v1Log(VAULT_A),
        v2Log(VAULT_A, 35),
        v2Log(VAULT_A, 35),
      ]);

      await expect(
        reader.getMaxAcceptableCommissionBpsBatch([VAULT_A], CREATED_AT),
      ).rejects.toThrow(/found 2 PegInSubmittedV2 logs/);
    });

    it("returns an empty array without calling the chain for no vault ids", async () => {
      const { publicClient, reader } = readerWithLogs([]);

      await expect(
        reader.getMaxAcceptableCommissionBpsBatch([], CREATED_AT),
      ).resolves.toEqual([]);
      expect(publicClient.getLogs).not.toHaveBeenCalled();
    });
  });

  // Pins both ABI entries to the deployed contract: these are the topic0
  // values of the V1 and V2 logs observed side by side in one registration
  // block on the devnet registry (Sepolia, vault-contracts-aave-v4 #548).
  it.each([
    [
      "PegInSubmitted",
      "0x01a09d956e6fb4dce99bc1a91b2a9b1bc7d3345f3a69e13029cf365d4231a19b",
    ],
    [
      "PegInSubmittedV2",
      "0x4507e4ff3dfdfa42e9b1daf5469138047f35e6a7bf13840ce822d4ddeb5e79ea",
    ],
  ] as const)(
    "declares %s with the deployed contract's event selector",
    (name, selector) => {
      const event = getAbiItem({ abi: BTCVaultRegistryABI, name });
      expect(toEventSelector(event)).toBe(selector);
    },
  );

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
