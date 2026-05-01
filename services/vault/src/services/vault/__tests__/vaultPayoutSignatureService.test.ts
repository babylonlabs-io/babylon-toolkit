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
  getVaultProviderBtcPubkeyFromChain: vi.fn(),
}));

vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn().mockReturnValue("signet"),
}));

const mockGetTimelockPeginByVersion = vi.fn();
const mockGetOffchainParamsByVersion = vi.fn();
const mockGetVaultKeepersByVersion = vi.fn();
const mockGetUniversalChallengersByVersion = vi.fn();
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
}));

import {
  getVaultFromChain,
  getVaultProviderBtcPubkeyFromChain,
} from "../../../clients/eth-contract/btc-vault-registry/query";
import {
  getSortedUniversalChallengerPubkeys,
  getSortedVaultKeeperPubkeys,
  prepareSigningContext,
  resolveVaultProviderBtcPubkey,
} from "../vaultPayoutSignatureService";

const ON_CHAIN_VP_PUBKEY = "a".repeat(64);
const COMPRESSED_VP_PUBKEY = `02${ON_CHAIN_VP_PUBKEY}`;
const UNCOMPRESSED_VP_PUBKEY = `04${ON_CHAIN_VP_PUBKEY}${"b".repeat(64)}`;
const DIFFERENT_VP_PUBKEY = "b".repeat(64);

describe("vaultPayoutSignatureService", () => {
  describe("getSortedVaultKeeperPubkeys", () => {
    it("strips 0x and sorts lexicographically", () => {
      const result = getSortedVaultKeeperPubkeys([
        { btcPubKey: "0xccc" },
        { btcPubKey: "aaa" },
        { btcPubKey: "0xbbb" },
      ]);
      expect(result).toEqual(["aaa", "bbb", "ccc"]);
    });
  });

  describe("getSortedUniversalChallengerPubkeys", () => {
    it("strips 0x and sorts lexicographically", () => {
      const result = getSortedUniversalChallengerPubkeys([
        { btcPubKey: "0xzzz" },
        { btcPubKey: "aaa" },
      ]);
      expect(result).toEqual(["aaa", "zzz"]);
    });
  });

  describe("resolveVaultProviderBtcPubkey", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns the on-chain key when the provided hint matches", async () => {
      (getVaultProviderBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      const result = await resolveVaultProviderBtcPubkey(
        "0xprovider",
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      expect(result).toBe(ON_CHAIN_VP_PUBKEY);
      expect(getVaultProviderBtcPubkeyFromChain).toHaveBeenCalledWith(
        "0xprovider",
      );
    });

    it("accepts a compressed hint that matches the on-chain x-only key", async () => {
      (getVaultProviderBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      const result = await resolveVaultProviderBtcPubkey(
        "0xprovider",
        COMPRESSED_VP_PUBKEY,
      );

      expect(result).toBe(ON_CHAIN_VP_PUBKEY);
    });

    it("accepts an uncompressed hint that matches the on-chain x-only key", async () => {
      (getVaultProviderBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      const result = await resolveVaultProviderBtcPubkey(
        "0xprovider",
        UNCOMPRESSED_VP_PUBKEY,
      );

      expect(result).toBe(ON_CHAIN_VP_PUBKEY);
    });

    it("reads from chain when no hint is provided", async () => {
      (getVaultProviderBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      const result = await resolveVaultProviderBtcPubkey("0xprovider");

      expect(result).toBe(ON_CHAIN_VP_PUBKEY);
      expect(getVaultProviderBtcPubkeyFromChain).toHaveBeenCalledWith(
        "0xprovider",
      );
    });

    it("throws when the provided hint does not match the on-chain key", async () => {
      (getVaultProviderBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      await expect(
        resolveVaultProviderBtcPubkey("0xprovider", DIFFERENT_VP_PUBKEY),
      ).rejects.toThrow(
        "Vault provider BTC pubkey mismatch for 0xprovider: indexer hint does not match on-chain registry",
      );
    });
  });

  describe("prepareSigningContext", () => {
    const ON_CHAIN_VAULT = {
      depositorSignedPeginTx: "0xpegin",
      offchainParamsVersion: 1,
      appVaultKeepersVersion: 2,
      universalChallengersVersion: 3,
      applicationEntryPoint: "0xapp",
      vaultProvider: "0xprovider" as `0x${string}`,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      (getVaultFromChain as Mock).mockResolvedValue(ON_CHAIN_VAULT);
      mockGetTimelockPeginByVersion.mockResolvedValue(100);
      mockGetOffchainParamsByVersion.mockResolvedValue({
        timelockAssert: 144n,
        securityCouncilKeys: ["0xcouncil2", "0xcouncil1"],
        councilQuorum: 1,
      });
      mockGetVaultKeepersByVersion.mockResolvedValue([
        { btcPubKey: "vk1" },
        { btcPubKey: "vk2" },
      ]);
      mockGetUniversalChallengersByVersion.mockResolvedValue([
        { btcPubKey: "uc1" },
      ]);
      (getVaultProviderBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );
    });

    it("builds a SigningContext from on-chain data and returns provider address", async () => {
      const { context, vaultProviderAddress } = await prepareSigningContext({
        vaultId: "vault_id",
        depositorBtcPubkey: "depositor_pubkey",
        registeredPayoutScriptPubKey: "0xscript",
      });

      expect(vaultProviderAddress).toBe(ON_CHAIN_VAULT.vaultProvider);
      expect(context.peginTxHex).toBe(ON_CHAIN_VAULT.depositorSignedPeginTx);
      expect(context.timelockPegin).toBe(100);
      expect(context.timelockAssert).toBe(144);
      expect(context.councilMembers).toEqual(["council1", "council2"]);
      expect(context.councilQuorum).toBe(1);
      expect(context.vaultKeeperBtcPubkeys).toEqual(["vk1", "vk2"]);
      expect(context.universalChallengerBtcPubkeys).toEqual(["uc1"]);
      expect(context.vaultProviderBtcPubkey).toBe(ON_CHAIN_VP_PUBKEY);
      expect(context.network).toBe("signet");
      expect(context.registeredPayoutScriptPubKey).toBe("0xscript");
    });

    it("accepts a caller-provided VP pubkey hint when it matches on-chain", async () => {
      (getVaultProviderBtcPubkeyFromChain as Mock).mockResolvedValue(
        `0x${ON_CHAIN_VP_PUBKEY}`,
      );

      const { context } = await prepareSigningContext({
        vaultId: "vault_id",
        depositorBtcPubkey: "depositor_pubkey",
        vaultProviderBtcPubKey: COMPRESSED_VP_PUBKEY,
        registeredPayoutScriptPubKey: "0xscript",
      });

      expect(context.vaultProviderBtcPubkey).toBe(ON_CHAIN_VP_PUBKEY);
      expect(getVaultProviderBtcPubkeyFromChain).toHaveBeenCalledWith(
        ON_CHAIN_VAULT.vaultProvider,
      );
    });

    it("throws when a poisoned GraphQL VP pubkey hint differs from on-chain", async () => {
      (getVaultProviderBtcPubkeyFromChain as Mock).mockResolvedValue(
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
        "Vault provider BTC pubkey mismatch for 0xprovider: indexer hint does not match on-chain registry",
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
