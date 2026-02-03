import { describe, expect, it, vi } from "vitest";

// Mock SDK imports that may use WASM
vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  PayoutManager: vi.fn(),
}));

// Mock GraphQL fetch functions
vi.mock("../fetchVaultProviders", () => ({
  fetchVaultProviderById: vi.fn(),
}));

vi.mock("../fetchVaults", () => ({
  fetchVaultById: vi.fn(),
}));

// Mock RPC client
vi.mock("../../../clients/vault-provider-rpc", () => ({
  VaultProviderRpcApi: vi.fn(),
}));

// Mock config
vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn().mockReturnValue("testnet"),
}));

import type { ClaimerTransactions } from "../../../clients/vault-provider-rpc/types";
import {
  getSortedUniversalChallengerPubkeys,
  getSortedVaultKeeperPubkeys,
  prepareTransactionsForSigning,
  signAllTransactionsBatch,
  validatePayoutSignatureParams,
  walletSupportsBatchSigning,
} from "../vaultPayoutSignatureService";

/**
 * Helper to create a valid ClaimerTransactions fixture with all 4 transactions
 */
function createClaimerTransactions(
  claimerPubkey: string,
  overrides?: Partial<ClaimerTransactions>,
): ClaimerTransactions {
  return {
    claimer_pubkey: claimerPubkey,
    claim_tx: { tx_hex: "claim_hex", sighash: null },
    payout_optimistic_tx: {
      tx_hex: "payout_optimistic_hex",
      sighash: "sighash1",
    },
    assert_tx: { tx_hex: "assert_hex", sighash: null },
    payout_tx: { tx_hex: "payout_hex", sighash: "sighash2" },
    ...overrides,
  };
}

describe("vaultPayoutSignatureService", () => {
  describe("validatePayoutSignatureParams", () => {
    const validParams = {
      peginTxId:
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      depositorBtcPubkey:
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      claimerTransactions: [createClaimerTransactions("abc")],
      vaultProvider: {
        address: "0x123" as `0x${string}`,
        url: "http://localhost:8080",
      },
      vaultKeepers: [{ btcPubKey: "0xabc" }],
      universalChallengers: [{ btcPubKey: "0xdef" }],
    };

    it("should pass with valid params", () => {
      expect(() => validatePayoutSignatureParams(validParams)).not.toThrow();
    });

    it("should throw for empty peginTxId", () => {
      expect(() =>
        validatePayoutSignatureParams({ ...validParams, peginTxId: "" }),
      ).toThrow("Invalid peginTxId");
    });

    it("should throw for invalid depositorBtcPubkey format", () => {
      expect(() =>
        validatePayoutSignatureParams({
          ...validParams,
          depositorBtcPubkey: "invalid",
        }),
      ).toThrow("Invalid depositorBtcPubkey format");
    });

    it("should throw for depositorBtcPubkey with wrong length", () => {
      expect(() =>
        validatePayoutSignatureParams({
          ...validParams,
          depositorBtcPubkey: "1234", // too short
        }),
      ).toThrow("Invalid depositorBtcPubkey format");
    });

    it("should throw for empty claimerTransactions", () => {
      expect(() =>
        validatePayoutSignatureParams({
          ...validParams,
          claimerTransactions: [],
        }),
      ).toThrow("Invalid claimerTransactions");
    });

    it("should throw for missing vaultProvider address", () => {
      expect(() =>
        validatePayoutSignatureParams({
          ...validParams,
          vaultProvider: { url: "http://localhost" } as any,
        }),
      ).toThrow("Invalid vaultProvider");
    });

    it("should throw for missing vaultProvider url", () => {
      expect(() =>
        validatePayoutSignatureParams({
          ...validParams,
          vaultProvider: { address: "0x123" as `0x${string}` } as any,
        }),
      ).toThrow("Invalid vaultProvider");
    });

    it("should throw for empty vaultKeepers", () => {
      expect(() =>
        validatePayoutSignatureParams({
          ...validParams,
          vaultKeepers: [],
        }),
      ).toThrow("Invalid vaultKeepers");
    });

    it("should throw for empty universalChallengers", () => {
      expect(() =>
        validatePayoutSignatureParams({
          ...validParams,
          universalChallengers: [],
        }),
      ).toThrow("Invalid universalChallengers");
    });
  });

  describe("getSortedVaultKeeperPubkeys", () => {
    it("should return empty array for empty vault keepers", () => {
      const result = getSortedVaultKeeperPubkeys([]);
      expect(result).toEqual([]);
    });

    it("should strip 0x prefix and sort pubkeys", () => {
      const vaultKeepers = [
        { btcPubKey: "0xdef" },
        { btcPubKey: "0xabc" },
        { btcPubKey: "0xghi" },
      ];
      const result = getSortedVaultKeeperPubkeys(vaultKeepers);
      expect(result).toEqual(["abc", "def", "ghi"]);
    });

    it("should handle pubkeys without 0x prefix", () => {
      const vaultKeepers = [{ btcPubKey: "zzz" }, { btcPubKey: "aaa" }];
      const result = getSortedVaultKeeperPubkeys(vaultKeepers);
      expect(result).toEqual(["aaa", "zzz"]);
    });
  });

  describe("getSortedUniversalChallengerPubkeys", () => {
    it("should return empty array for empty universal challengers", () => {
      const result = getSortedUniversalChallengerPubkeys([]);
      expect(result).toEqual([]);
    });

    it("should strip 0x prefix and sort pubkeys", () => {
      const universalChallengers = [
        { btcPubKey: "0xdef" },
        { btcPubKey: "0xabc" },
        { btcPubKey: "0xghi" },
      ];
      const result = getSortedUniversalChallengerPubkeys(universalChallengers);
      expect(result).toEqual(["abc", "def", "ghi"]);
    });

    it("should handle pubkeys without 0x prefix", () => {
      const universalChallengers = [{ btcPubKey: "zzz" }, { btcPubKey: "aaa" }];
      const result = getSortedUniversalChallengerPubkeys(universalChallengers);
      expect(result).toEqual(["aaa", "zzz"]);
    });
  });

  describe("prepareTransactionsForSigning", () => {
    it("should return empty array for empty transactions", () => {
      const result = prepareTransactionsForSigning([]);
      expect(result).toEqual([]);
    });

    it("should extract all transaction fields", () => {
      const transactions = [
        createClaimerTransactions(
          "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          {
            claim_tx: { tx_hex: "claim_hex_1", sighash: null },
            payout_optimistic_tx: {
              tx_hex: "payout_optimistic_hex_1",
              sighash: "sig1",
            },
            assert_tx: { tx_hex: "assert_hex_1", sighash: null },
            payout_tx: { tx_hex: "payout_hex_1", sighash: "sig2" },
          },
        ),
        createClaimerTransactions(
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          {
            claim_tx: { tx_hex: "claim_hex_2", sighash: null },
            payout_optimistic_tx: {
              tx_hex: "payout_optimistic_hex_2",
              sighash: "sig3",
            },
            assert_tx: { tx_hex: "assert_hex_2", sighash: null },
            payout_tx: { tx_hex: "payout_hex_2", sighash: "sig4" },
          },
        ),
      ];

      const result = prepareTransactionsForSigning(transactions);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        claimerPubkeyXOnly:
          "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        payoutOptimisticTxHex: "payout_optimistic_hex_1",
        payoutTxHex: "payout_hex_1",
        claimTxHex: "claim_hex_1",
        assertTxHex: "assert_hex_1",
      });
      expect(result[1]).toEqual({
        claimerPubkeyXOnly:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        payoutOptimisticTxHex: "payout_optimistic_hex_2",
        payoutTxHex: "payout_hex_2",
        claimTxHex: "claim_hex_2",
        assertTxHex: "assert_hex_2",
      });
    });

    it("should convert 66-char pubkey to 64-char x-only format", () => {
      const transactions = [
        createClaimerTransactions(
          // 66 chars (33 bytes with prefix)
          "021234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        ),
      ];

      const result = prepareTransactionsForSigning(transactions);

      // Should strip first 2 chars (prefix byte)
      expect(result[0].claimerPubkeyXOnly).toBe(
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      );
    });
  });

  describe("walletSupportsBatchSigning", () => {
    it("should return true when wallet has signPsbts method", () => {
      const wallet = {
        getPublicKeyHex: vi.fn(),
        getAddress: vi.fn(),
        signPsbt: vi.fn(),
        signPsbts: vi.fn(), // Has batch signing method
        signMessage: vi.fn(),
        getNetwork: vi.fn(),
      };

      expect(walletSupportsBatchSigning(wallet as any)).toBe(true);
    });

    it("should return false when wallet does not have signPsbts method", () => {
      const wallet = {
        getPublicKeyHex: vi.fn(),
        getAddress: vi.fn(),
        signPsbt: vi.fn(),
        // No signPsbts method
        signMessage: vi.fn(),
        getNetwork: vi.fn(),
      };

      expect(walletSupportsBatchSigning(wallet as any)).toBe(false);
    });

    it("should return false when signPsbts is not a function", () => {
      const wallet = {
        getPublicKeyHex: vi.fn(),
        getAddress: vi.fn(),
        signPsbt: vi.fn(),
        signPsbts: "not a function", // Not a function
        signMessage: vi.fn(),
        getNetwork: vi.fn(),
      };

      expect(walletSupportsBatchSigning(wallet as any)).toBe(false);
    });
  });

  describe("signAllTransactionsBatch", () => {
    it("should batch sign transactions for multiple claimers", async () => {
      const claimer1Pubkey =
        "1111111111111111111111111111111111111111111111111111111111111111";
      const claimer2Pubkey =
        "2222222222222222222222222222222222222222222222222222222222222222";

      const transactions = [
        {
          claimerPubkeyXOnly: claimer1Pubkey,
          payoutOptimisticTxHex: "payout_optimistic_1",
          payoutTxHex: "payout_1",
          claimTxHex: "claim_1",
          assertTxHex: "assert_1",
        },
        {
          claimerPubkeyXOnly: claimer2Pubkey,
          payoutOptimisticTxHex: "payout_optimistic_2",
          payoutTxHex: "payout_2",
          claimTxHex: "claim_2",
          assertTxHex: "assert_2",
        },
      ];

      const context = {
        peginTxHex: "pegin_hex",
        vaultProviderBtcPubkey: "provider_pubkey",
        vaultKeeperBtcPubkeys: ["keeper1"],
        universalChallengerBtcPubkeys: ["challenger1"],
        depositorBtcPubkey: "depositor_pubkey",
        network: "testnet" as const,
      };

      // Mock PayoutManager
      const { PayoutManager } = await import("@babylonlabs-io/ts-sdk/tbv/core");

      const mockSignPayoutTransactionsBatch = vi.fn().mockResolvedValue([
        {
          payoutOptimisticSignature: "sig_optimistic_1",
          payoutSignature: "sig_payout_1",
          depositorBtcPubkey: "depositor_pubkey",
        },
        {
          payoutOptimisticSignature: "sig_optimistic_2",
          payoutSignature: "sig_payout_2",
          depositorBtcPubkey: "depositor_pubkey",
        },
      ]);

      const mockSupportsBatchSigning = vi.fn().mockReturnValue(true);

      (PayoutManager as any).mockImplementation(() => ({
        supportsBatchSigning: mockSupportsBatchSigning,
        signPayoutTransactionsBatch: mockSignPayoutTransactionsBatch,
      }));

      const wallet = {
        getPublicKeyHex: vi.fn(),
        getAddress: vi.fn(),
        signPsbt: vi.fn(),
        signPsbts: vi.fn(),
        signMessage: vi.fn(),
        getNetwork: vi.fn(),
      };

      const result = await signAllTransactionsBatch(
        wallet as any,
        context,
        transactions,
      );

      // Verify correct mapping to claimer pubkeys
      expect(result).toEqual({
        [claimer1Pubkey]: {
          payout_optimistic_signature: "sig_optimistic_1",
          payout_signature: "sig_payout_1",
        },
        [claimer2Pubkey]: {
          payout_optimistic_signature: "sig_optimistic_2",
          payout_signature: "sig_payout_2",
        },
      });

      // Verify PayoutManager was called correctly
      expect(mockSupportsBatchSigning).toHaveBeenCalledTimes(1);
      expect(mockSignPayoutTransactionsBatch).toHaveBeenCalledTimes(1);
      expect(mockSignPayoutTransactionsBatch).toHaveBeenCalledWith([
        {
          payoutOptimistic: {
            payoutOptimisticTxHex: "payout_optimistic_1",
            peginTxHex: "pegin_hex",
            claimTxHex: "claim_1",
            vaultProviderBtcPubkey: "provider_pubkey",
            vaultKeeperBtcPubkeys: ["keeper1"],
            universalChallengerBtcPubkeys: ["challenger1"],
            depositorBtcPubkey: "depositor_pubkey",
          },
          payout: {
            payoutTxHex: "payout_1",
            peginTxHex: "pegin_hex",
            assertTxHex: "assert_1",
            vaultProviderBtcPubkey: "provider_pubkey",
            vaultKeeperBtcPubkeys: ["keeper1"],
            universalChallengerBtcPubkeys: ["challenger1"],
            depositorBtcPubkey: "depositor_pubkey",
          },
        },
        {
          payoutOptimistic: {
            payoutOptimisticTxHex: "payout_optimistic_2",
            peginTxHex: "pegin_hex",
            claimTxHex: "claim_2",
            vaultProviderBtcPubkey: "provider_pubkey",
            vaultKeeperBtcPubkeys: ["keeper1"],
            universalChallengerBtcPubkeys: ["challenger1"],
            depositorBtcPubkey: "depositor_pubkey",
          },
          payout: {
            payoutTxHex: "payout_2",
            peginTxHex: "pegin_hex",
            assertTxHex: "assert_2",
            vaultProviderBtcPubkey: "provider_pubkey",
            vaultKeeperBtcPubkeys: ["keeper1"],
            universalChallengerBtcPubkeys: ["challenger1"],
            depositorBtcPubkey: "depositor_pubkey",
          },
        },
      ]);
    });

    it("should throw error when wallet does not support batch signing", async () => {
      const transactions = [
        {
          claimerPubkeyXOnly: "claimer1",
          payoutOptimisticTxHex: "payout_optimistic_1",
          payoutTxHex: "payout_1",
          claimTxHex: "claim_1",
          assertTxHex: "assert_1",
        },
      ];

      const context = {
        peginTxHex: "pegin_hex",
        vaultProviderBtcPubkey: "provider_pubkey",
        vaultKeeperBtcPubkeys: ["keeper1"],
        universalChallengerBtcPubkeys: ["challenger1"],
        depositorBtcPubkey: "depositor_pubkey",
        network: "testnet" as const,
      };

      // Mock PayoutManager without batch signing support
      const { PayoutManager } = await import("@babylonlabs-io/ts-sdk/tbv/core");

      const mockSupportsBatchSigning = vi.fn().mockReturnValue(false);

      (PayoutManager as any).mockImplementation(() => ({
        supportsBatchSigning: mockSupportsBatchSigning,
      }));

      const wallet = {
        getPublicKeyHex: vi.fn(),
        getAddress: vi.fn(),
        signPsbt: vi.fn(),
        // No signPsbts method
        signMessage: vi.fn(),
        getNetwork: vi.fn(),
      };

      await expect(
        signAllTransactionsBatch(wallet as any, context, transactions),
      ).rejects.toThrow(
        "Wallet does not support batch signing (signPsbts method not available)",
      );
    });

    it("should throw error with proper message when batch signing fails", async () => {
      const transactions = [
        {
          claimerPubkeyXOnly: "claimer1",
          payoutOptimisticTxHex: "payout_optimistic_1",
          payoutTxHex: "payout_1",
          claimTxHex: "claim_1",
          assertTxHex: "assert_1",
        },
      ];

      const context = {
        peginTxHex: "pegin_hex",
        vaultProviderBtcPubkey: "provider_pubkey",
        vaultKeeperBtcPubkeys: ["keeper1"],
        universalChallengerBtcPubkeys: ["challenger1"],
        depositorBtcPubkey: "depositor_pubkey",
        network: "testnet" as const,
      };

      // Mock PayoutManager that throws during signing
      const { PayoutManager } = await import("@babylonlabs-io/ts-sdk/tbv/core");

      const mockSignPayoutTransactionsBatch = vi
        .fn()
        .mockRejectedValue(new Error("Signing failed due to user rejection"));

      const mockSupportsBatchSigning = vi.fn().mockReturnValue(true);

      (PayoutManager as any).mockImplementation(() => ({
        supportsBatchSigning: mockSupportsBatchSigning,
        signPayoutTransactionsBatch: mockSignPayoutTransactionsBatch,
      }));

      const wallet = {
        getPublicKeyHex: vi.fn(),
        getAddress: vi.fn(),
        signPsbt: vi.fn(),
        signPsbts: vi.fn(),
        signMessage: vi.fn(),
        getNetwork: vi.fn(),
      };

      await expect(
        signAllTransactionsBatch(wallet as any, context, transactions),
      ).rejects.toThrow(
        "Failed to batch sign payout transactions: Signing failed due to user rejection",
      );
    });

    it("should handle unknown errors gracefully", async () => {
      const transactions = [
        {
          claimerPubkeyXOnly: "claimer1",
          payoutOptimisticTxHex: "payout_optimistic_1",
          payoutTxHex: "payout_1",
          claimTxHex: "claim_1",
          assertTxHex: "assert_1",
        },
      ];

      const context = {
        peginTxHex: "pegin_hex",
        vaultProviderBtcPubkey: "provider_pubkey",
        vaultKeeperBtcPubkeys: ["keeper1"],
        universalChallengerBtcPubkeys: ["challenger1"],
        depositorBtcPubkey: "depositor_pubkey",
        network: "testnet" as const,
      };

      // Mock PayoutManager that throws non-Error object
      const { PayoutManager } = await import("@babylonlabs-io/ts-sdk/tbv/core");

      const mockSignPayoutTransactionsBatch = vi
        .fn()
        .mockRejectedValue("Unknown error");

      const mockSupportsBatchSigning = vi.fn().mockReturnValue(true);

      (PayoutManager as any).mockImplementation(() => ({
        supportsBatchSigning: mockSupportsBatchSigning,
        signPayoutTransactionsBatch: mockSignPayoutTransactionsBatch,
      }));

      const wallet = {
        getPublicKeyHex: vi.fn(),
        getAddress: vi.fn(),
        signPsbt: vi.fn(),
        signPsbts: vi.fn(),
        signMessage: vi.fn(),
        getNetwork: vi.fn(),
      };

      await expect(
        signAllTransactionsBatch(wallet as any, context, transactions),
      ).rejects.toThrow(
        "Failed to batch sign payout transactions: Unknown error",
      );
    });
  });
});
