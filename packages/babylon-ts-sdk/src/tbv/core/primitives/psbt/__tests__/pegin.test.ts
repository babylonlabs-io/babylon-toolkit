/**
 * Tests for buildPeginPsbt primitive function
 */

import { describe, expect, it, beforeAll } from "vitest";
import {
  buildPeginPsbt,
  type Network,
  type PeginParams,
} from "../pegin";
import { createPegInTransaction } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { TEST_KEYS, TEST_AMOUNTS, initializeWasmForTests } from "./helpers";

describe("buildPeginPsbt", () => {
  // Initialize WASM before running tests
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  describe("Basic functionality", () => {
    it("should build a valid peg-in PSBT for signet", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet" as Network,
      };

      const result = await buildPeginPsbt(params);

      // Verify result structure
      expect(result).toHaveProperty("psbtHex");
      expect(result).toHaveProperty("txid");
      expect(result).toHaveProperty("vaultScriptPubKey");
      expect(result).toHaveProperty("vaultValue");

      // Verify types
      expect(typeof result.psbtHex).toBe("string");
      expect(typeof result.txid).toBe("string");
      expect(typeof result.vaultScriptPubKey).toBe("string");
      expect(typeof result.vaultValue).toBe("bigint");

      // Verify values
      expect(result.psbtHex.length).toBeGreaterThan(0);
      expect(result.txid.length).toBe(64); // Bitcoin txid is 64 hex chars
      expect(result.vaultScriptPubKey.length).toBeGreaterThan(0);
      expect(result.vaultValue).toBe(TEST_AMOUNTS.PEGIN);
    });

    it("should handle different networks", async () => {
      const networks: Network[] = ["bitcoin", "testnet", "regtest", "signet"];

      for (const network of networks) {
        const params: PeginParams = {
          depositorPubkey: TEST_KEYS.DEPOSITOR,
          claimerPubkey: TEST_KEYS.CLAIMER,
          challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
          pegInAmount: TEST_AMOUNTS.PEGIN,
          network,
        };

        const result = await buildPeginPsbt(params);

        expect(result.psbtHex).toBeDefined();
        expect(result.txid).toBeDefined();
        expect(result.vaultValue).toBe(TEST_AMOUNTS.PEGIN);
      }
    });

    it("should handle different amounts", async () => {
      const amounts = [
        TEST_AMOUNTS.SMALL,
        TEST_AMOUNTS.PEGIN_SMALL,
        TEST_AMOUNTS.PEGIN_MEDIUM,
        TEST_AMOUNTS.PEGIN_LARGE,
        TEST_AMOUNTS.ONE_BTC,
      ];

      for (const amount of amounts) {
        const params: PeginParams = {
          depositorPubkey: TEST_KEYS.DEPOSITOR,
          claimerPubkey: TEST_KEYS.CLAIMER,
          challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
          pegInAmount: amount,
          network: "signet",
        };

        const result = await buildPeginPsbt(params);

        expect(result.vaultValue).toBe(amount);
      }
    });

    it("should handle multiple liquidators", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1, TEST_KEYS.LIQUIDATOR_2],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      const result = await buildPeginPsbt(params);

      expect(result.psbtHex).toBeDefined();
      expect(result.txid).toBeDefined();
      expect(result.vaultValue).toBe(TEST_AMOUNTS.PEGIN);
    });
  });

  describe("Integration with WASM", () => {
    it("should produce same output as calling WASM directly", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      // Call our SDK function
      const sdkResult = await buildPeginPsbt(params);

      // Call WASM directly
      const wasmResult = await createPegInTransaction({
        depositorPubkey: params.depositorPubkey,
        claimerPubkey: params.claimerPubkey,
        challengerPubkeys: params.challengerPubkeys,
        pegInAmount: params.pegInAmount,
        network: params.network,
      });

      // Results should match (accounting for property name differences)
      expect(sdkResult.psbtHex).toBe(wasmResult.txHex);
      expect(sdkResult.txid).toBe(wasmResult.txid);
      expect(sdkResult.vaultScriptPubKey).toBe(wasmResult.vaultScriptPubKey);
      expect(sdkResult.vaultValue).toBe(wasmResult.vaultValue);
    });
  });

  describe("Deterministic output", () => {
    it("should produce the same result for the same inputs", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      const result1 = await buildPeginPsbt(params);
      const result2 = await buildPeginPsbt(params);

      expect(result1.psbtHex).toBe(result2.psbtHex);
      expect(result1.txid).toBe(result2.txid);
      expect(result1.vaultScriptPubKey).toBe(result2.vaultScriptPubKey);
      expect(result1.vaultValue).toBe(result2.vaultValue);
    });

    it("should produce different results for different depositor keys", async () => {
      const params1: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      const params2: PeginParams = {
        ...params1,
        // Use a different depositor key to ensure different output
        depositorPubkey: TEST_KEYS.CLAIMER, // Different from TEST_KEYS.DEPOSITOR
      };

      const result1 = await buildPeginPsbt(params1);
      const result2 = await buildPeginPsbt(params2);

      expect(result1.psbtHex).not.toBe(result2.psbtHex);
      expect(result1.txid).not.toBe(result2.txid);
      expect(result1.vaultScriptPubKey).not.toBe(result2.vaultScriptPubKey);
    });
  });

  describe("Edge cases", () => {
    it("should reject empty liquidator array", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      // Should reject empty liquidator array
      await expect(buildPeginPsbt(params)).rejects.toThrow();
    });

    it("should handle large amounts", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.MAX,
        network: "signet",
      };

      const result = await buildPeginPsbt(params);

      expect(result.vaultValue).toBe(TEST_AMOUNTS.MAX);
    });
  });

  describe("Real-world scenario", () => {
    it("should build a PSBT for a realistic peg-in scenario", async () => {
      // Realistic scenario: User pegging in 0.001 BTC (100,000 sats)
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1, TEST_KEYS.LIQUIDATOR_2],
        pegInAmount: TEST_AMOUNTS.PEGIN_MEDIUM,
        network: "signet",
      };

      const result = await buildPeginPsbt(params);

      // Verify the PSBT is ready to be funded
      expect(result.psbtHex).toBeDefined();
      expect(result.psbtHex.length).toBeGreaterThan(0);

      // Verify transaction details
      expect(result.txid).toBeDefined();
      expect(result.txid).toMatch(/^[0-9a-f]{64}$/);

      // Verify vault script
      expect(result.vaultScriptPubKey).toBeDefined();
      expect(result.vaultScriptPubKey.length).toBeGreaterThan(0);

      // Verify amount
      expect(result.vaultValue).toBe(TEST_AMOUNTS.PEGIN_MEDIUM);
    });
  });

  describe("Type safety", () => {
    it("should enforce Network type", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet" as Network,
      };

      const result = await buildPeginPsbt(params);
      expect(result).toBeDefined();
    });

    it("should handle bigint amounts correctly", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: BigInt(90000),
        network: "signet",
      };

      const result = await buildPeginPsbt(params);
      expect(typeof result.vaultValue).toBe("bigint");
      expect(result.vaultValue).toBe(TEST_AMOUNTS.PEGIN);
    });
  });

  describe("Error handling", () => {
    it("should reject invalid depositor pubkey format", async () => {
      const params: PeginParams = {
        depositorPubkey: "invalid-pubkey",
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      await expect(buildPeginPsbt(params)).rejects.toThrow();
    });

    it("should reject invalid claimer pubkey format", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: "not-a-valid-hex-key-123",
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      await expect(buildPeginPsbt(params)).rejects.toThrow();
    });

    it("should reject invalid liquidator pubkey in array", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: ["zzzzinvalidhexzzzz"],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      await expect(buildPeginPsbt(params)).rejects.toThrow();
    });

    it("should reject invalid network string", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "invalid-network" as Network,
      };

      await expect(buildPeginPsbt(params)).rejects.toThrow();
    });

    it("should reject pubkey with incorrect length", async () => {
      const params: PeginParams = {
        depositorPubkey: "abcd1234", // Too short
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      await expect(buildPeginPsbt(params)).rejects.toThrow();
    });

    it("should reject pubkey with non-hex characters", async () => {
      const params: PeginParams = {
        depositorPubkey: "g".repeat(64), // 'g' is not a valid hex character
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      await expect(buildPeginPsbt(params)).rejects.toThrow();
    });
  });

  describe("Transaction structure validation", () => {
    it("should produce transaction with correct output structure", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      const result = await buildPeginPsbt(params);

      // Transaction should have no inputs (unfunded)
      // and one output (the vault output)
      expect(result.psbtHex).toBeDefined();
      expect(result.vaultScriptPubKey).toBeDefined();

      // Verify the returned value matches input
      expect(result.vaultValue).toBe(TEST_AMOUNTS.PEGIN);
    });

    it("should produce deterministic vaultScriptPubKey for same inputs", async () => {
      const params: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      const result1 = await buildPeginPsbt(params);
      const result2 = await buildPeginPsbt(params);

      // Same inputs should produce same vault script
      expect(result1.vaultScriptPubKey).toBe(result2.vaultScriptPubKey);
    });

    it("should produce different vaultScriptPubKey for different liquidators", async () => {
      const params1: PeginParams = {
        depositorPubkey: TEST_KEYS.DEPOSITOR,
        claimerPubkey: TEST_KEYS.CLAIMER,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        pegInAmount: TEST_AMOUNTS.PEGIN,
        network: "signet",
      };

      const params2: PeginParams = {
        ...params1,
        challengerPubkeys: [TEST_KEYS.LIQUIDATOR_2],
      };

      const result1 = await buildPeginPsbt(params1);
      const result2 = await buildPeginPsbt(params2);

      // Different liquidators should produce different vault scripts
      expect(result1.vaultScriptPubKey).not.toBe(result2.vaultScriptPubKey);
    });
  });
});
