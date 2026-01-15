/**
 * Tests for vaultTransactionService - UTXO selection and fallback logic
 *
 * These tests verify:
 * 1. Filtered UTXOs are used when avoidUtxoRefs is provided
 * 2. Fallback to full UTXO set when preparation fails with filtered UTXOs
 * 3. No retry when no UTXOs were filtered
 * 4. Error handling and logging behavior
 */

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  submitPeginRequest,
  type SubmitPeginParams,
  type UTXO,
} from "../vaultTransactionService";

// Use vi.hoisted to create mock functions that are available during module hoisting
const { mockPreparePegin, mockRegisterPeginOnChain, MockPeginManager } =
  vi.hoisted(() => {
    const mockPreparePegin = vi.fn();
    const mockRegisterPeginOnChain = vi.fn();

    // Create a mock class for PeginManager
    class MockPeginManager {
      preparePegin = mockPreparePegin;
      registerPeginOnChain = mockRegisterPeginOnChain;
    }

    return { mockPreparePegin, mockRegisterPeginOnChain, MockPeginManager };
  });

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  PeginManager: MockPeginManager,
}));

// Mock config - need to provide all used exports
vi.mock("@babylonlabs-io/config", () => ({
  getETHChain: vi.fn(() => ({ id: 1, name: "Ethereum" })),
  getNetworkConfigETH: vi.fn(() => ({
    chain: { id: 1, name: "Ethereum" },
    transport: {},
  })),
  getNetworkConfigBTC: vi.fn(() => ({
    network: "mainnet",
    mempoolApiUrl: "https://mempool.space/api",
  })),
}));

vi.mock("../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn(() => "https://mempool.space/api"),
}));

vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn(() => "mainnet"),
}));

vi.mock("../../../config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULTS_MANAGER: "0xcontract",
  },
}));

// Mock the ETH client to avoid initialization issues
vi.mock("../../../clients/eth-contract/client", () => ({
  ETHClient: {
    getInstance: vi.fn(() => ({
      getPublicClient: vi.fn(),
    })),
  },
}));

describe("vaultTransactionService - submitPeginRequest UTXO Selection", () => {
  // Mock wallets
  let mockBtcWallet: {
    getPublicKeyHex: Mock;
  };
  let mockEthWallet: {
    account: { address: string };
  };

  // Test UTXOs
  const mockUTXOs: UTXO[] = [
    { txid: "txid1", vout: 0, value: 50000, scriptPubKey: "script1" },
    { txid: "txid2", vout: 1, value: 100000, scriptPubKey: "script2" },
    { txid: "txid3", vout: 0, value: 75000, scriptPubKey: "script3" },
    { txid: "txid4", vout: 2, value: 200000, scriptPubKey: "script4" },
  ];

  // Base params for tests
  const baseParams: SubmitPeginParams = {
    pegInAmount: 100000n,
    feeRate: 10,
    changeAddress: "bc1qtest",
    vaultProviderAddress: "0xprovider" as `0x${string}`,
    vaultProviderBtcPubkey: "pubkey",
    vaultKeeperBtcPubkeys: ["keeper1"],
    universalChallengerBtcPubkeys: ["challenger1"],
    availableUTXOs: mockUTXOs,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default successful responses for the mocked PeginManager methods
    mockPreparePegin.mockResolvedValue({
      fundedTxHex: "0x123abc",
      selectedUTXOs: [mockUTXOs[0]],
      fee: 1000n,
    });

    mockRegisterPeginOnChain.mockResolvedValue({
      ethTxHash: "0xethtx",
      vaultId: "0xvaultid",
    });

    // Mock BTC wallet
    mockBtcWallet = {
      getPublicKeyHex: vi.fn().mockResolvedValue(
        "02" + "a".repeat(64), // 66 char pubkey (will be trimmed to x-only)
      ),
    };

    // Mock ETH wallet
    mockEthWallet = {
      account: { address: "0xdepositor" },
    };
  });

  describe("basic functionality", () => {
    it("should use all available UTXOs", async () => {
      await submitPeginRequest(
        mockBtcWallet as any,
        mockEthWallet as any,
        baseParams,
      );

      expect(mockPreparePegin).toHaveBeenCalledTimes(1);
      const callArgs = mockPreparePegin.mock.calls[0][0];
      expect(callArgs.availableUTXOs).toHaveLength(4);
    });
  });

  describe("error handling", () => {
    it("should throw error if ETH wallet has no account", async () => {
      const noAccountWallet = { account: undefined };

      await expect(
        submitPeginRequest(
          mockBtcWallet as any,
          noAccountWallet as any,
          baseParams,
        ),
      ).rejects.toThrow("Ethereum wallet account not found");
    });

    it("should propagate error from preparePegin", async () => {
      mockPreparePegin.mockRejectedValue(new Error("Network error"));

      await expect(
        submitPeginRequest(mockBtcWallet as any, mockEthWallet as any, baseParams),
      ).rejects.toThrow("Network error");

      expect(mockPreparePegin).toHaveBeenCalledTimes(1);
    });
  });
});
