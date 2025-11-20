/**
 * Tests for createPayoutScript primitive function
 */

import { describe, expect, it, beforeAll } from "vitest";
import { createPayoutScript, type PayoutScriptParams } from "../payout";
import {
  createPayoutConnector,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { TEST_KEYS, initializeWasmForTests } from "../../psbt/__tests__/helpers";

describe("createPayoutScript", () => {
  // Initialize WASM before running tests
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  describe("Basic functionality", () => {
    it("should create a valid payout script for signet", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet" as Network,
      };

      const result = await createPayoutScript(params);

      // Verify result structure
      expect(result).toHaveProperty("payoutScript");
      expect(result).toHaveProperty("taprootScriptHash");
      expect(result).toHaveProperty("scriptPubKey");
      expect(result).toHaveProperty("address");

      // Verify types
      expect(typeof result.payoutScript).toBe("string");
      expect(typeof result.taprootScriptHash).toBe("string");
      expect(typeof result.scriptPubKey).toBe("string");
      expect(typeof result.address).toBe("string");

      // Verify values
      expect(result.payoutScript.length).toBeGreaterThan(0);
      expect(result.taprootScriptHash.length).toBeGreaterThan(0);
      expect(result.scriptPubKey.length).toBeGreaterThan(0);
      expect(result.address.length).toBeGreaterThan(0);

      // Verify address format for signet (should start with tb1p for P2TR)
      expect(result.address).toMatch(/^tb1p/);
    });

    it("should handle different networks", async () => {
      const networks: Network[] = ["bitcoin", "testnet", "regtest", "signet"];

      for (const network of networks) {
        const params: PayoutScriptParams = {
          depositor: TEST_KEYS.DEPOSITOR,
          vaultProvider: TEST_KEYS.CLAIMER,
          liquidators: [TEST_KEYS.LIQUIDATOR_1],
          network,
        };

        const result = await createPayoutScript(params);

        expect(result.payoutScript).toBeDefined();
        expect(result.taprootScriptHash).toBeDefined();
        expect(result.scriptPubKey).toBeDefined();
        expect(result.address).toBeDefined();

        // Verify address format based on network
        if (network === "bitcoin") {
          expect(result.address).toMatch(/^bc1p/);
        } else if (network === "testnet" || network === "signet") {
          expect(result.address).toMatch(/^tb1p/);
        } else if (network === "regtest") {
          expect(result.address).toMatch(/^bcrt1p/);
        }
      }
    });

    it("should handle multiple liquidators", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1, TEST_KEYS.LIQUIDATOR_2],
        network: "signet",
      };

      const result = await createPayoutScript(params);

      expect(result.payoutScript).toBeDefined();
      expect(result.taprootScriptHash).toBeDefined();
      expect(result.scriptPubKey).toBeDefined();
      expect(result.address).toBeDefined();
    });
  });

  describe("Integration with WASM", () => {
    it("should produce same output as calling WASM directly", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      // Call our SDK function
      const sdkResult = await createPayoutScript(params);

      // Call WASM directly
      const wasmResult = await createPayoutConnector(
        {
          depositor: params.depositor,
          vaultProvider: params.vaultProvider,
          liquidators: params.liquidators,
        },
        params.network,
      );

      // Results should match
      expect(sdkResult.payoutScript).toBe(wasmResult.payoutScript);
      expect(sdkResult.taprootScriptHash).toBe(wasmResult.taprootScriptHash);
      expect(sdkResult.scriptPubKey).toBe(wasmResult.scriptPubKey);
      expect(sdkResult.address).toBe(wasmResult.address);
    });
  });

  describe("Deterministic output", () => {
    it("should produce the same result for the same inputs", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      const result1 = await createPayoutScript(params);
      const result2 = await createPayoutScript(params);

      expect(result1.payoutScript).toBe(result2.payoutScript);
      expect(result1.taprootScriptHash).toBe(result2.taprootScriptHash);
      expect(result1.scriptPubKey).toBe(result2.scriptPubKey);
      expect(result1.address).toBe(result2.address);
    });

    it("should produce different results for different depositors", async () => {
      const params1: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      const params2: PayoutScriptParams = {
        ...params1,
        depositor: TEST_KEYS.CLAIMER, // Different depositor
      };

      const result1 = await createPayoutScript(params1);
      const result2 = await createPayoutScript(params2);

      expect(result1.payoutScript).not.toBe(result2.payoutScript);
      expect(result1.taprootScriptHash).not.toBe(result2.taprootScriptHash);
      expect(result1.scriptPubKey).not.toBe(result2.scriptPubKey);
      expect(result1.address).not.toBe(result2.address);
    });

    it("should produce different results for different vault providers", async () => {
      const params1: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      const params2: PayoutScriptParams = {
        ...params1,
        vaultProvider: TEST_KEYS.LIQUIDATOR_1, // Different vault provider
      };

      const result1 = await createPayoutScript(params1);
      const result2 = await createPayoutScript(params2);

      expect(result1.payoutScript).not.toBe(result2.payoutScript);
      expect(result1.taprootScriptHash).not.toBe(result2.taprootScriptHash);
      expect(result1.scriptPubKey).not.toBe(result2.scriptPubKey);
      expect(result1.address).not.toBe(result2.address);
    });

    it("should produce different results for different liquidators", async () => {
      const params1: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      const params2: PayoutScriptParams = {
        ...params1,
        liquidators: [TEST_KEYS.LIQUIDATOR_2],
      };

      const result1 = await createPayoutScript(params1);
      const result2 = await createPayoutScript(params2);

      expect(result1.payoutScript).not.toBe(result2.payoutScript);
      expect(result1.taprootScriptHash).not.toBe(result2.taprootScriptHash);
      expect(result1.scriptPubKey).not.toBe(result2.scriptPubKey);
      expect(result1.address).not.toBe(result2.address);
    });
  });

  describe("Edge cases", () => {
    it("should reject empty liquidator array", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [],
        network: "signet",
      };

      // Should reject empty liquidator array
      await expect(createPayoutScript(params)).rejects.toThrow();
    });
  });

  describe("Real-world scenario", () => {
    it("should create a payout script for a realistic vault scenario", async () => {
      // Realistic scenario: Vault with 2 liquidators
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1, TEST_KEYS.LIQUIDATOR_2],
        network: "signet",
      };

      const result = await createPayoutScript(params);

      // Verify the payout script is ready for PSBT construction
      expect(result.payoutScript).toBeDefined();
      expect(result.payoutScript.length).toBeGreaterThan(0);

      // Verify taproot script hash (needed for signing)
      expect(result.taprootScriptHash).toBeDefined();
      expect(result.taprootScriptHash).toMatch(/^[0-9a-f]+$/);

      // Verify script pubkey
      expect(result.scriptPubKey).toBeDefined();
      expect(result.scriptPubKey.length).toBeGreaterThan(0);

      // Verify P2TR address
      expect(result.address).toBeDefined();
      expect(result.address).toMatch(/^tb1p/);
    });
  });

  describe("Type safety", () => {
    it("should enforce Network type", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet" as Network,
      };

      const result = await createPayoutScript(params);
      expect(result).toBeDefined();
    });
  });

  describe("Error handling", () => {
    it("should reject invalid depositor pubkey format", async () => {
      const params: PayoutScriptParams = {
        depositor: "invalid-pubkey",
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      await expect(createPayoutScript(params)).rejects.toThrow();
    });

    it("should reject invalid vault provider pubkey format", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: "not-a-valid-hex-key-123",
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      await expect(createPayoutScript(params)).rejects.toThrow();
    });

    it("should reject invalid liquidator pubkey in array", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: ["zzzzinvalidhexzzzz"],
        network: "signet",
      };

      await expect(createPayoutScript(params)).rejects.toThrow();
    });

    it("should reject invalid network string", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "invalid-network" as Network,
      };

      await expect(createPayoutScript(params)).rejects.toThrow();
    });

    it("should reject pubkey with incorrect length", async () => {
      const params: PayoutScriptParams = {
        depositor: "abcd1234", // Too short
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      await expect(createPayoutScript(params)).rejects.toThrow();
    });

    it("should reject pubkey with non-hex characters", async () => {
      const params: PayoutScriptParams = {
        depositor: "g".repeat(64), // 'g' is not a valid hex character
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      await expect(createPayoutScript(params)).rejects.toThrow();
    });
  });

  describe("Script structure validation", () => {
    it("should produce valid hex-encoded payout script", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      const result = await createPayoutScript(params);

      // Payout script should be valid hex
      expect(result.payoutScript).toMatch(/^[0-9a-f]+$/);
    });

    it("should produce valid taproot script hash", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      const result = await createPayoutScript(params);

      // Taproot script hash should be valid hex
      expect(result.taprootScriptHash).toMatch(/^[0-9a-f]+$/);

      // Taproot script hash should be 64 characters (32 bytes)
      expect(result.taprootScriptHash.length).toBe(64);
    });

    it("should produce valid script pubkey", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      const result = await createPayoutScript(params);

      // Script pubkey should be valid hex
      expect(result.scriptPubKey).toMatch(/^[0-9a-f]+$/);
    });

    it("should produce deterministic taproot script hash for same inputs", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "signet",
      };

      const result1 = await createPayoutScript(params);
      const result2 = await createPayoutScript(params);

      // Same inputs should produce same taproot script hash
      expect(result1.taprootScriptHash).toBe(result2.taprootScriptHash);
    });
  });

  describe("Network-specific behavior", () => {
    it("should produce bitcoin mainnet addresses with bc1p prefix", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "bitcoin",
      };

      const result = await createPayoutScript(params);

      expect(result.address).toMatch(/^bc1p/);
    });

    it("should produce testnet addresses with tb1p prefix", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "testnet",
      };

      const result = await createPayoutScript(params);

      expect(result.address).toMatch(/^tb1p/);
    });

    it("should produce regtest addresses with bcrt1p prefix", async () => {
      const params: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "regtest",
      };

      const result = await createPayoutScript(params);

      expect(result.address).toMatch(/^bcrt1p/);
    });

    it("should produce same script for different networks", async () => {
      const params1: PayoutScriptParams = {
        depositor: TEST_KEYS.DEPOSITOR,
        vaultProvider: TEST_KEYS.CLAIMER,
        liquidators: [TEST_KEYS.LIQUIDATOR_1],
        network: "bitcoin",
      };

      const params2: PayoutScriptParams = {
        ...params1,
        network: "testnet",
      };

      const result1 = await createPayoutScript(params1);
      const result2 = await createPayoutScript(params2);

      // Scripts should be the same across networks
      expect(result1.payoutScript).toBe(result2.payoutScript);
      expect(result1.taprootScriptHash).toBe(result2.taprootScriptHash);
      expect(result1.scriptPubKey).toBe(result2.scriptPubKey);

      // Only address should differ
      expect(result1.address).not.toBe(result2.address);
    });
  });
});
