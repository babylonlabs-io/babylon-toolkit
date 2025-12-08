/**
 * Tests for PeginManager
 *
 * Tests the manager's ability to orchestrate peg-in operations
 * using primitives, utilities, and mock wallets.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Chain } from "viem";

import {
  MockBitcoinWallet,
  MockEthereumWallet,
} from "../../../../shared/wallets/mocks";
import type { Address } from "../../../../shared/wallets/interfaces/EthereumWallet";
import { MEMPOOL_API_URLS } from "../../clients/mempool";
import { initializeWasmForTests } from "../../primitives/psbt/__tests__/helpers";
import type { UTXO } from "../../utils";
import { PeginManager, type PeginManagerConfig } from "../PeginManager";

// Mock calculateBtcTxHash to avoid parsing fake transaction hex in tests
vi.mock("../../utils/transaction/btcTxHash", () => ({
  calculateBtcTxHash: vi.fn(() => `0x${"a".repeat(64)}`),
}));

// Test chain configuration (minimal viem Chain)
const TEST_CHAIN: Chain = {
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.sepolia.org"] },
  },
};

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

// Use lowercase to avoid EIP-55 checksum validation issues
const TEST_CONTRACT_ADDRESS =
  "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as Address;

// Valid testnet P2TR address (Bech32m) for change output
const TEST_CHANGE_ADDRESS =
  "tb1plqg44wluw66vpkfccz23rdmtlepnx2m3yef57yyz66flgxdf4h8q7wu6pf";

describe("PeginManager", () => {
  // Initialize WASM before running tests
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  describe("Constructor", () => {
    it("should create a manager with valid config", () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const config: PeginManagerConfig = {
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any, // Mock wallet for testing
        ethChain: TEST_CHAIN,
        vaultContracts: {
          btcVaultsManager: TEST_CONTRACT_ADDRESS,
        },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
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
          btcNetwork: network,
          btcWallet,
          ethWallet: ethWallet as any,
          ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
          mempoolApiUrl: MEMPOOL_API_URLS.signet,
        });

        expect(manager.getNetwork()).toBe(network);
      }
    });
  });

  describe("preparePegin", () => {
    it("should prepare a peg-in transaction with valid params", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
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
      expect(result).toHaveProperty("btcTxHash");
      expect(result).toHaveProperty("fundedTxHex");
      expect(result).toHaveProperty("vaultScriptPubKey");
      expect(result).toHaveProperty("selectedUTXOs");
      expect(result).toHaveProperty("fee");
      expect(result).toHaveProperty("changeAmount");
      expect(result).toHaveProperty("ethTxHash");

      // Verify types
      expect(typeof result.btcTxHash).toBe("string");
      expect(typeof result.fundedTxHex).toBe("string");
      expect(typeof result.vaultScriptPubKey).toBe("string");
      expect(Array.isArray(result.selectedUTXOs)).toBe(true);
      expect(typeof result.fee).toBe("bigint");
      expect(typeof result.changeAmount).toBe("bigint");
      expect(result.ethTxHash).toBeNull(); // Not implemented yet

      // Verify values
      expect(result.btcTxHash.length).toBe(64);
      expect(result.fundedTxHex.length).toBeGreaterThan(0);
      expect(result.vaultScriptPubKey.length).toBeGreaterThan(0);
      expect(result.selectedUTXOs.length).toBeGreaterThan(0);
      expect(result.fee).toBeGreaterThan(0n);
    });

    it("should select appropriate UTXOs for the amount", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
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
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
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
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
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
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
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
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
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
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
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
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
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
        publicKeyHex: customPubkey,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      // Spy on wallet method
      const getPublicKeySpy = vi.spyOn(btcWallet, "getPublicKeyHex");

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
        publicKeyHex: TEST_KEYS.DEPOSITOR,
        shouldFailSigning: true, // This doesn't affect getPublicKey
      });
      const ethWallet = new MockEthereumWallet();

      // Override getPublicKeyHex to throw
      btcWallet.getPublicKeyHex = async () => {
        throw new Error("Wallet connection failed");
      };

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
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

  describe("registerPeginOnChain", () => {
    it("should call ethWallet.sendTransaction with encoded contract data", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      // Spy on sendTransaction
      const sendTxSpy = vi.spyOn(ethWallet, "sendTransaction");
      const signMessageSpy = vi.spyOn(btcWallet, "signMessage");

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      // Use a valid-looking tx hex (minimal transaction format)
      const mockUnsignedTx = "0100000000010000000000";

      const result = await manager.registerPeginOnChain({
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        unsignedBtcTx: mockUnsignedTx,
        vaultProvider: TEST_CONTRACT_ADDRESS,
      });

      // Verify BTC wallet signed the ETH address (PoP)
      expect(signMessageSpy).toHaveBeenCalled();
      const signedMessage = signMessageSpy.mock.calls[0][0];
      expect(signedMessage.toLowerCase()).toContain("0x"); // ETH address

      // Verify ETH wallet sent transaction
      expect(sendTxSpy).toHaveBeenCalled();
      const txRequest = sendTxSpy.mock.calls[0][0];
      expect(txRequest.to).toBe(TEST_CONTRACT_ADDRESS);
      expect(txRequest.data).toBeDefined();
      expect(txRequest.data).toContain("0x"); // Encoded call data

      // Verify result contains ethTxHash and vaultId
      expect(result).toBeDefined();
      expect(result.ethTxHash).toBeDefined();
      expect(result.ethTxHash.startsWith("0x")).toBe(true);
      expect(result.vaultId).toBeDefined();
      expect(result.vaultId.startsWith("0x")).toBe(true);
    });

    it("should handle BTC wallet signing failure", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
        shouldFailSigning: true,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.registerPeginOnChain({
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
          unsignedBtcTx: "0100000000010000000000",
          vaultProvider: TEST_CONTRACT_ADDRESS,
        }),
      ).rejects.toThrow(/Mock signing failed/);
    });

    it("should handle ETH wallet transaction failure", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet({
        shouldFailOperations: true,
      });

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.registerPeginOnChain({
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
          unsignedBtcTx: "0100000000010000000000",
          vaultProvider: TEST_CONTRACT_ADDRESS,
        }),
      ).rejects.toThrow(/Mock transaction failed/);
    });

    it("should handle hex-prefixed and non-prefixed inputs", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const sendTxSpy = vi.spyOn(ethWallet, "sendTransaction");

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      // Test with 0x prefix
      await manager.registerPeginOnChain({
        depositorBtcPubkey: `0x${TEST_KEYS.DEPOSITOR}`,
        unsignedBtcTx: "0x0100000000010000000000",
        vaultProvider: TEST_CONTRACT_ADDRESS,
      });

      expect(sendTxSpy).toHaveBeenCalled();

      // Test without 0x prefix
      sendTxSpy.mockClear();
      await manager.registerPeginOnChain({
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        unsignedBtcTx: "0100000000010000000000",
        vaultProvider: TEST_CONTRACT_ADDRESS,
      });

      expect(sendTxSpy).toHaveBeenCalled();
    });
  });

  describe("signAndBroadcast", () => {
    it("should reject invalid transaction hex", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      // Invalid transaction hex
      await expect(
        manager.signAndBroadcast({
          fundedTxHex: "invalid-hex",
          depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        }),
      ).rejects.toThrow();
    });

  });

  describe("Deterministic output", () => {
    it("should produce consistent results for same inputs", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
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
      expect(result1.btcTxHash).toBe(result2.btcTxHash);
      expect(result1.fee).toBe(result2.fee);
    });

    it("should produce different results for different depositors", async () => {
      const btcWallet1 = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const btcWallet2 = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.LIQUIDATOR_1, // Different key
      });
      const ethWallet = new MockEthereumWallet();

      const manager1 = new PeginManager({
        btcNetwork: "signet",
        btcWallet: btcWallet1,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const manager2 = new PeginManager({
        btcNetwork: "signet",
        btcWallet: btcWallet2,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultsManager: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
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



