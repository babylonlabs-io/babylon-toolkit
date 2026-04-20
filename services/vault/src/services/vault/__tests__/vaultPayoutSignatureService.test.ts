/**
 * Vault-tier payout signing helper tests.
 *
 * After the SDK migration, the bulk of signing orchestration lives in the
 * SDK (`pollAndSignPayouts`) and has its own test suite. What remains here
 * is app-specific wiring: pubkey sorting, VP pubkey resolution, and the
 * on-chain signing-context builder.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../../../clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: vi.fn(),
}));

vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn().mockReturnValue("signet"),
}));

const mockGetTimelockPeginByVersion = vi.fn();
const mockGetVaultKeepersByVersion = vi.fn();
const mockGetUniversalChallengersByVersion = vi.fn();
vi.mock("../../../clients/eth-contract/sdk-readers", () => ({
  getProtocolParamsReader: vi.fn().mockResolvedValue({
    getTimelockPeginByVersion: (...args: unknown[]) =>
      mockGetTimelockPeginByVersion(...args),
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

vi.mock("../fetchVaultProviders", () => ({
  fetchVaultProviderById: vi.fn(),
}));

import { getVaultFromChain } from "../../../clients/eth-contract/btc-vault-registry/query";
import { fetchVaultProviderById } from "../fetchVaultProviders";
import {
  getSortedUniversalChallengerPubkeys,
  getSortedVaultKeeperPubkeys,
  prepareSigningContext,
  resolveVaultProviderBtcPubkey,
} from "../vaultPayoutSignatureService";

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

    it("returns the provided hint stripped of 0x prefix", async () => {
      const result = await resolveVaultProviderBtcPubkey(
        "0xprovider",
        "0xaabbcc",
      );
      expect(result).toBe("aabbcc");
      expect(fetchVaultProviderById).not.toHaveBeenCalled();
    });

    it("fetches from GraphQL when no hint is provided", async () => {
      (fetchVaultProviderById as Mock).mockResolvedValue({
        btcPubKey: "0xddeeff",
      });

      const result = await resolveVaultProviderBtcPubkey("0xprovider");

      expect(result).toBe("ddeeff");
      expect(fetchVaultProviderById).toHaveBeenCalledWith("0xprovider");
    });

    it("throws when the provider is not found", async () => {
      (fetchVaultProviderById as Mock).mockResolvedValue(null);

      await expect(resolveVaultProviderBtcPubkey("0xprovider")).rejects.toThrow(
        "Vault provider not found",
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
      mockGetVaultKeepersByVersion.mockResolvedValue([
        { btcPubKey: "vk1" },
        { btcPubKey: "vk2" },
      ]);
      mockGetUniversalChallengersByVersion.mockResolvedValue([
        { btcPubKey: "uc1" },
      ]);
      (fetchVaultProviderById as Mock).mockResolvedValue({
        btcPubKey: "0xvp_pubkey",
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
      expect(context.timelockPegin).toBe(100);
      expect(context.vaultKeeperBtcPubkeys).toEqual(["vk1", "vk2"]);
      expect(context.universalChallengerBtcPubkeys).toEqual(["uc1"]);
      expect(context.vaultProviderBtcPubkey).toBe("vp_pubkey");
      expect(context.network).toBe("signet");
      expect(context.registeredPayoutScriptPubKey).toBe("0xscript");
    });

    it("prefers the caller-provided VP pubkey hint over the indexer", async () => {
      const { context } = await prepareSigningContext({
        vaultId: "vault_id",
        depositorBtcPubkey: "depositor_pubkey",
        vaultProviderBtcPubKey: "0xhint_pubkey",
        registeredPayoutScriptPubKey: "0xscript",
      });

      expect(context.vaultProviderBtcPubkey).toBe("hint_pubkey");
      expect(fetchVaultProviderById).not.toHaveBeenCalled();
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
