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

import {
  extractLiquidatorPubkeysFromGraph,
  getSortedLiquidatorPubkeys,
  prepareTransactionsForSigning,
  validatePayoutSignatureParams,
} from "../vaultPayoutSignatureService";

describe("vaultPayoutSignatureService", () => {
  describe("validatePayoutSignatureParams", () => {
    const validParams = {
      peginTxId:
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      depositorBtcPubkey:
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      claimerTransactions: [
        {
          claimer_pubkey: "abc",
          payout_tx: { tx_hex: "hex" },
          claim_tx: { tx_hex: "hex" },
        },
      ],
      vaultProvider: {
        address: "0x123" as `0x${string}`,
        url: "http://localhost:8080",
      },
      liquidators: [{ btcPubKey: "0xabc" }],
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

    it("should throw for empty liquidators", () => {
      expect(() =>
        validatePayoutSignatureParams({
          ...validParams,
          liquidators: [],
        }),
      ).toThrow("Invalid liquidators");
    });
  });

  describe("extractLiquidatorPubkeysFromGraph", () => {
    const fallbackPubkeys = ["fallback1", "fallback2"];

    it("should return fallback when graphJson is null", () => {
      const result = extractLiquidatorPubkeysFromGraph(null, fallbackPubkeys);
      expect(result).toEqual(fallbackPubkeys);
    });

    it("should return fallback when graphJson is invalid JSON", () => {
      const result = extractLiquidatorPubkeysFromGraph(
        "invalid json",
        fallbackPubkeys,
      );
      expect(result).toEqual(fallbackPubkeys);
    });

    it("should return fallback when liquidator_pubkeys is missing", () => {
      const result = extractLiquidatorPubkeysFromGraph(
        JSON.stringify({ other: "data" }),
        fallbackPubkeys,
      );
      expect(result).toEqual(fallbackPubkeys);
    });

    it("should return fallback when liquidator_pubkeys is not an array", () => {
      const result = extractLiquidatorPubkeysFromGraph(
        JSON.stringify({ liquidator_pubkeys: "not array" }),
        fallbackPubkeys,
      );
      expect(result).toEqual(fallbackPubkeys);
    });

    it("should extract and strip 0x prefix from liquidator pubkeys", () => {
      const graphJson = JSON.stringify({
        liquidator_pubkeys: ["0xabc123", "0xdef456"],
      });
      const result = extractLiquidatorPubkeysFromGraph(
        graphJson,
        fallbackPubkeys,
      );
      expect(result).toEqual(["abc123", "def456"]);
    });

    it("should handle pubkeys without 0x prefix", () => {
      const graphJson = JSON.stringify({
        liquidator_pubkeys: ["abc123", "def456"],
      });
      const result = extractLiquidatorPubkeysFromGraph(
        graphJson,
        fallbackPubkeys,
      );
      expect(result).toEqual(["abc123", "def456"]);
    });
  });

  describe("getSortedLiquidatorPubkeys", () => {
    it("should return empty array for empty liquidators", () => {
      const result = getSortedLiquidatorPubkeys([]);
      expect(result).toEqual([]);
    });

    it("should strip 0x prefix and sort pubkeys", () => {
      const liquidators = [
        { btcPubKey: "0xdef" },
        { btcPubKey: "0xabc" },
        { btcPubKey: "0xghi" },
      ];
      const result = getSortedLiquidatorPubkeys(liquidators);
      expect(result).toEqual(["abc", "def", "ghi"]);
    });

    it("should handle pubkeys without 0x prefix", () => {
      const liquidators = [{ btcPubKey: "zzz" }, { btcPubKey: "aaa" }];
      const result = getSortedLiquidatorPubkeys(liquidators);
      expect(result).toEqual(["aaa", "zzz"]);
    });
  });

  describe("prepareTransactionsForSigning", () => {
    it("should return empty array for empty transactions", () => {
      const result = prepareTransactionsForSigning([]);
      expect(result).toEqual([]);
    });

    it("should extract claimerPubkeyXOnly, payoutTxHex, and claimTxHex", () => {
      const transactions = [
        {
          claimer_pubkey:
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          payout_tx: { tx_hex: "payout_hex_1" },
          claim_tx: { tx_hex: "claim_hex_1" },
        },
        {
          claimer_pubkey:
            "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          payout_tx: { tx_hex: "payout_hex_2" },
          claim_tx: { tx_hex: "claim_hex_2" },
        },
      ];

      const result = prepareTransactionsForSigning(transactions);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        claimerPubkeyXOnly:
          "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        payoutTxHex: "payout_hex_1",
        claimTxHex: "claim_hex_1",
      });
      expect(result[1]).toEqual({
        claimerPubkeyXOnly:
          "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        payoutTxHex: "payout_hex_2",
        claimTxHex: "claim_hex_2",
      });
    });

    it("should convert 66-char pubkey to 64-char x-only format", () => {
      const transactions = [
        {
          // 66 chars (33 bytes with prefix)
          claimer_pubkey:
            "021234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          payout_tx: { tx_hex: "payout" },
          claim_tx: { tx_hex: "claim" },
        },
      ];

      const result = prepareTransactionsForSigning(transactions);

      // Should strip first 2 chars (prefix byte)
      expect(result[0].claimerPubkeyXOnly).toBe(
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      );
    });
  });
});
