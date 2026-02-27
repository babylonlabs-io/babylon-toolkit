/** Tests for vaultTransactionService. */

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  preparePeginTransaction,
  type PreparePeginParams,
  type UTXO,
} from "../vaultTransactionService";

const { mockPreparePegin, MockPeginManager } =
  vi.hoisted(() => {
    const mockPreparePegin = vi.fn();

    class MockPeginManager {
      preparePegin = mockPreparePegin;
    }

    return { mockPreparePegin, MockPeginManager };
  });

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  PeginManager: MockPeginManager,
}));

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

vi.mock("../../../clients/eth-contract/client", () => ({
  ETHClient: {
    getInstance: vi.fn(() => ({
      getPublicClient: vi.fn(),
    })),
  },
}));

describe("vaultTransactionService - preparePeginTransaction", () => {
  let mockBtcWallet: {
    getPublicKeyHex: Mock;
  };
  let mockEthWallet: {
    account: { address: string };
  };

  const mockUTXOs: UTXO[] = [
    { txid: "txid1", vout: 0, value: 50000, scriptPubKey: "script1" },
    { txid: "txid2", vout: 1, value: 100000, scriptPubKey: "script2" },
    { txid: "txid3", vout: 0, value: 75000, scriptPubKey: "script3" },
    { txid: "txid4", vout: 2, value: 200000, scriptPubKey: "script4" },
  ];

  const baseParams: PreparePeginParams = {
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

    mockPreparePegin.mockResolvedValue({
      btcTxHash: "txhash123",
      fundedTxHex: "0x123abc",
      selectedUTXOs: [mockUTXOs[0]],
      fee: 1000n,
    });

    mockBtcWallet = {
      getPublicKeyHex: vi.fn().mockResolvedValue("02" + "a".repeat(64)),
    };

    mockEthWallet = {
      account: { address: "0xdepositor" },
    };
  });

  describe("basic functionality", () => {
    it("should use all available UTXOs", async () => {
      await preparePeginTransaction(
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
        preparePeginTransaction(
          mockBtcWallet as any,
          noAccountWallet as any,
          baseParams,
        ),
      ).rejects.toThrow("Ethereum wallet account not found");
    });

    it("should propagate error from preparePegin", async () => {
      mockPreparePegin.mockRejectedValue(new Error("Network error"));

      await expect(
        preparePeginTransaction(
          mockBtcWallet as any,
          mockEthWallet as any,
          baseParams,
        ),
      ).rejects.toThrow("Network error");

      expect(mockPreparePegin).toHaveBeenCalledTimes(1);
    });
  });
});
