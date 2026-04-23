/**
 * Tests for PeginManager
 *
 * Tests the manager's ability to orchestrate peg-in operations
 * using primitives, utilities, and mock wallets.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Address, Chain } from "viem";

import {
  MockBitcoinWallet,
  MockEthereumWallet,
} from "../../../../testing";
import { MEMPOOL_API_URLS } from "../../clients/mempool";
import { initializeWasmForTests } from "../../primitives/psbt/__tests__/helpers";
import type { UTXO } from "../../utils";
import { PeginManager, type PeginManagerConfig } from "../PeginManager";

// Mock calculateBtcTxHash to avoid parsing funded pre-pegin tx in tests
vi.mock("../../utils/transaction/btcTxHash", () => ({
  calculateBtcTxHash: vi.fn(() => `0x${"a".repeat(64)}`),
}));

// Mock buildPeginInputPsbt, extractPeginInputSignature, and finalizePeginInputPsbt —
// the mock wallet cannot produce a valid signed PSBT, so we mock these primitives
vi.mock("../../primitives/psbt/peginInput", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../primitives/psbt/peginInput")>();
  return {
    ...actual,
    buildPeginInputPsbt: vi
      .fn()
      .mockResolvedValue({ psbtHex: "deadbeef" }),
    extractPeginInputSignature: vi.fn().mockReturnValue("a".repeat(128)),
    finalizePeginInputPsbt: vi.fn().mockReturnValue("mock-depositor-signed-pegin-tx"),
  };
});

// Mock viem's createPublicClient to avoid HTTP requests during gas estimation
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      estimateGas: vi.fn().mockResolvedValue(100000n),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        transactionHash: "0x" + "ab".repeat(32),
      }),
      readContract: vi
        .fn()
        .mockImplementation(({ functionName }: { functionName: string }) => {
          if (functionName === "getPegInFee") return Promise.resolve(0n);
          // getBtcVaultBasicInfo — return tuple with zero depositor (vault doesn't exist)
          return Promise.resolve([actual.zeroAddress]);
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

// Mock depositor WOTS public key hash (bytes32)
const MOCK_WOTS_PK_HASH = `0x${"ab".repeat(32)}` as `0x${string}`;

// Mock hashlock for HTLC (bytes32)
const MOCK_HASHLOCK = `0x${"cd".repeat(32)}` as `0x${string}`;

// Mock depositor-signed pegin tx hex
const MOCK_DEPOSITOR_SIGNED_PEGIN_TX = "0200000000010000000000";

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

// Base params for preparePegin — shared across tests
const BASE_PREPARE_PEGIN_PARAMS = {
  vaultProviderBtcPubkey: TEST_KEYS.VAULT_PROVIDER,
  vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1],
  universalChallengerBtcPubkeys: [TEST_KEYS.UNIVERSAL_CHALLENGER_1],
  timelockPegin: 100,
  timelockRefund: 50,
  hashlocks: [TEST_HASH_H],
  protocolFeeRate: 10n,
  mempoolFeeRate: 10,
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
          btcVaultRegistry: TEST_CONTRACT_ADDRESS,
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
          vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
          mempoolApiUrl: MEMPOOL_API_URLS.signet,
        });

        expect(manager.getNetwork()).toBe(network);
      }
    });
  });

  describe("preparePegin", () => {
    it("passes the wallet's raw (compressed) pubkey to signPsbts", async () => {
      // Regression: taproot signPsbt expects the wallet's native format
      // on signInputs[].publicKey (UniSat/OKX/OneKey reject x-only with
      // "invalid public key in toSignInput").
      const compressedPubkey = `02${TEST_KEYS.DEPOSITOR}`;
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: compressedPubkey,
      });
      const ethWallet = new MockEthereumWallet();
      const signPsbtsSpy = vi.spyOn(btcWallet, "signPsbts");

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      expect(signPsbtsSpy).toHaveBeenCalled();
      const signOptions = signPsbtsSpy.mock.calls[0][1];
      const publicKey = signOptions?.[0]?.signInputs?.[0]?.publicKey;
      expect(publicKey).toBe(compressedPubkey);
    });

    it("should prepare a pegin with valid params", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const result = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      // Verify result structure
      expect(result).toHaveProperty("fundedPrePeginTxHex");
      expect(result).toHaveProperty("prePeginTxid");
      expect(result).toHaveProperty("perVault");
      expect(result).toHaveProperty("selectedUTXOs");
      expect(result).toHaveProperty("fee");
      expect(result).toHaveProperty("changeAmount");

      // Verify per-vault data
      expect(result.perVault).toHaveLength(1);
      expect(result.perVault[0]).toHaveProperty("htlcVout");
      expect(result.perVault[0]).toHaveProperty("htlcValue");
      expect(result.perVault[0]).toHaveProperty("peginTxHex");
      expect(result.perVault[0]).toHaveProperty("peginTxid");
      expect(result.perVault[0]).toHaveProperty("peginInputSignature");
      expect(result.perVault[0]).toHaveProperty("vaultScriptPubKey");

      // Verify types
      expect(typeof result.fundedPrePeginTxHex).toBe("string");
      expect(typeof result.perVault[0].htlcValue).toBe("bigint");
      expect(typeof result.perVault[0].vaultScriptPubKey).toBe("string");
      expect(Array.isArray(result.selectedUTXOs)).toBe(true);
      expect(typeof result.fee).toBe("bigint");
      expect(typeof result.changeAmount).toBe("bigint");
      expect(result.perVault[0].peginInputSignature).toBe("a".repeat(128)); // from mock

      // Verify values
      expect(result.fundedPrePeginTxHex.length).toBeGreaterThan(0);
      expect(result.perVault[0].htlcValue).toBeGreaterThan(0n);
      expect(result.perVault[0].vaultScriptPubKey.length).toBeGreaterThan(0);
      expect(result.selectedUTXOs.length).toBeGreaterThan(0);
      expect(result.fee).toBeGreaterThan(0n);
      expect(result.perVault[0].peginTxid).toMatch(/^[0-9a-f]{64}$/);
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const result = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN_SMALL],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      expect(result.selectedUTXOs.length).toBeGreaterThanOrEqual(1);

      // Selected UTXOs must cover all outputs (HTLC + CPFP anchor) + fee
      const totalSelected = result.selectedUTXOs.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      );
      expect(totalSelected).toBeGreaterThanOrEqual(result.perVault[0].htlcValue + result.fee);
      expect(result.changeAmount).toBeGreaterThanOrEqual(0n);
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const result = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_1, TEST_KEYS.VAULT_KEEPER_2],
      });

      expect(result.fundedPrePeginTxHex.length).toBeGreaterThan(0);
      expect(result.perVault[0].vaultScriptPubKey.length).toBeGreaterThan(0);
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const result = await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      });

      // Selected UTXOs must cover all outputs (HTLC + CPFP anchor) + fee
      const totalSelected = result.selectedUTXOs.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      );
      expect(totalSelected).toBeGreaterThanOrEqual(result.perVault[0].htlcValue + result.fee);
      expect(result.changeAmount).toBeGreaterThanOrEqual(0n);
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const totalAvailable = TEST_UTXOS.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      );
      const excessiveAmount = totalAvailable + 100_000n;

      await expect(
        manager.preparePegin({
          amounts: [excessiveAmount],
          ...BASE_PREPARE_PEGIN_PARAMS,
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
          vaultKeeperBtcPubkeys: [],
          universalChallengerBtcPubkeys: [],
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const getPublicKeySpy = vi.spyOn(btcWallet, "getPublicKeyHex");

      await manager.preparePegin({
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.preparePegin({
          amounts: [TEST_AMOUNTS.PEGIN],
          ...BASE_PREPARE_PEGIN_PARAMS,
        }),
      ).rejects.toThrow("Wallet connection failed");
    });
  });

  describe("signProofOfPossession", () => {
    it("returns signature bound to connected ETH and BTC identities", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const signMessageSpy = vi.spyOn(btcWallet, "signMessage");

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const pop = await manager.signProofOfPossession();

      expect(signMessageSpy).toHaveBeenCalledTimes(1);
      expect(signMessageSpy.mock.calls[0][1]).toBe("bip322-simple");
      expect(pop.depositorBtcPubkey).toBe(TEST_KEYS.DEPOSITOR);
      expect(pop.depositorEthAddress).toBe(ethWallet.account!.address);
      expect(pop.btcPopSignature.startsWith("0x")).toBe(true);
      expect(pop.btcPopSignature).toMatch(/^0x[0-9a-f]+$/);
    });

    it("strips 0x prefix from depositor BTC pubkey", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: `0x${TEST_KEYS.DEPOSITOR}`,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const pop = await manager.signProofOfPossession();
      expect(pop.depositorBtcPubkey).toBe(TEST_KEYS.DEPOSITOR);
    });

    it("passes through hex wallet output unchanged (lowercase)", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce(
        "0xDEADBEEF",
      );
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const pop = await manager.signProofOfPossession();
      expect(pop.btcPopSignature).toBe("0xdeadbeef");
    });

    it("rejects an empty signature from the wallet", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce("");
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(
        /empty/i,
      );
    });

    it("rejects a malformed (non-canonical) base64 signature", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      // "AB==" decodes to 1 byte but canonical encoding would be "AA==".
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce("AB==");
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(
        /base64/i,
      );
    });

    it("rejects a malformed hex signature", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce("0xZZ");
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(
        /hex/i,
      );
    });

    it("treats unprefixed hex-looking output as hex, not base64", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      vi.spyOn(btcWallet, "signMessage").mockResolvedValueOnce("deadbeef");
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const pop = await manager.signProofOfPossession();
      expect(pop.btcPopSignature).toBe("0xdeadbeef");
    });

    it("accepts a compressed sec1 pubkey and drops the prefix byte", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: `02${TEST_KEYS.DEPOSITOR}`,
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const pop = await manager.signProofOfPossession();
      expect(pop.depositorBtcPubkey).toBe(TEST_KEYS.DEPOSITOR);
    });

    it("rejects a BTC pubkey of non-standard length", async () => {
      // 40 hex chars — neither x-only, compressed, nor uncompressed.
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: "ab".repeat(20),
      });
      const ethWallet = new MockEthereumWallet();

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(
        /public key length/i,
      );
    });

    it("throws when ETH wallet has no account", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      (ethWallet as any).account = undefined;

      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(manager.signProofOfPossession()).rejects.toThrow(
        /wallet account not found/i,
      );
    });
  });

  describe("registerPeginOnChain", () => {
    async function makeManagerWithPop() {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      const popSignature = await manager.signProofOfPossession();
      return { manager, btcWallet, ethWallet, popSignature };
    }

    it("should call ethWallet.sendTransaction with encoded contract data", async () => {
      const { manager, ethWallet, popSignature } = await makeManagerWithPop();
      const sendTxSpy = vi.spyOn(ethWallet, "sendTransaction");

      const result = await manager.registerPeginOnChain({
        unsignedPrePeginTx: "0100000000010000000000",
        depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        hashlock: MOCK_HASHLOCK,
        htlcVout: 0,
        depositorPayoutBtcAddress:
          "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
        depositorWotsPkHash: MOCK_WOTS_PK_HASH,
        popSignature,
      });

      expect(sendTxSpy).toHaveBeenCalled();
      const txRequest = sendTxSpy.mock.calls[0][0];
      expect(txRequest.to).toBe(TEST_CONTRACT_ADDRESS);
      expect(txRequest.data).toBeDefined();
      expect(txRequest.data).toContain("0x");

      expect(result.ethTxHash.startsWith("0x")).toBe(true);
      expect(result.vaultId.startsWith("0x")).toBe(true);
      expect(result).not.toHaveProperty("btcPopSignature");
    });

    it("should throw when ETH wallet is connected to a different account than the PoP", async () => {
      const { manager, ethWallet, popSignature } = await makeManagerWithPop();
      // Simulate account switch between signing PoP and submitting.
      (ethWallet as any).account = {
        ...ethWallet.account,
        address: "0x1111111111111111111111111111111111111111",
      };

      await expect(
        manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress:
            "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
        }),
      ).rejects.toThrow(/Proof of possession/i);
    });

    it("should throw when BTC wallet is connected to a different pubkey than the PoP", async () => {
      const { manager, btcWallet, popSignature } =
        await makeManagerWithPop();
      // Simulate BTC wallet swap between signing PoP and submitting.
      vi.spyOn(btcWallet, "getPublicKeyHex").mockResolvedValue(
        TEST_KEYS.VAULT_KEEPER_1,
      );

      await expect(
        manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress:
            "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
        }),
      ).rejects.toThrow(/BTC wallet is currently connected/i);
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      // Produce popSignature while the wallet is still healthy for signing;
      // the mock only fails ETH ops, not BTC signing.
      const popSignature = await manager.signProofOfPossession();

      await expect(
        manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress:
            "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
        }),
      ).rejects.toThrow(/Mock transaction failed/);
    });

    it("should handle hex-prefixed and non-prefixed inputs", async () => {
      const { manager, ethWallet, popSignature } = await makeManagerWithPop();
      const sendTxSpy = vi.spyOn(ethWallet, "sendTransaction");

      await manager.registerPeginOnChain({
        unsignedPrePeginTx: "0x0100000000010000000000",
        depositorSignedPeginTx: `0x${MOCK_DEPOSITOR_SIGNED_PEGIN_TX}`,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        hashlock: MOCK_HASHLOCK,
        htlcVout: 0,
        depositorPayoutBtcAddress:
          "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
        depositorWotsPkHash: MOCK_WOTS_PK_HASH,
        popSignature,
      });
      expect(sendTxSpy).toHaveBeenCalled();

      sendTxSpy.mockClear();
      await manager.registerPeginOnChain({
        unsignedPrePeginTx: "0100000000010000000000",
        depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
        vaultProvider: TEST_CONTRACT_ADDRESS,
        hashlock: MOCK_HASHLOCK,
        htlcVout: 0,
        depositorPayoutBtcAddress:
          "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
        depositorWotsPkHash: MOCK_WOTS_PK_HASH,
        popSignature,
      });
      expect(sendTxSpy).toHaveBeenCalled();
    });

    it("should throw when transaction receipt status is reverted", async () => {
      const viem = await import("viem");
      const mockedCreatePublicClient = vi.mocked(viem.createPublicClient);

      const defaultReadContract = vi
        .fn()
        .mockImplementation(({ functionName }: { functionName: string }) => {
          if (functionName === "getPegInFee") return Promise.resolve(0n);
          return Promise.resolve([viem.zeroAddress]);
        });

      mockedCreatePublicClient.mockReturnValueOnce({
        readContract: defaultReadContract,
      } as any);
      mockedCreatePublicClient.mockReturnValueOnce({
        estimateGas: vi.fn().mockResolvedValue(100000n),
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          status: "reverted",
          transactionHash: "0x" + "ab".repeat(32),
        }),
        readContract: defaultReadContract,
      } as any);

      const { manager, popSignature } = await makeManagerWithPop();

      await expect(
        manager.registerPeginOnChain({
          unsignedPrePeginTx: "0100000000010000000000",
          depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
          vaultProvider: TEST_CONTRACT_ADDRESS,
          hashlock: MOCK_HASHLOCK,
          htlcVout: 0,
          depositorPayoutBtcAddress:
            "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
          depositorWotsPkHash: MOCK_WOTS_PK_HASH,
          popSignature,
        }),
      ).rejects.toThrow(/Transaction reverted/);
    });
  });

  describe("registerPeginBatchOnChain", () => {
    const BASE_UNSIGNED_PRE_PEGIN = "0100000000010000000000";
    const baseRequest = {
      depositorSignedPeginTx: MOCK_DEPOSITOR_SIGNED_PEGIN_TX,
      hashlock: MOCK_HASHLOCK,
      depositorPayoutBtcAddress:
        "tb1pmfr3p9j00pfxjh0zmgp99y8zftmd3s5pmedqhyptwy6lm87hf5ssk79hv2",
      depositorWotsPkHash: MOCK_WOTS_PK_HASH,
    } as const;

    it("rejects a batch when ETH wallet switches after PoP was signed", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      const popSignature = await manager.signProofOfPossession();

      (ethWallet as any).account = {
        ...ethWallet.account,
        address: "0x1111111111111111111111111111111111111111",
      };

      await expect(
        manager.registerPeginBatchOnChain({
          vaultProvider: TEST_CONTRACT_ADDRESS,
          unsignedPrePeginTx: BASE_UNSIGNED_PRE_PEGIN,
          popSignature,
          requests: [
            { ...baseRequest, htlcVout: 0, depositorSignedPeginTx: "aa" },
            {
              ...baseRequest,
              htlcVout: 1,
              depositorSignedPeginTx: "bb",
              hashlock: MOCK_HASHLOCK_ALT,
            },
          ],
        }),
      ).rejects.toThrow(/Proof of possession/i);
    });

    it("rejects a batch when BTC wallet switches after PoP was signed", async () => {
      const btcWallet = new MockBitcoinWallet({
        publicKeyHex: TEST_KEYS.DEPOSITOR,
      });
      const ethWallet = new MockEthereumWallet();
      const manager = new PeginManager({
        btcNetwork: "signet",
        btcWallet,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      const popSignature = await manager.signProofOfPossession();

      vi.spyOn(btcWallet, "getPublicKeyHex").mockResolvedValue(
        TEST_KEYS.VAULT_KEEPER_1,
      );

      await expect(
        manager.registerPeginBatchOnChain({
          vaultProvider: TEST_CONTRACT_ADDRESS,
          unsignedPrePeginTx: BASE_UNSIGNED_PRE_PEGIN,
          popSignature,
          requests: [
            { ...baseRequest, htlcVout: 0, depositorSignedPeginTx: "aa" },
            {
              ...baseRequest,
              htlcVout: 1,
              depositorSignedPeginTx: "bb",
              hashlock: MOCK_HASHLOCK_ALT,
            },
          ],
        }),
      ).rejects.toThrow(/BTC wallet is currently connected/i);
    });

    const MOCK_HASHLOCK_ALT = `0x${"ef".repeat(32)}` as `0x${string}`;

    it("submits submitPeginRequestBatch encoding PoP + each request", async () => {
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });
      const popSignature = await manager.signProofOfPossession();

      const result = await manager.registerPeginBatchOnChain({
        vaultProvider: TEST_CONTRACT_ADDRESS,
        unsignedPrePeginTx: BASE_UNSIGNED_PRE_PEGIN,
        popSignature,
        requests: [
          { ...baseRequest, htlcVout: 0, depositorSignedPeginTx: "aa" },
          {
            ...baseRequest,
            htlcVout: 1,
            depositorSignedPeginTx: "bb",
            hashlock: MOCK_HASHLOCK_ALT,
          },
        ],
      });

      expect(result).not.toHaveProperty("btcPopSignature");
      expect(result.vaults).toHaveLength(2);

      expect(sendTxSpy).toHaveBeenCalledTimes(1);
      const sentData = sendTxSpy.mock.calls[0][0].data as string;
      expect(sentData).toContain(popSignature.btcPopSignature.slice(2));
      // Depositor BTC pubkey comes from PopSignature, not per-request.
      expect(sentData).toContain(popSignature.depositorBtcPubkey);
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      await expect(
        manager.signAndBroadcast({
          fundedPrePeginTxHex: "invalid-hex",
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const params = {
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
      };

      const result1 = await manager.preparePegin(params);
      const result2 = await manager.preparePegin(params);

      expect(result1.perVault[0].vaultScriptPubKey).toBe(result2.perVault[0].vaultScriptPubKey);
      expect(result1.perVault[0].peginTxid).toBe(result2.perVault[0].peginTxid);
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
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const manager2 = new PeginManager({
        btcNetwork: "signet",
        btcWallet: btcWallet2,
        ethWallet: ethWallet as any,
        ethChain: TEST_CHAIN,
        vaultContracts: { btcVaultRegistry: TEST_CONTRACT_ADDRESS },
        mempoolApiUrl: MEMPOOL_API_URLS.signet,
      });

      const params = {
        amounts: [TEST_AMOUNTS.PEGIN],
        ...BASE_PREPARE_PEGIN_PARAMS,
        vaultKeeperBtcPubkeys: [TEST_KEYS.VAULT_KEEPER_2],
      };

      const result1 = await manager1.preparePegin(params);
      const result2 = await manager2.preparePegin(params);

      expect(result1.perVault[0].vaultScriptPubKey).not.toBe(result2.perVault[0].vaultScriptPubKey);
    });
  });
});
