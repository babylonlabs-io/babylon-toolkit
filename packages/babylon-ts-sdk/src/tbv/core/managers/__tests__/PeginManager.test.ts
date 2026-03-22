/**
 * Tests for PeginManager
 *
 * Tests the manager's ability to orchestrate atomic swap peg-in operations
 * using primitives, utilities, and mock wallets.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Address, Chain } from "viem";

import {
  MockBitcoinWallet,
  MockEthereumWallet,
} from "../../../../shared/wallets/mocks";
import { MEMPOOL_API_URLS } from "../../clients/mempool";
import { initializeWasmForTests } from "../../primitives/psbt/__tests__/helpers";
import type { UTXO } from "../../utils";
import { PeginManager, type PeginManagerConfig } from "../PeginManager";

// Mock calculateBtcTxHash to avoid parsing funded pre-pegin tx in tests
vi.mock("../../utils/transaction/btcTxHash", () => ({
  calculateBtcTxHash: vi.fn(() => `0x${"a".repeat(64)}`),
}));

// Mock buildPeginInputPsbt and extractPeginInputSignature — the mock wallet cannot
// produce a valid signed PSBT, so we mock these two primitives that require real signing
vi.mock("../../primitives/psbt/peginInput", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../primitives/psbt/peginInput")>();
  return {
    ...actual,
    buildPeginInputPsbt: vi
      .fn()
      .mockResolvedValue({ psbtHex: "deadbeef" }),
    extractPeginInputSignature: vi.fn().mockReturnValue("a".repeat(128)),
  };
});

// Mock viem's createPublicClient to avoid HTTP requests during gas estimation
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      estimateGas: vi.fn().mockResolvedValue(100000n),
      readContract: vi
        .fn()
        .mockImplementation(({ functionName }: { functionName: string }) => {
          if (functionName === "getPegInFee") return Promise.resolve(0n);
          // getBTCVault — return vault with zero depositor (vault doesn't exist)
          return Promise.resolve({ depositor: actual.zeroAddress });
        }),
    })),
  };
});

// Test chain configuration (minimal viem Chain)
const TEST_CHAIN: Chain = {
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.sepolia.org"] },
  },
};

// Test constants - use valid secp256k1 x-only public keys
const TEST_KEYS = {
  DEPOSITOR:
    "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  VAULT_PROVIDER:
    "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  VAULT_KEEPER_1:
    "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
  VAULT_KEEPER_2:
    "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13",
  UNIVERSAL_CHALLENGER_1:
    "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
} as const;

// Deterministic SHA256 hash commitment (64 hex chars = 32 bytes)
const TEST_HASH_H = "ab".repeat(32);

// Mock depositor Lamport public key hash (bytes32)
const MOCK_LAMPORT_PK_HASH = `0x${"ab".repeat(32)}` as `0x${string}`;

const TEST_AMOUNTS = {
  PEGIN: 90_000n,
  PEGIN_SMALL: 50_000n,
  PEGIN_MEDIUM: 100_000n,
} as const;

// Test UTXOs with valid P2TR scriptPubKey (OP_1 <32-byte-pubkey>)
// Format: 51 (OP_1) + 20 (push 32 bytes) + 32-byte pubkey
// Values are large to cover the WASM-computed htlcValue, which includes
// pegInAmount + depositorClaimValue (protocol graph fees) + internal fees.
const TEST_UTXOS: UTXO[] = [
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000001",
    vout: 0,
    value: 800_000,
    scriptPubKey:
      "5120" + "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  },
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000002",
    vout: 0,
    value: 800_000,
    scriptPubKey:
      "5120" + "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
  },
  {
    txid: "0000000000000000000000000000000000000000000000000000000000000003",
    vout: 1,
    value: 800_000,
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

// Base params for prepareAtomicPegin — shared across tests
const BASE_ATOMIC_PEGIN_PARAMS = {
  vaultProvider: TEST_CONTRACT_ADDRESS,
  vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
  vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
  universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
  timelockPegin: 100,
  timelockRefund: 50,
  hashH: TEST_HASH_H,
  feeRate: 10,
  numLocalChallengers: 1,
  councilQuorum: 2,
  councilSize: 3,
  availableUTXOs: TEST_UTXOS,
  changeAddress: TEST_CHANGE_ADDRESS,
} as const;

describe("PeginManager", () => {
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
        ethWallet: ethWallet as any,
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

  describe("prepareAtomicPegin", () => {
    it("should prepare an atomic pegin with valid params", async () => {
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

      const result = await manager.prepareAtomicPegin({
        amount: TEST_AMOUNTS.PEGIN,
        ...BASE_ATOMIC_PEGIN_PARAMS,
      });

      // Verify result structure
      expect(result).toHaveProperty("fundedPrePeginTxHex");
      expect(result).toHaveProperty("htlcValue");
      expect(result).toHaveProperty("signedPeginInputPsbtHex");
      expect(result).toHaveProperty("peginInputSignature");
      expect(result).toHaveProperty("vaultScriptPubKey");
      expect(result).toHaveProperty("peginTxHex");
      expect(result).toHaveProperty("prePeginTxid");
      expect(result).toHaveProperty("peginTxid");
      expect(result).toHaveProperty("selectedUTXOs");
      expect(result).toHaveProperty("fee");
      expect(result).toHaveProperty("changeAmount");

      // Verify types
      expect(typeof result.fundedPrePeginTxHex).toBe("string");
      expect(typeof result.htlcValue).toBe("bigint");
      expect(typeof result.vaultScriptPubKey).toBe("string");
      expect(Array.isArray(result.selectedUTXOs)).toBe(true);
      expect(typeof result.fee).toBe("bigint");
      expect(typeof result.changeAmount).toBe("bigint");
      expect(result.peginInputSignature).toBe("a".repeat(128)); // from mock

      // Verify values
      expect(result.fundedPrePeginTxHex.length).toBeGreaterThan(0);
      expect(result.htlcValue).toBeGreaterThan(0n);
      expect(result.vaultScriptPubKey.length).toBeGreaterThan(0);
      expect(result.selectedUTXOs.length).toBeGreaterThan(0);
      expect(result.fee).toBeGreaterThan(0n);
      expect(result.peginTxid).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should select UTXOs covering htlcValue + fee", async () => {
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

      const result = await manager.prepareAtomicPegin({
        amount: TEST_AMOUNTS.PEGIN_SMALL,
        ...BASE_ATOMIC_PEGIN_PARAMS,
      });

      expect(result.selectedUTXOs.length).toBeGreaterThanOrEqual(1);

      // totalSelected = htlcValue + fee + changeAmount
      const totalSelected = result.selectedUTXOs.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      );
      expect(totalSelected).toBe(result.htlcValue + result.fee + result.changeAmount);
    });

    it("should handle multiple vault keepers and universal challengers", async () => {
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

      const result = await manager.prepareAtomicPegin({
        amount: TEST_AMOUNTS.PEGIN,
        ...BASE_ATOMIC_PEGIN_PARAMS,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1, TEST_KEYS.VAULT_KEEPER_2],
        numLocalChallengers: 2,
      });

      expect(result.fundedPrePeginTxHex.length).toBeGreaterThan(0);
      expect(result.vaultScriptPubKey.length).toBeGreaterThan(0);
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

      const result = await manager.prepareAtomicPegin({
        amount: TEST_AMOUNTS.PEGIN,
        ...BASE_ATOMIC_PEGIN_PARAMS,
      });

      // totalSelected = htlcValue + fee + changeAmount
      const totalSelected = result.selectedUTXOs.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      );
      expect(totalSelected).toBe(result.htlcValue + result.fee + result.changeAmount);
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

      const totalAvailable = TEST_UTXOS.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      );
      const excessiveAmount = totalAvailable + 100_000n;

      await expect(
        manager.prepareAtomicPegin({
          amount: excessiveAmount,
          ...BASE_ATOMIC_PEGIN_PARAMS,
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
        manager.prepareAtomicPegin({
          amount: TEST_AMOUNTS.PEGIN,
          ...BASE_ATOMIC_PEGIN_PARAMS,
          availableUTXOs: [],
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

      await expect(
        manager.prepareAtomicPegin({
          amount: TEST_AMOUNTS.PEGIN,
          ...BASE_ATOMIC_PEGIN_PARAMS,
          vaultProviderBtcPubkey: "invalid-pubkey",
        }),
      ).rejects.toThrow();
    });

    it("should throw error for empty vault keepers", async () => {
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
        manager.prepareAtomicPegin({
          amount: TEST_AMOUNTS.PEGIN,
          ...BASE_ATOMIC_PEGIN_PARAMS,
          vaultKeeperBtcPubkeys: [],
          universalChallengerBtcPubkeys: [],
          numLocalChallengers: 0,
        }),
      ).rejects.toThrow();
    });
  });

  describe("Wallet integration", () => {
    it("should use wallet public key for depositor", async () => {
      const customPubkey = TEST_KEYS.VAULT_KEEPER_2;
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

      const getPublicKeySpy = vi.spyOn(btcWallet, "getPublicKeyHex");

      await manager.prepareAtomicPegin({
        amount: TEST_AMOUNTS.PEGIN,
        ...BASE_ATOMIC_PEGIN_PARAMS,
      });

      expect(getPublicKeySpy).toHaveBeenCalled();
    });

    it("should handle wallet errors gracefully", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
        shouldFailSigning: true,
      });
      const ethWallet = new MockEthereumWallet();

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
        manager.prepareAtomicPegin({
          amount: TEST_AMOUNTS.PEGIN,
          ...BASE_ATOMIC_PEGIN_PARAMS,
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

      const mockUnsignedTx = "0100000000010000000000";

      const result = await manager.registerPeginOnChain({
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        unsignedBtcTx: mockUnsignedTx,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        depositorPayoutBtcAddress:
          "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
        depositorLamportPkHash: MOCK_LAMPORT_PK_HASH,
      });

      expect(signMessageSpy).toHaveBeenCalled();
      const signedMessage = signMessageSpy.mock.calls[0][0];
      expect(signedMessage.toLowerCase()).toContain("0x");

      expect(sendTxSpy).toHaveBeenCalled();
      const txRequest = sendTxSpy.mock.calls[0][0];
      expect(txRequest.to).toBe(TEST_CONTRACT_ADDRESS);
      expect(txRequest.data).toBeDefined();
      expect(txRequest.data).toContain("0x");

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
          depositorPayoutBtcAddress:
            "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
          depositorLamportPkHash: MOCK_LAMPORT_PK_HASH,
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
          depositorPayoutBtcAddress:
            "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
          depositorLamportPkHash: MOCK_LAMPORT_PK_HASH,
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

      await manager.registerPeginOnChain({
        depositorBtcPubkey: `0x${TEST_KEYS.DEPOSITOR}`,
        unsignedBtcTx: "0x0100000000010000000000",
        vaultProvider: TEST_CONTRACT_ADDRESS,
        depositorPayoutBtcAddress:
          "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
        depositorLamportPkHash: MOCK_LAMPORT_PK_HASH,
      });

      expect(sendTxSpy).toHaveBeenCalled();

      sendTxSpy.mockClear();
      await manager.registerPeginOnChain({
        depositorBtcPubkey: TEST_KEYS.DEPOSITOR,
        unsignedBtcTx: "0100000000010000000000",
        vaultProvider: TEST_CONTRACT_ADDRESS,
        depositorPayoutBtcAddress:
          "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
        depositorLamportPkHash: MOCK_LAMPORT_PK_HASH,
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
        ...BASE_ATOMIC_PEGIN_PARAMS,
      };

      const result1 = await manager.prepareAtomicPegin(params);
      const result2 = await manager.prepareAtomicPegin(params);

      expect(result1.vaultScriptPubKey).toBe(result2.vaultScriptPubKey);
      expect(result1.peginTxid).toBe(result2.peginTxid);
      expect(result1.fee).toBe(result2.fee);
    });

    it("should produce different results for different depositors", async () => {
      const btcWallet1 = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const btcWallet2 = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.VAULT_KEEPER_1,
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
        ...BASE_ATOMIC_PEGIN_PARAMS,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_2],
      };

      const result1 = await manager1.prepareAtomicPegin(params);
      const result2 = await manager2.prepareAtomicPegin(params);

      expect(result1.vaultScriptPubKey).not.toBe(result2.vaultScriptPubKey);
    });
  });
});
