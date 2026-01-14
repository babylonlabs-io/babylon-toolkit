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
  validatePayoutSignatureParams,
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
});
