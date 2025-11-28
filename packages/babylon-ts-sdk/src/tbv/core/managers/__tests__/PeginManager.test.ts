/**
 * Tests for PeginManager
 *
 * Tests the manager's ability to orchestrate peg-in operations
 * using primitives, utilities, and mock wallets.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  MockBitcoinWallet,
  MockEthereumWallet,
} from "../../../../shared/wallets/mocks";
import type { Address } from "../../../../shared/wallets/interfaces/EthereumWallet";
import { initializeWasmForTests } from "../../primitives/psbt/__tests__/helpers";
import type { UTXO } from "../../utils";
import { PeginManager, type PeginManagerConfig } from "../PeginManager";

// Test constants
const TEST_KEYS = {
  DEPOSITOR:
    "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  CLAIMER: "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  LIQUIDATOR_1:
    "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
  LIQUIDATOR_2:
    "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13",
} as const;

const TEST_AMOUNTS = {
  PEGIN: 90_000n,
  PEGIN_SMALL: 50_000n,
  PEGIN_MEDIUM: 100_000n,
} as const;

// Test UTXOs with valid P2TR scriptPubKey (OP_1 <32-byte-pubkey>)
// Format: 51 (OP_1) + 20 (push 32 bytes) + 32-byte pubkey
const TEST_UTXOS: UTXO[] = [
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000001",
    vout: 0,
    value: 100_000,
    scriptPubKey:
      "5120" + "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  },
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000002",
    vout: 0,
    value: 200_000,
    scriptPubKey:
      "5120" + "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  },
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000003",
    vout: 1,
    value: 50_000,
    scriptPubKey:
      "5120" + "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
  },
];

const TEST_CONTRACT_ADDRESS =
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0" as Address;

const TEST_CHANGE_ADDRESS =
  "tb1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx6jks";

describe("PeginManager", () => {
  // Initialize WASM before running tests
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  describe("Constructor", () => {
    it("should create a manager with valid config", () => {
      const btcWallet = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const config: PeginManagerConfig = {
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: {
          btcVaultsManager: TEST_CONTRACT_ADDRESS,
        },
      };

      const manager = new PeginManager(config);

      expect(manager).toBeInstanceOf(PeginManager);
      expect(manager.getNetwork()).toBe("signet");
      expect(manager.getVaultContractAddress()).toBe(TEST_CONTRACT_ADDRESS);
    });

    it("should support different networks", () => {
      const btcWallet = new MockBitcoinWallet();
      const ethWallet = new MockEthereumWallet();

      const networks = ["bitcoin", "testnet", "signet", "regtest"] as const;

      for (const network of networks) {
        const manager = new PeginManager({
          network,
          btcWallet,
          ethWallet,
          vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        });

        expect(manager.getNetwork()).toBe(network);
      }
    });
  });

  describe("preparePegin", () => {
    it("should prepare a peg-in transaction with valid params", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
        address: TEST_CHANGE_ADDRESS,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      const result = await manager.preparePegin({
        amount: TEST_AMOUNTS.PEGIN,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
        liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        availableUTXOs: TEST_UTXOS,
        feeRate: 10,
        changeAddress: TEST_CHANGE_ADDRESS,
      });

      // Verify result structure
      expect(result).toHaveProperty("btcTxid");
      expect(result).toHaveProperty("fundedTxHex");
      expect(result).toHaveProperty("vaultScriptPubKey");
      expect(result).toHaveProperty("selectedUTXOs");
      expect(result).toHaveProperty("fee");
      expect(result).toHaveProperty("changeAmount");
      expect(result).toHaveProperty("ethTxHash");

      // Verify types
      expect(typeof result.btcTxid).toBe("string");
      expect(typeof result.fundedTxHex).toBe("string");
      expect(typeof result.vaultScriptPubKey).toBe("string");
      expect(Array.isArray(result.selectedUTXOs)).toBe(true);
      expect(typeof result.fee).toBe("bigint");
      expect(typeof result.changeAmount).toBe("bigint");
      expect(result.ethTxHash).toBeNull(); // Not implemented yet

      // Verify values
      expect(result.btcTxid.length).toBe(64);
      expect(result.fundedTxHex.length).toBeGreaterThan(0);
      expect(result.vaultScriptPubKey.length).toBeGreaterThan(0);
      expect(result.selectedUTXOs.length).toBeGreaterThan(0);
      expect(result.fee).toBeGreaterThan(0n);
    });

    it("should select appropriate UTXOs for the amount", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      // Request small amount - should select minimal UTXOs
      const result = await manager.preparePegin({
        amount: TEST_AMOUNTS.PEGIN_SMALL,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
        liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        availableUTXOs: TEST_UTXOS,
        feeRate: 5,
        changeAddress: TEST_CHANGE_ADDRESS,
      });

      // Should select at least one UTXO
      expect(result.selectedUTXOs.length).toBeGreaterThanOrEqual(1);

      // Total selected value should be >= amount + fee
      const totalSelected = result.selectedUTXOs.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      );
      expect(totalSelected).toBeGreaterThanOrEqual(
        TEST_AMOUNTS.PEGIN_SMALL + result.fee,
      );
    });

    it("should handle multiple liquidators", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      const result = await manager.preparePegin({
        amount: TEST_AMOUNTS.PEGIN,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
        liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_1, TEST_KEYS.LIQUIDATOR_2],
        availableUTXOs: TEST_UTXOS,
        feeRate: 10,
        changeAddress: TEST_CHANGE_ADDRESS,
      });

      expect(result.fundedTxHex).toBeDefined();
      expect(result.vaultScriptPubKey).toBeDefined();
    });

    it("should calculate change correctly", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      const result = await manager.preparePegin({
        amount: TEST_AMOUNTS.PEGIN,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
        liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        availableUTXOs: TEST_UTXOS,
        feeRate: 10,
        changeAddress: TEST_CHANGE_ADDRESS,
      });

      // Verify accounting: totalSelected = amount + fee + change
      const totalSelected = result.selectedUTXOs.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      );
      expect(totalSelected).toBe(
        TEST_AMOUNTS.PEGIN + result.fee + result.changeAmount,
      );
    });

    it("should throw error for insufficient funds", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      // Request more than available UTXOs
      const totalAvailable = TEST_UTXOS.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      );
      const excessiveAmount = totalAvailable + 100_000n;

      await expect(
        manager.preparePegin({
          amount: excessiveAmount,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
          liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_1],
          availableUTXOs: TEST_UTXOS,
          feeRate: 10,
          changeAddress: TEST_CHANGE_ADDRESS,
        }),
      ).rejects.toThrow(/Insufficient funds/);
    });

    it("should throw error for empty UTXOs", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      await expect(
        manager.preparePegin({
          amount: TEST_AMOUNTS.PEGIN,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
          liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_1],
          availableUTXOs: [], // Empty UTXOs
          feeRate: 10,
          changeAddress: TEST_CHANGE_ADDRESS,
        }),
      ).rejects.toThrow(/no UTXOs available/);
    });

    it("should throw error for invalid public keys", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      // Invalid vault provider pubkey
      await expect(
        manager.preparePegin({
          amount: TEST_AMOUNTS.PEGIN,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          vaultProviderBtcPubkey: "invalid-pubkey",
          liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_1],
          availableUTXOs: TEST_UTXOS,
          feeRate: 10,
          changeAddress: TEST_CHANGE_ADDRESS,
        }),
      ).rejects.toThrow();
    });

    it("should throw error for empty liquidators", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      await expect(
        manager.preparePegin({
          amount: TEST_AMOUNTS.PEGIN,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
          liquidatorBtcPubkeys: [], // Empty liquidators
          availableUTXOs: TEST_UTXOS,
          feeRate: 10,
          changeAddress: TEST_CHANGE_ADDRESS,
        }),
      ).rejects.toThrow();
    });
  });

  describe("Wallet integration", () => {
    it("should use wallet public key for depositor", async () => {
      const customPubkey = TEST_KEYS.LIQUIDATOR_2;
      const btcWallet = new MockBitcoinWallet({
        publicKey: customPubkey,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      // Spy on wallet method
      const getPublicKeySpy = vi.spyOn(btcWallet, "getPublicKey");

      await manager.preparePegin({
        amount: TEST_AMOUNTS.PEGIN,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
        liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        availableUTXOs: TEST_UTXOS,
        feeRate: 10,
        changeAddress: TEST_CHANGE_ADDRESS,
      });

      // Verify wallet was called
      expect(getPublicKeySpy).toHaveBeenCalled();
    });

    it("should handle wallet errors gracefully", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
        shouldFailSigning: true, // This doesn't affect getPublicKey
      });
      const ethWallet = new MockEthereumWallet();

      // Override getPublicKey to throw
      btcWallet.getPublicKey = async () => {
        throw new Error("Wallet connection failed");
      };

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      await expect(
        manager.preparePegin({
          amount: TEST_AMOUNTS.PEGIN,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
          liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_1],
          availableUTXOs: TEST_UTXOS,
          feeRate: 10,
          changeAddress: TEST_CHANGE_ADDRESS,
        }),
      ).rejects.toThrow("Wallet connection failed");
    });
  });

  describe("Placeholder methods", () => {
    it("signAndBroadcast should throw not implemented error", async () => {
      const btcWallet = new MockBitcoinWallet();
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      await expect(manager.signAndBroadcast("abc123")).rejects.toThrow(
        /not yet implemented/,
      );
    });

    it("registerPeginOnChain should throw not implemented error", async () => {
      const btcWallet = new MockBitcoinWallet();
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      await expect(
        manager.registerPeginOnChain({
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
          unsignedBtcTx: "abc123",
          vaultProvider: TEST_CONTRACT_ADDRESS,
        }),
      ).rejects.toThrow(/not yet implemented/);
    });
  });

  describe("Deterministic output", () => {
    it("should produce consistent results for same inputs", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        network: "signet",
        btcWallet,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      const params = {
        amount: TEST_AMOUNTS.PEGIN,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
        liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_1],
        availableUTXOs: TEST_UTXOS,
        feeRate: 10,
        changeAddress: TEST_CHANGE_ADDRESS,
      };

      const result1 = await manager.preparePegin(params);
      const result2 = await manager.preparePegin(params);

      // Same inputs should produce same vault script
      expect(result1.vaultScriptPubKey).toBe(result2.vaultScriptPubKey);
      expect(result1.btcTxid).toBe(result2.btcTxid);
      expect(result1.fee).toBe(result2.fee);
    });

    it("should produce different results for different depositors", async () => {
      const btcWallet1 = new MockBitcoinWallet({
        publicKey: TEST_KEYS.DEPOSITOR,
      });
      const btcWallet2 = new MockBitcoinWallet({
        publicKey: TEST_KEYS.LIQUIDATOR_1, // Different key
      });
      const ethWallet = new MockEthereumWallet();

      const manager1 = new PeginManager({
        network: "signet",
        btcWallet: btcWallet1,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      const manager2 = new PeginManager({
        network: "signet",
        btcWallet: btcWallet2,
        ethWallet,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
      });

      const params = {
        amount: TEST_AMOUNTS.PEGIN,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        vaultProviderBtcPubkey: TEST_KEYS.CLAIMER,
        liquidatorBtcPubkeys: [TEST_KEYS.LIQUIDATOR_2],
        availableUTXOs: TEST_UTXOS,
        feeRate: 10,
        changeAddress: TEST_CHANGE_ADDRESS,
      };

      const result1 = await manager1.preparePegin(params);
      const result2 = await manager2.preparePegin(params);

      // Different depositors should produce different vault scripts
      expect(result1.vaultScriptPubKey).not.toBe(result2.vaultScriptPubKey);
    });
  });
});

