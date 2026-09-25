import type { Address, Hex } from "viem";
import { getAbiItem, toEventSelector } from "viem";
import { describe, expect, it, vi } from "vitest";

import { BTCVaultRegistryABI } from "../../../contracts/abis/BTCVaultRegistry.abi";
import {
  isVaultClaimableByNotFoundError,
  VaultClaimableByNotFoundError,
} from "../claimable-event-error";
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

  describe("registration records at the registration block", () => {
    const CREATED_AT = 11_561_176n;
    const VAULT_A =
      "0xaaaa00000000000000000000000000000000000000000000000000000000000a" as Hex;
    const VAULT_B =
      "0xbbbb00000000000000000000000000000000000000000000000000000000000b" as Hex;
    const OTHER_VAULT =
      "0xcccc00000000000000000000000000000000000000000000000000000000000c" as Hex;
    const DEPOSITOR = "0x0000000000000000000000000000000000000001" as Address;
    const OTHER_DEPOSITOR =
      "0x0000000000000000000000000000000000000009" as Address;
    const VAULT_PROVIDER =
      "0x0000000000000000000000000000000000000002" as Address;
    // Minimal consensus-encoded tx (v2, one input, one P2TR output, no
    // witness): the shape submitPeginRequest registers as unsignedPrePeginTx.
    const UNSIGNED_PREPEGIN_TX =
      `0x02000000` +
      `01${"11".repeat(32)}0000000000ffffffff` +
      `01e803000000000000225120${"00".repeat(32)}` +
      `00000000`;
    const PAYOUT_SCRIPT = `0x5120${"79".repeat(32)}` as Hex;

    // Decoded logs as viem's strict getLogs hands them back: args keyed by the
    // ABI input names, topics lowercase.
    const v1Log = (vaultId: Hex) => ({
      eventName: "PegInSubmitted",
      args: { vaultId },
      blockNumber: CREATED_AT,
    });
    const v2Log = (
      vaultId: Hex,
      maxAcceptableCommissionBps: number,
      over: Partial<{
        htlcVout: number;
        depositorPayoutBtcAddress: Hex;
        depositor: Address;
        unsignedPrePeginTx: Hex;
      }> = {},
    ) => ({
      eventName: "PegInSubmittedV2",
      args: {
        vaultId,
        peginTxHash: `0x${"ee".repeat(32)}` as Hex,
        depositor: DEPOSITOR,
        vaultProvider: VAULT_PROVIDER,
        amount: 1_000_000n,
        vaultCoreVersion: 3,
        universalChallengersVersion: 5,
        appVaultKeepersVersion: 4,
        proverCircuitVersion: 7,
        offchainParamsVersion: 3,
        referralCode: 0,
        depositorPayoutBtcAddress: PAYOUT_SCRIPT,
        depositorWotsPkHash: `0x${"cc".repeat(32)}` as Hex,
        hashlock: `0x${"dd".repeat(32)}` as Hex,
        btcPopSignature: "0x" as Hex,
        htlcVout: 0,
        unsignedPrePeginTx: UNSIGNED_PREPEGIN_TX as Hex,
        depositorSignedPeginTx: "0x0200" as Hex,
        vpKeyEpoch: 1n,
        appKeeperKeyEpoch: 1n,
        ucKeyEpoch: 1n,
        maxAcceptableCommissionBps,
        ...over,
      },
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

    describe("getRegistrationRecordsAtBlock", () => {
      it("decodes every V2 registration in the block: payout script, circuit version, ceiling, and the logged unsigned Pre-PegIn", async () => {
        const { publicClient, reader } = readerWithLogs([
          v1Log(VAULT_A),
          v2Log(VAULT_A, 35),
          v1Log(VAULT_B),
          v2Log(VAULT_B, 125, { htlcVout: 1 }),
        ]);

        const records = await reader.getRegistrationRecordsAtBlock(CREATED_AT);

        expect(records.map((r) => r.vaultId)).toEqual([VAULT_A, VAULT_B]);
        expect(records[0]).toMatchObject({
          depositor: DEPOSITOR,
          vaultProvider: VAULT_PROVIDER,
          amount: 1_000_000n,
          vaultCoreVersion: 3,
          proverCircuitVersion: 7,
          peginTxHash: `0x${"ee".repeat(32)}`,
          depositorPayoutScriptPubKey: PAYOUT_SCRIPT,
          maxAcceptableCommissionBps: 35,
          unsignedPrePeginTx: UNSIGNED_PREPEGIN_TX,
          blockNumber: CREATED_AT,
        });
        expect(records).toHaveLength(2);
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

      // Every registered vault has its PegInSubmitted log in its createdAt
      // block, so an empty answer means the node did not serve the block's
      // logs (load-balanced public RPCs answer [] for a block a backend lacks).
      it("throws the typed transient error when the node returns no registration logs for the block", async () => {
        const { reader } = readerWithLogs([]);

        const caught = await reader
          .getRegistrationRecordsAtBlock(CREATED_AT)
          .then(
            () => null,
            (err: unknown) => err,
          );

        expect(caught).toBeInstanceOf(RegistrationLogsUnavailableError);
        expect(isRegistrationLogsUnavailableError(caught)).toBe(true);
      });

      // The registry emits V1 and V2 together on every submission
      // (vault-contracts-aave-v4 PeginLogic.sol:144-147 @ c559f5c2), so a
      // V1-only answer is as readily a partial one as a pre-#548 registry.
      it("throws the typed transient error when the block carries V1 registrations only", async () => {
        const { reader } = readerWithLogs([v1Log(VAULT_A)]);

        const caught = await reader
          .getRegistrationRecordsAtBlock(CREATED_AT)
          .then(
            () => null,
            (err: unknown) => err,
          );

        expect(caught).toBeInstanceOf(RegistrationLogsUnavailableError);
        expect((caught as Error).message).toContain(
          `either the node served a partial answer for block ${CREATED_AT} (retry, preferably another node) or the registry predates the depositor's commission ceiling`,
        );
      });

      it("throws when a vault has more than one V2 log at the block", async () => {
        const { reader } = readerWithLogs([
          v1Log(VAULT_A),
          v2Log(VAULT_A, 35),
          v2Log(VAULT_A, 35),
        ]);

        await expect(
          reader.getRegistrationRecordsAtBlock(CREATED_AT),
        ).rejects.toThrow(
          `Expected one PegInSubmittedV2 log for vault ${VAULT_A} at block ${CREATED_AT}, found more than one`,
        );
      });

      it("decodes a stranger's odd registration in the same block without failing the read", async () => {
        const { reader } = readerWithLogs([
          v1Log(VAULT_A),
          v2Log(VAULT_A, 35),
          v1Log(VAULT_B),
          v2Log(VAULT_B, 40, {
            depositor: OTHER_DEPOSITOR,
            depositorPayoutBtcAddress: "0x" as Hex,
            unsignedPrePeginTx: "0x00" as Hex,
          }),
        ]);

        const records = await reader.getRegistrationRecordsAtBlock(CREATED_AT);

        expect(records.map((r) => r.vaultId)).toEqual([VAULT_A, VAULT_B]);
      });
    });

    describe("getMaxAcceptableCommissionBpsBatch", () => {
      it("returns each vault's ceiling aligned to the input order", async () => {
        const { reader } = readerWithLogs([
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

      it("throws the typed transient error when the block's registration logs do not include the vault at all", async () => {
        const { reader } = readerWithLogs([
          v1Log(OTHER_VAULT),
          v2Log(OTHER_VAULT, 5),
        ]);

        const caught = await reader
          .getMaxAcceptableCommissionBpsBatch([VAULT_A], CREATED_AT)
          .then(
            () => null,
            (err: unknown) => err,
          );

        expect(caught).toBeInstanceOf(RegistrationLogsUnavailableError);
        expect((caught as Error).message).toContain(
          `Vault ${VAULT_A} has no PegInSubmittedV2 registration log at its on-chain registration block ${CREATED_AT}`,
        );
      });

      it("returns nothing for an empty id list without touching the node", async () => {
        const { publicClient, reader } = readerWithLogs([]);

        await expect(
          reader.getMaxAcceptableCommissionBpsBatch([], CREATED_AT),
        ).resolves.toEqual([]);
        expect(publicClient.getLogs).not.toHaveBeenCalled();
      });
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
    // keccak256 of the signature read off vault-contracts-aave-v4
    // Events.sol: VaultClaimableBy(bytes32,bytes32,bytes32,uint16,uint16,
    // uint16,uint16,uint16). Pins our ABI entry to the contract's shape
    // independently of the entry itself.
    [
      "VaultClaimableBy",
      "0x4998d7834aaca3515bed86999902bf801ba9d37616b2bfa224d72c6ab9ca3801",
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

  describe("getVaultClaimableBy", () => {
    const CREATED_AT = 11_000_000n;
    const CHUNK = 7_200n;
    const VAULT = MOCK_VAULT_ID;
    // secp256k1 G.x — on the curve, so assertOnChainBtcPubkey accepts it.
    const CLAIMER =
      "0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" as Hex;
    const EVENT = getAbiItem({
      abi: BTCVaultRegistryABI,
      name: "VaultClaimableBy",
    });

    const claimableLog = (blockNumber: bigint, transactionHash?: Hex) => ({
      eventName: "VaultClaimableBy",
      transactionHash:
        transactionHash ??
        (`0x${blockNumber.toString(16).padStart(64, "0")}` as Hex),
      args: {
        vaultId: VAULT,
        peginTxHash: `0x${"ee".repeat(32)}` as Hex,
        claimerPK: CLAIMER,
        vaultCoreVersion: 3,
        proverCircuitVersion: 7,
        offchainParamsVersion: 3,
        universalChallengersVersion: 5,
        appVaultKeepersVersion: 4,
      },
      blockNumber,
    });

    /** A node whose logs sit at `logsAt`; answers only the chunk that holds them. */
    function readerWithClaimable(
      finalized: bigint,
      logsAt: bigint[],
      { sameTransaction = false }: { sameTransaction?: boolean } = {},
    ) {
      const publicClient = {
        getBlock: vi.fn().mockResolvedValue({ number: finalized }),
        getLogs: vi.fn(
          async ({
            fromBlock,
            toBlock,
          }: {
            fromBlock: bigint;
            toBlock: bigint;
          }) =>
            logsAt
              .filter((b) => b >= fromBlock && b <= toBlock)
              .map((b) =>
                claimableLog(
                  b,
                  sameTransaction ? (`0x${"7a".repeat(32)}` as Hex) : undefined,
                ),
              ),
        ),
      };
      const reader = new ViemVaultRegistryReader(
        publicClient as never,
        MOCK_ADDRESS,
      );
      return { publicClient, reader };
    }

    it("exposes the event in the registry ABI with its eight inputs in contract order", () => {
      expect(
        EVENT.inputs.map((i) => `${i.name}:${i.type}:${i.indexed ? "i" : "d"}`),
      ).toEqual([
        "vaultId:bytes32:i",
        "peginTxHash:bytes32:i",
        "claimerPK:bytes32:i",
        "vaultCoreVersion:uint16:d",
        "proverCircuitVersion:uint16:d",
        "offchainParamsVersion:uint16:d",
        "universalChallengersVersion:uint16:d",
        "appVaultKeepersVersion:uint16:d",
      ]);
    });

    it("finds a recent redemption in the newest chunk with one filtered query", async () => {
      const finalized = CREATED_AT + 20_000n;
      const { publicClient, reader } = readerWithClaimable(finalized, [
        finalized - 10n,
      ]);

      await expect(
        reader.getVaultClaimableBy(VAULT, CLAIMER, CREATED_AT),
      ).resolves.toEqual({
        blockNumber: finalized - 10n,
        claimerPk: CLAIMER.slice(2),
        peginTxHash: `0x${"ee".repeat(32)}`,
        vaultCoreVersion: 3,
        proverCircuitVersion: 7,
        offchainParamsVersion: 3,
        universalChallengersVersion: 5,
        appVaultKeepersVersion: 4,
      });
      expect(publicClient.getLogs).toHaveBeenCalledTimes(1);
      expect(publicClient.getLogs).toHaveBeenCalledWith({
        address: MOCK_ADDRESS,
        event: EVENT,
        args: { vaultId: VAULT, claimerPK: CLAIMER },
        fromBlock: finalized - CHUNK + 1n,
        toBlock: finalized,
        strict: true,
      });
    });

    it("walks older chunks newest-first, never past createdAt, and stops at the first hit", async () => {
      const finalized = CREATED_AT + 2n * CHUNK + 100n;
      const { publicClient, reader } = readerWithClaimable(finalized, [
        CREATED_AT + 5n,
      ]);

      const event = await reader.getVaultClaimableBy(
        VAULT,
        CLAIMER,
        CREATED_AT,
      );

      expect(event.blockNumber).toBe(CREATED_AT + 5n);
      const ranges = publicClient.getLogs.mock.calls.map(
        ([p]: [{ fromBlock: bigint; toBlock: bigint }]) => [
          p.fromBlock,
          p.toBlock,
        ],
      );
      expect(ranges).toEqual([
        [finalized - CHUNK + 1n, finalized],
        [finalized - 2n * CHUNK + 1n, finalized - CHUNK],
        [CREATED_AT, finalized - 2n * CHUNK],
      ]);
    });

    it("throws the typed not-found error after scanning down to createdAt when no log exists", async () => {
      const finalized = CREATED_AT + CHUNK + 1n;
      const { publicClient, reader } = readerWithClaimable(finalized, []);

      const caught = await reader
        .getVaultClaimableBy(VAULT, CLAIMER, CREATED_AT)
        .then(
          () => null,
          (err: unknown) => err,
        );

      expect(caught).toBeInstanceOf(VaultClaimableByNotFoundError);
      expect(isVaultClaimableByNotFoundError(caught)).toBe(true);
      expect(caught).toMatchObject({
        vaultId: VAULT,
        fromBlock: CREATED_AT,
        toBlock: finalized,
      });
      expect(publicClient.getLogs).toHaveBeenCalledTimes(2);
    });

    it("scans up to the finalized block only, so a log above it is not found yet", async () => {
      const finalized = CREATED_AT + 100n;
      const { publicClient, reader } = readerWithClaimable(finalized, [
        finalized + 5n,
      ]);

      const caught = await reader
        .getVaultClaimableBy(VAULT, CLAIMER, CREATED_AT)
        .then(
          () => null,
          (err: unknown) => err,
        );

      expect(caught).toBeInstanceOf(VaultClaimableByNotFoundError);
      expect(caught).toMatchObject({
        fromBlock: CREATED_AT,
        toBlock: finalized,
      });
      expect(publicClient.getBlock).toHaveBeenCalledWith({
        blockTag: "finalized",
      });
      expect(publicClient.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ toBlock: finalized }),
      );
    });

    it("refuses redemption logs that span transactions, since a vault is redeemed once", async () => {
      const finalized = CREATED_AT + 50n;
      const { reader } = readerWithClaimable(finalized, [
        CREATED_AT + 1n,
        CREATED_AT + 2n,
      ]);

      await expect(
        reader.getVaultClaimableBy(VAULT, CLAIMER, CREATED_AT),
      ).rejects.toThrow(/across 2 transactions/);
    });

    // redeemForDepositor emits the VP's key then the depositor's in ONE
    // transaction; when those keys are equal the claimerPK filter matches
    // both, and they are the same authorization, not an inconsistent node.
    it("accepts the duplicate emission of one transaction, as when the vault provider key is the depositor key", async () => {
      const finalized = CREATED_AT + 50n;
      const { reader } = readerWithClaimable(
        finalized,
        [CREATED_AT + 1n, CREATED_AT + 1n],
        { sameTransaction: true },
      );

      await expect(
        reader.getVaultClaimableBy(VAULT, CLAIMER, CREATED_AT),
      ).resolves.toMatchObject({ blockNumber: CREATED_AT + 1n });
    });

    it("refuses to scan when the finalized block is below the vault's registration block", async () => {
      const { publicClient, reader } = readerWithClaimable(CREATED_AT - 1n, []);

      await expect(
        reader.getVaultClaimableBy(VAULT, CLAIMER, CREATED_AT),
      ).rejects.toThrow(
        /Finalized block .* is below vault .* registration block/,
      );
      expect(publicClient.getLogs).not.toHaveBeenCalled();
    });

    it("queries the claimable log with the vault id lower-cased, whatever case the caller used", async () => {
      // viem re-filters decoded logs against `args` with `===` on lower-case
      // hex (parseEventLogs.ts:172-188), so the query must carry that form.
      const finalized = CREATED_AT + 20n;
      const { publicClient, reader } = readerWithClaimable(finalized, [
        finalized - 1n,
      ]);
      const upperCaseVaultId = `0x${VAULT.slice(2).toUpperCase()}` as Hex;

      await expect(
        reader.getVaultClaimableBy(upperCaseVaultId, CLAIMER, CREATED_AT),
      ).resolves.toMatchObject({ blockNumber: finalized - 1n });
      expect(publicClient.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { vaultId: VAULT, claimerPK: CLAIMER },
        }),
      );
    });

    it("refuses a claimer key that is not on the curve before touching the node", async () => {
      const { publicClient, reader } = readerWithClaimable(CREATED_AT + 1n, []);

      await expect(
        reader.getVaultClaimableBy(
          VAULT,
          `0x${"00".repeat(32)}` as Hex,
          CREATED_AT,
        ),
      ).rejects.toThrow(/not a valid secp256k1|curve/i);
      expect(publicClient.getLogs).not.toHaveBeenCalled();
    });
  });
});
