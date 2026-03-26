import { describe, expect, it, vi } from "vitest";

// Mock SDK imports that may use WASM
vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  PayoutManager: vi.fn(),
}));

// Mock GraphQL fetch functions
vi.mock("../fetchVaultProviders", () => ({
  fetchVaultProviderById: vi.fn(),
}));

// Mock on-chain vault query (used by prepareSigningContext)
vi.mock("../../../clients/eth-contract/btc-vaults-manager/query", () => ({
  getVaultFromChain: vi.fn(),
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
  signPayoutTransactions,
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
    claim_tx: { tx_hex: "claim_hex" },
    assert_tx: { tx_hex: "assert_hex" },
    payout_tx: { tx_hex: "payout_hex" },
    payout_psbt: "bW9ja19wYXlvdXRfcHNidA==",
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
      ).toThrow("Invalid pubkey format");
    });

    it("should throw for depositorBtcPubkey with wrong length", () => {
      expect(() =>
        validatePayoutSignatureParams({
          ...validParams,
          depositorBtcPubkey: "1234", // too short
        }),
      ).toThrow("Invalid pubkey format");
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
          vaultProvider: {} as any,
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
            claim_tx: { tx_hex: "claim_hex_1" },
            assert_tx: { tx_hex: "assert_hex_1" },
            payout_tx: { tx_hex: "payout_hex_1" },
          },
        ),
        createClaimerTransactions(
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          {
            claim_tx: { tx_hex: "claim_hex_2" },
            assert_tx: { tx_hex: "assert_hex_2" },
            payout_tx: { tx_hex: "payout_hex_2" },
          },
        ),
      ];

      const result = prepareTransactionsForSigning(transactions);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        claimerPubkeyXOnly:
          "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        payoutTxHex: "payout_hex_1",
        assertTxHex: "assert_hex_1",
      });
      expect(result[1]).toEqual({
        claimerPubkeyXOnly:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        payoutTxHex: "payout_hex_2",
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
          payoutTxHex: "payout_1",
          assertTxHex: "assert_1",
        },
        {
          claimerPubkeyXOnly: claimer2Pubkey,
          payoutTxHex: "payout_2",
          assertTxHex: "assert_2",
        },
      ];

      const context = {
        peginTxHex: "pegin_hex",
        vaultProviderBtcPubkey: "provider_pubkey",
        vaultKeeperBtcPubkeys: ["keeper1"],
        universalChallengerBtcPubkeys: ["challenger1"],
        depositorBtcPubkey: "depositor_pubkey",
        timelockPegin: 100,
        network: "testnet" as const,
      };

      // Mock PayoutManager
      const { PayoutManager } = await import("@babylonlabs-io/ts-sdk/tbv/core");

      const mockSignPayoutTransactionsBatch = vi.fn().mockResolvedValue([
        {
          payoutSignature: "sig_payout_1",
          depositorBtcPubkey: "depositor_pubkey",
        },
        {
          payoutSignature: "sig_payout_2",
          depositorBtcPubkey: "depositor_pubkey",
        },
      ]);

      const mockSupportsBatchSigning = vi.fn().mockReturnValue(true);

      (PayoutManager as any).mockImplementationOnce(function () {
        return {
          supportsBatchSigning: mockSupportsBatchSigning,
          signPayoutTransactionsBatch: mockSignPayoutTransactionsBatch,
        };
      });

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
          payout_signature: "sig_payout_1",
        },
        [claimer2Pubkey]: {
          payout_signature: "sig_payout_2",
        },
      });

      // Verify PayoutManager was called correctly
      expect(mockSupportsBatchSigning).toHaveBeenCalledTimes(1);
      expect(mockSignPayoutTransactionsBatch).toHaveBeenCalledTimes(1);
      expect(mockSignPayoutTransactionsBatch).toHaveBeenCalledWith([
        {
          payoutTxHex: "payout_1",
          peginTxHex: "pegin_hex",
          assertTxHex: "assert_1",
          vaultProviderBtcPubkey: "provider_pubkey",
          vaultKeeperBtcPubkeys: ["keeper1"],
          universalChallengerBtcPubkeys: ["challenger1"],
          depositorBtcPubkey: "depositor_pubkey",
          timelockPegin: 100,
        },
        {
          payoutTxHex: "payout_2",
          peginTxHex: "pegin_hex",
          assertTxHex: "assert_2",
          vaultProviderBtcPubkey: "provider_pubkey",
          vaultKeeperBtcPubkeys: ["keeper1"],
          universalChallengerBtcPubkeys: ["challenger1"],
          depositorBtcPubkey: "depositor_pubkey",
          timelockPegin: 100,
        },
      ]);
    });

    it("should throw error when wallet does not support batch signing", async () => {
      const transactions = [
        {
          claimerPubkeyXOnly: "claimer1",
          payoutTxHex: "payout_1",
          assertTxHex: "assert_1",
        },
      ];

      const context = {
        peginTxHex: "pegin_hex",
        vaultProviderBtcPubkey: "provider_pubkey",
        vaultKeeperBtcPubkeys: ["keeper1"],
        universalChallengerBtcPubkeys: ["challenger1"],
        depositorBtcPubkey: "depositor_pubkey",
        timelockPegin: 100,
        network: "testnet" as const,
      };

      // Mock PayoutManager without batch signing support
      const { PayoutManager } = await import("@babylonlabs-io/ts-sdk/tbv/core");

      const mockSupportsBatchSigning = vi.fn().mockReturnValue(false);

      (PayoutManager as any).mockImplementationOnce(function () {
        return {
          supportsBatchSigning: mockSupportsBatchSigning,
        };
      });

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
          payoutTxHex: "payout_1",
          assertTxHex: "assert_1",
        },
      ];

      const context = {
        peginTxHex: "pegin_hex",
        vaultProviderBtcPubkey: "provider_pubkey",
        vaultKeeperBtcPubkeys: ["keeper1"],
        universalChallengerBtcPubkeys: ["challenger1"],
        depositorBtcPubkey: "depositor_pubkey",
        timelockPegin: 100,
        network: "testnet" as const,
      };

      // Mock PayoutManager that throws during signing
      const { PayoutManager } = await import("@babylonlabs-io/ts-sdk/tbv/core");

      const mockSignPayoutTransactionsBatch = vi
        .fn()
        .mockRejectedValue(new Error("Signing failed due to user rejection"));

      const mockSupportsBatchSigning = vi.fn().mockReturnValue(true);

      (PayoutManager as any).mockImplementationOnce(function () {
        return {
          supportsBatchSigning: mockSupportsBatchSigning,
          signPayoutTransactionsBatch: mockSignPayoutTransactionsBatch,
        };
      });

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
          payoutTxHex: "payout_1",
          assertTxHex: "assert_1",
        },
      ];

      const context = {
        peginTxHex: "pegin_hex",
        vaultProviderBtcPubkey: "provider_pubkey",
        vaultKeeperBtcPubkeys: ["keeper1"],
        universalChallengerBtcPubkeys: ["challenger1"],
        depositorBtcPubkey: "depositor_pubkey",
        timelockPegin: 100,
        network: "testnet" as const,
      };

      // Mock PayoutManager that throws non-Error object
      const { PayoutManager } = await import("@babylonlabs-io/ts-sdk/tbv/core");

      const mockSignPayoutTransactionsBatch = vi
        .fn()
        .mockRejectedValue("Unknown error");

      const mockSupportsBatchSigning = vi.fn().mockReturnValue(true);

      (PayoutManager as any).mockImplementationOnce(function () {
        return {
          supportsBatchSigning: mockSupportsBatchSigning,
          signPayoutTransactionsBatch: mockSignPayoutTransactionsBatch,
        };
      });

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

  describe("signPayoutTransactions", () => {
    const context = {
      peginTxHex: "pegin_hex",
      vaultProviderBtcPubkey: "provider_pubkey",
      vaultKeeperBtcPubkeys: ["keeper1"],
      universalChallengerBtcPubkeys: ["challenger1"],
      depositorBtcPubkey: "depositor_pubkey",
      timelockPegin: 100,
      network: "testnet" as const,
    };

    const claimer1Pubkey =
      "1111111111111111111111111111111111111111111111111111111111111111";
    const claimer2Pubkey =
      "2222222222222222222222222222222222222222222222222222222222222222";

    const transactions = [
      {
        claimerPubkeyXOnly: claimer1Pubkey,
        payoutTxHex: "payout_1",
        assertTxHex: "assert_1",
      },
      {
        claimerPubkeyXOnly: claimer2Pubkey,
        payoutTxHex: "payout_2",
        assertTxHex: "assert_2",
      },
    ];

    it("should use batch signing when wallet supports it", async () => {
      const { PayoutManager } = await import("@babylonlabs-io/ts-sdk/tbv/core");

      const mockSignPayoutTransactionsBatch = vi.fn().mockResolvedValue([
        { payoutSignature: "sig_1", depositorBtcPubkey: "depositor_pubkey" },
        { payoutSignature: "sig_2", depositorBtcPubkey: "depositor_pubkey" },
      ]);

      (PayoutManager as any).mockImplementationOnce(function () {
        return {
          supportsBatchSigning: vi.fn().mockReturnValue(true),
          signPayoutTransactionsBatch: mockSignPayoutTransactionsBatch,
        };
      });

      const wallet = {
        getPublicKeyHex: vi.fn(),
        getAddress: vi.fn(),
        signPsbt: vi.fn(),
        signPsbts: vi.fn(),
        signMessage: vi.fn(),
        getNetwork: vi.fn(),
      };

      const onProgress = vi.fn();

      const result = await signPayoutTransactions(
        wallet as any,
        context,
        transactions,
        onProgress,
      );

      expect(result).toEqual({
        [claimer1Pubkey]: { payout_signature: "sig_1" },
        [claimer2Pubkey]: { payout_signature: "sig_2" },
      });

      // Batch path: progress at start (0) and end (totalClaimers)
      expect(onProgress).toHaveBeenCalledWith({
        completed: 0,
        totalClaimers: 2,
      });
      expect(onProgress).toHaveBeenCalledWith({
        completed: 2,
        totalClaimers: 2,
      });
    });

    it("should use sequential signing when wallet does not support batch", async () => {
      const { PayoutManager } = await import("@babylonlabs-io/ts-sdk/tbv/core");

      const mockSignPayoutTransaction = vi
        .fn()
        .mockResolvedValueOnce({ signature: "sig_seq_1" })
        .mockResolvedValueOnce({ signature: "sig_seq_2" });

      (PayoutManager as any).mockImplementation(function () {
        return {
          signPayoutTransaction: mockSignPayoutTransaction,
        };
      });

      const wallet = {
        getPublicKeyHex: vi.fn(),
        getAddress: vi.fn(),
        signPsbt: vi.fn(),
        // No signPsbts — forces sequential path
        signMessage: vi.fn(),
        getNetwork: vi.fn(),
      };

      const onProgress = vi.fn();

      const result = await signPayoutTransactions(
        wallet as any,
        context,
        transactions,
        onProgress,
      );

      expect(result).toEqual({
        [claimer1Pubkey]: { payout_signature: "sig_seq_1" },
        [claimer2Pubkey]: { payout_signature: "sig_seq_2" },
      });

      // Sequential path: progress per claimer + final
      expect(onProgress).toHaveBeenCalledWith({
        completed: 0,
        totalClaimers: 2,
      });
      expect(onProgress).toHaveBeenCalledWith({
        completed: 1,
        totalClaimers: 2,
      });
      expect(onProgress).toHaveBeenCalledWith({
        completed: 2,
        totalClaimers: 2,
      });
    });

    it("should work without onProgress callback", async () => {
      const { PayoutManager } = await import("@babylonlabs-io/ts-sdk/tbv/core");

      const mockSignPayoutTransaction = vi
        .fn()
        .mockResolvedValue({ signature: "sig_no_cb" });

      (PayoutManager as any).mockImplementation(function () {
        return {
          signPayoutTransaction: mockSignPayoutTransaction,
        };
      });

      const wallet = {
        getPublicKeyHex: vi.fn(),
        getAddress: vi.fn(),
        signPsbt: vi.fn(),
        signMessage: vi.fn(),
        getNetwork: vi.fn(),
      };

      // No onProgress — should not throw
      const result = await signPayoutTransactions(wallet as any, context, [
        transactions[0],
      ]);

      expect(result).toEqual({
        [claimer1Pubkey]: { payout_signature: "sig_no_cb" },
      });
    });
  });
});
