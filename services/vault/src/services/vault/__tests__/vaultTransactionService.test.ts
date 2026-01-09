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
  const baseParams: Omit<SubmitPeginParams, "avoidUtxoRefs"> = {
    pegInAmount: 100000n,
    feeRate: 10,
    changeAddress: "bc1qtest",
    vaultProviderAddress: "0xprovider" as `0x${string}`,
    vaultProviderBtcPubkey: "pubkey",
    liquidatorBtcPubkeys: ["liquidator1"],
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

  describe("UTXO filtering with avoidUtxoRefs", () => {
    it("should use filtered UTXOs when avoidUtxoRefs is provided", async () => {
      const avoidUtxoRefs = [{ txid: "txid1", vout: 0 }];

      await submitPeginRequest(mockBtcWallet as any, mockEthWallet as any, {
        ...baseParams,
        avoidUtxoRefs,
      });

      // Verify preparePegin was called with filtered UTXOs (excluding txid1:0)
      expect(mockPreparePegin).toHaveBeenCalledTimes(1);
      const callArgs = mockPreparePegin.mock.calls[0][0];
      expect(callArgs.availableUTXOs).toHaveLength(3);
      expect(callArgs.availableUTXOs.map((u: UTXO) => u.txid)).toEqual([
        "txid2",
        "txid3",
        "txid4",
      ]);
    });

    it("should use full UTXOs when avoidUtxoRefs is empty", async () => {
      await submitPeginRequest(mockBtcWallet as any, mockEthWallet as any, {
        ...baseParams,
        avoidUtxoRefs: [],
      });

      expect(mockPreparePegin).toHaveBeenCalledTimes(1);
      const callArgs = mockPreparePegin.mock.calls[0][0];
      expect(callArgs.availableUTXOs).toHaveLength(4);
    });

    it("should use full UTXOs when avoidUtxoRefs is undefined", async () => {
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

  describe("fallback to full UTXO set on failure", () => {
    it("should fallback to full UTXOs when filtered UTXOs fail", async () => {
      const avoidUtxoRefs = [{ txid: "txid1", vout: 0 }];

      // First call fails, second call succeeds
      mockPreparePegin
        .mockRejectedValueOnce(new Error("Insufficient funds"))
        .mockResolvedValueOnce({
          fundedTxHex: "0x123abc",
          selectedUTXOs: [mockUTXOs[0]],
          fee: 1000n,
        });

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await submitPeginRequest(mockBtcWallet as any, mockEthWallet as any, {
        ...baseParams,
        avoidUtxoRefs,
      });

      // Verify preparePegin was called twice
      expect(mockPreparePegin).toHaveBeenCalledTimes(2);

      // First call with filtered UTXOs
      const firstCallArgs = mockPreparePegin.mock.calls[0][0];
      expect(firstCallArgs.availableUTXOs).toHaveLength(3);

      // Second call (fallback) with full UTXOs
      const secondCallArgs = mockPreparePegin.mock.calls[1][0];
      expect(secondCallArgs.availableUTXOs).toHaveLength(4);

      // Verify warning was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        "[submitPeginRequest] preparePegin failed with filtered UTXOs, retrying with full set",
      );

      consoleSpy.mockRestore();
    });

    it("should NOT retry when no UTXOs were filtered", async () => {
      // avoidUtxoRefs that don't match any UTXOs
      const avoidUtxoRefs = [{ txid: "nonexistent", vout: 99 }];

      const error = new Error("Insufficient funds");
      mockPreparePegin.mockRejectedValue(error);

      await expect(
        submitPeginRequest(mockBtcWallet as any, mockEthWallet as any, {
          ...baseParams,
          avoidUtxoRefs,
        }),
      ).rejects.toThrow("Insufficient funds");

      // Should only be called once (no retry since no UTXOs were actually filtered)
      expect(mockPreparePegin).toHaveBeenCalledTimes(1);
    });

    it("should NOT retry when avoidUtxoRefs is empty", async () => {
      const error = new Error("Insufficient funds");
      mockPreparePegin.mockRejectedValue(error);

      await expect(
        submitPeginRequest(mockBtcWallet as any, mockEthWallet as any, {
          ...baseParams,
          avoidUtxoRefs: [],
        }),
      ).rejects.toThrow("Insufficient funds");

      expect(mockPreparePegin).toHaveBeenCalledTimes(1);
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

    it("should propagate error from fallback attempt", async () => {
      const avoidUtxoRefs = [{ txid: "txid1", vout: 0 }];

      // Both calls fail
      mockPreparePegin.mockRejectedValue(new Error("Network error"));

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(
        submitPeginRequest(mockBtcWallet as any, mockEthWallet as any, {
          ...baseParams,
          avoidUtxoRefs,
        }),
      ).rejects.toThrow("Network error");

      // Both attempts should have been made
      expect(mockPreparePegin).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });
  });

  describe("UTXO ref key normalization", () => {
    it("should handle case-insensitive txid matching for avoidUtxoRefs", async () => {
      // avoidUtxoRefs with uppercase txid
      const avoidUtxoRefs = [{ txid: "TXID1", vout: 0 }];

      await submitPeginRequest(mockBtcWallet as any, mockEthWallet as any, {
        ...baseParams,
        avoidUtxoRefs,
      });

      // utxoRefToKey lowercases both, so TXID1:0 should match txid1:0
      const callArgs = mockPreparePegin.mock.calls[0][0];
      expect(callArgs.availableUTXOs).toHaveLength(3);
      expect(callArgs.availableUTXOs.map((u: UTXO) => u.txid)).not.toContain(
        "txid1",
      );
    });
  });
});
