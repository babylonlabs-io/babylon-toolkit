/**
 * Vault-tier payout signing helper tests.
 *
 * After the SDK migration, the bulk of signing orchestration lives in the
 * SDK (`runDepositorPresignFlow`) and has its own test suite. What remains here
 * is app-specific wiring: pubkey sorting, VP pubkey resolution, and the
 * on-chain signing-context builder.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../../../clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: vi.fn(),
  getVaultProviderGenesisBtcPubkeyFromChain: vi.fn(),
  getVaultKeyEpochsFromChain: vi.fn().mockResolvedValue({
    vpKeyEpoch: 0n,
    appKeeperKeyEpoch: 0n,
    ucKeyEpoch: 0n,
  }),
}));

// Un-rotated operator set: every participant's bonded key is its roster key and
// the registry backfills BIP-86, so resolution is a pass-through here and these
// cases stay about the surrounding context wiring.
const mockResolveParticipantKeysAtEpochs = vi.hoisted(() => vi.fn());
vi.mock("@babylonlabs-io/ts-sdk/tbv/core", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  resolveParticipantKeysAtEpochs: (...args: unknown[]) =>
    mockResolveParticipantKeysAtEpochs(...args),
}));

vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn().mockReturnValue("testnet"),
}));

const mockGetTimelockPeginByVersion = vi.fn();
const mockGetOffchainParamsByVersion = vi.fn();
const mockGetVaultKeepersByVersion = vi.fn();
const mockGetUniversalChallengersByVersion = vi.fn();
const mockGetCurrentVaultProviderOperationBtcKey = vi.fn();
vi.mock("../../../clients/eth-contract/sdk-readers", () => ({
  getProtocolParamsReader: vi.fn().mockResolvedValue({
    getTimelockPeginByVersion: (...args: unknown[]) =>
      mockGetTimelockPeginByVersion(...args),
    getOffchainParamsByVersion: (...args: unknown[]) =>
      mockGetOffchainParamsByVersion(...args),
  }),
  getVaultKeeperReader: vi.fn().mockResolvedValue({
    getVaultKeepersByVersion: (...args: unknown[]) =>
      mockGetVaultKeepersByVersion(...args),
  }),
  getUniversalChallengerReader: vi.fn().mockResolvedValue({
    getUniversalChallengersByVersion: (...args: unknown[]) =>
      mockGetUniversalChallengersByVersion(...args),
  }),
  getOperationKeyReader: vi.fn().mockResolvedValue({
    getPayoutScriptsAtEpochs: vi
      .fn()
      .mockResolvedValue({ vaultProvider: "0xvpScript", vaultKeepers: [] }),
  }),
  getVaultRegistryReader: vi.fn(() => ({
    getCurrentVaultProviderOperationBtcKey: (...args: unknown[]) =>
      mockGetCurrentVaultProviderOperationBtcKey(...args),
  })),
}));

import {
  getVaultFromChain,
  getVaultProviderGenesisBtcPubkeyFromChain,
} from "../../../clients/eth-contract/btc-vault-registry/query";
import {
  prepareSigningContext,
  resolveVaultProviderBtcPubkey,
} from "../vaultPayoutSignatureService";

const ON_CHAIN_VP_PUBKEY = "a".repeat(64);
const COMPRESSED_VP_PUBKEY = `02${ON_CHAIN_VP_PUBKEY}`;
const UNCOMPRESSED_VP_PUBKEY = `04${ON_CHAIN_VP_PUBKEY}${"b".repeat(64)}`;
const DIFFERENT_VP_PUBKEY = "b".repeat(64);

describe("vaultPayoutSignatureService", () => {
  describe("resolveVaultProviderBtcPubkey", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns the on-chain key when the provided hint matches", async () => {
      (getVaultProviderGenesisBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      const result = await resolveVaultProviderBtcPubkey(
        "0xprovider",
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      expect(result).toBe(ON_CHAIN_VP_PUBKEY);
      expect(getVaultProviderGenesisBtcPubkeyFromChain).toHaveBeenCalledWith(
        "0xprovider",
      );
    });

    it("accepts a compressed hint that matches the on-chain x-only key", async () => {
      (getVaultProviderGenesisBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      const result = await resolveVaultProviderBtcPubkey(
        "0xprovider",
        COMPRESSED_VP_PUBKEY,
      );

      expect(result).toBe(ON_CHAIN_VP_PUBKEY);
    });

    it("accepts an uncompressed hint that matches the on-chain x-only key", async () => {
      (getVaultProviderGenesisBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      const result = await resolveVaultProviderBtcPubkey(
        "0xprovider",
        UNCOMPRESSED_VP_PUBKEY,
      );

      expect(result).toBe(ON_CHAIN_VP_PUBKEY);
    });

    it("reads from chain when no hint is provided", async () => {
      (getVaultProviderGenesisBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      const result = await resolveVaultProviderBtcPubkey("0xprovider");

      expect(result).toBe(ON_CHAIN_VP_PUBKEY);
      expect(getVaultProviderGenesisBtcPubkeyFromChain).toHaveBeenCalledWith(
        "0xprovider",
      );
    });

    it("throws when the hint matches neither the registration nor the current operation key", async () => {
      (getVaultProviderGenesisBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );
      mockGetCurrentVaultProviderOperationBtcKey.mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      await expect(
        resolveVaultProviderBtcPubkey("0xprovider", DIFFERENT_VP_PUBKEY),
      ).rejects.toThrow(
        "indexer hint matches neither the registration key nor the current operation key",
      );
    });

    // An indexer that has caught up to a rotation serves the operation key
    // while the registration getter still returns the original. Rejecting that
    // would break payout signing for every depositor of a rotated provider,
    // triggered by an indexer deploy rather than one of ours.
    it("accepts a hint matching the current operation key after a rotation", async () => {
      (getVaultProviderGenesisBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );
      mockGetCurrentVaultProviderOperationBtcKey.mockResolvedValue(
        `0x${DIFFERENT_VP_PUBKEY}`,
      );

      const result = await resolveVaultProviderBtcPubkey(
        "0xprovider",
        DIFFERENT_VP_PUBKEY,
      );

      // Still returns the registration key: it is the genesis fallback for
      // epoch resolution, never the key we sign with.
      expect(result).toBe(ON_CHAIN_VP_PUBKEY);
    });

    // The extra read is a fallback, not a second unconditional RPC.
    it("does not read the current operation key when the hint matches registration", async () => {
      (getVaultProviderGenesisBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      await resolveVaultProviderBtcPubkey("0xprovider", ON_CHAIN_VP_PUBKEY);

      expect(mockGetCurrentVaultProviderOperationBtcKey).not.toHaveBeenCalled();
    });
  });

  describe("prepareSigningContext", () => {
    const ON_CHAIN_VAULT = {
      depositorSignedPeginTx: "0xpegin",
      offchainParamsVersion: 1,
      vaultCoreVersion: 2,
      appVaultKeepersVersion: 2,
      universalChallengersVersion: 3,
      applicationEntryPoint: "0xapp",
      vaultProvider: "0xprovider" as `0x${string}`,
      vaultProviderCommissionBps: 50,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      (getVaultFromChain as Mock).mockResolvedValue(ON_CHAIN_VAULT);
      mockGetTimelockPeginByVersion.mockResolvedValue(100);
      mockGetOffchainParamsByVersion.mockResolvedValue({
        timelockAssert: 144n,
        securityCouncilKeys: ["0xcouncil2", "0xcouncil1"],
        councilQuorum: 1,
        minVpCommissionBps: 10,
        // Distinctive on purpose: a hardcoded rate anywhere in the threading
        // path would fail the assertion below.
        feeRate: 7n,
      });
      mockGetVaultKeepersByVersion.mockResolvedValue([
        { btcPubKey: "vk1" },
        { btcPubKey: "vk2" },
      ]);
      mockGetUniversalChallengersByVersion.mockResolvedValue([
        { btcPubKey: "uc1" },
      ]);
      (getVaultProviderGenesisBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );
      mockResolveParticipantKeysAtEpochs.mockResolvedValue({
        vaultProvider: { operationBtcPubkey: ON_CHAIN_VP_PUBKEY },
        vaultKeepers: [
          { operationBtcPubkey: "vk1" },
          { operationBtcPubkey: "vk2" },
        ],
        vaultKeeperOperationKeysSorted: ["vk1", "vk2"],
        universalChallengerOperationKeysSorted: ["uc1"],
      });
    });

    it("builds a SigningContext from on-chain data and returns provider address", async () => {
      const { context, vaultProviderAddress } = await prepareSigningContext({
        vaultId: "vault_id",
        depositorBtcPubkey: "depositor_pubkey",
        registeredPayoutScriptPubKey: "0xscript",
      });

      expect(vaultProviderAddress).toBe(ON_CHAIN_VAULT.vaultProvider);
      expect(context.peginTxHex).toBe(ON_CHAIN_VAULT.depositorSignedPeginTx);
      // The stamped on-chain version must flow through verbatim — a
      // re-pinned constant here would sign resumed vaults with the wrong graph.
      expect(context.vaultCoreVersion).toBe(2);
      expect(context.timelockPegin).toBe(100);
      expect(context.timelockAssert).toBe(144);
      expect(context.councilMembers).toEqual(["council1", "council2"]);
      expect(context.councilQuorum).toBe(1);
      expect(context.vaultKeeperBtcPubkeys).toEqual(["vk1", "vk2"]);
      expect(context.universalChallengerBtcPubkeys).toEqual(["uc1"]);
      expect(context.vaultProviderBtcPubkey).toBe(ON_CHAIN_VP_PUBKEY);
      expect(context.network).toBe("testnet");
      expect(context.registeredPayoutScriptPubKey).toBe("0xscript");
      expect(context.commissionBps).toBe(50);
      // Version-locked graph-build rate threaded from offchainParams.feeRate.
      expect(context.protocolFeeRate).toBe(7n);
    });

    it("throws when VP commission is below the protocol floor", async () => {
      // minVpCommissionBps = 10; a vault with commission 5 is below the floor.
      (getVaultFromChain as Mock).mockResolvedValue({
        ...ON_CHAIN_VAULT,
        vaultProviderCommissionBps: 5,
      });

      await expect(
        prepareSigningContext({
          vaultId: "vault_id",
          depositorBtcPubkey: "depositor_pubkey",
          registeredPayoutScriptPubKey: "0xscript",
        }),
      ).rejects.toThrow(
        /VP commission 5 bps out of protocol range \[10, 10000\)/,
      );
    });

    it("throws when VP commission is at or above the 10000 ceiling", async () => {
      (getVaultFromChain as Mock).mockResolvedValue({
        ...ON_CHAIN_VAULT,
        vaultProviderCommissionBps: 10000,
      });

      await expect(
        prepareSigningContext({
          vaultId: "vault_id",
          depositorBtcPubkey: "depositor_pubkey",
          registeredPayoutScriptPubKey: "0xscript",
        }),
      ).rejects.toThrow(
        /VP commission 10000 bps out of protocol range \[10, 10000\)/,
      );
    });

    it("uses 1 as the floor when minVpCommissionBps is 0", async () => {
      // The contract permits minVpCommissionBps 0, but the Rust tx-graph
      // builder refuses commission 0 — so the effective floor is max(0, 1).
      mockGetOffchainParamsByVersion.mockResolvedValue({
        timelockAssert: 144n,
        securityCouncilKeys: ["0xcouncil2", "0xcouncil1"],
        councilQuorum: 1,
        minVpCommissionBps: 0,
        feeRate: 2n,
      });
      (getVaultFromChain as Mock).mockResolvedValue({
        ...ON_CHAIN_VAULT,
        vaultProviderCommissionBps: 0,
      });

      await expect(
        prepareSigningContext({
          vaultId: "vault_id",
          depositorBtcPubkey: "depositor_pubkey",
          registeredPayoutScriptPubKey: "0xscript",
        }),
      ).rejects.toThrow(
        /VP commission 0 bps out of protocol range \[1, 10000\)/,
      );
    });

    it("accepts a caller-provided VP pubkey hint when it matches on-chain", async () => {
      (getVaultProviderGenesisBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      const { context } = await prepareSigningContext({
        vaultId: "vault_id",
        depositorBtcPubkey: "depositor_pubkey",
        vaultProviderBtcPubKey: COMPRESSED_VP_PUBKEY,
        registeredPayoutScriptPubKey: "0xscript",
      });

      expect(context.vaultProviderBtcPubkey).toBe(ON_CHAIN_VP_PUBKEY);
      expect(getVaultProviderGenesisBtcPubkeyFromChain).toHaveBeenCalledWith(
        ON_CHAIN_VAULT.vaultProvider,
      );
    });

    it("throws when a poisoned GraphQL VP pubkey hint differs from on-chain", async () => {
      (getVaultProviderGenesisBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );
      // Un-rotated provider: the operation key is the registration key, so the
      // poisoned hint matches neither candidate.
      mockGetCurrentVaultProviderOperationBtcKey.mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      await expect(
        prepareSigningContext({
          vaultId: "vault_id",
          depositorBtcPubkey: "depositor_pubkey",
          vaultProviderBtcPubKey: DIFFERENT_VP_PUBKEY,
          registeredPayoutScriptPubKey: "0xscript",
        }),
      ).rejects.toThrow(
        "indexer hint matches neither the registration key nor the current operation key",
      );
    });

    it("throws when vault keepers version returns empty list", async () => {
      mockGetVaultKeepersByVersion.mockResolvedValue([]);

      await expect(
        prepareSigningContext({
          vaultId: "vault_id",
          depositorBtcPubkey: "depositor_pubkey",
          registeredPayoutScriptPubKey: "0xscript",
        }),
      ).rejects.toThrow(
        `No vault keepers found for version ${ON_CHAIN_VAULT.appVaultKeepersVersion}`,
      );
    });

    it("throws when universal challengers version returns empty list", async () => {
      mockGetUniversalChallengersByVersion.mockResolvedValue([]);

      await expect(
        prepareSigningContext({
          vaultId: "vault_id",
          depositorBtcPubkey: "depositor_pubkey",
          registeredPayoutScriptPubKey: "0xscript",
        }),
      ).rejects.toThrow(
        `No universal challengers found for version ${ON_CHAIN_VAULT.universalChallengersVersion}`,
      );
    });
  });
});
