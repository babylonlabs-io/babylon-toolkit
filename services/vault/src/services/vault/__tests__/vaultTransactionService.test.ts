/** Tests for vaultTransactionService. */

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  preparePeginTransaction,
  type PreparePeginParams,
  type UTXO,
} from "../vaultTransactionService";

const { mockPreparePegin, MockPeginManager } = vi.hoisted(() => {
  const mockPreparePegin = vi.fn();

  class MockPeginManager {
    preparePegin = mockPreparePegin;
  }

  return { mockPreparePegin, MockPeginManager };
});

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  PeginManager: MockPeginManager,
  ensureHexPrefix: (hex: string) => (hex.startsWith("0x") ? hex : `0x${hex}`),
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
    BTC_VAULT_REGISTRY: "0xcontract",
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
    pegInAmounts: [100000n],
    protocolFeeRate: 10n,
    mempoolFeeRate: 10,
    changeAddress: "bc1qtest",
    vaultProviderBtcPubkey: "pubkey",
    vaultKeeperBtcPubkeys: ["keeper1"],
    universalChallengerBtcPubkeys: ["challenger1"],
    timelockPegin: 100,
    timelockRefund: 50,
    hashlocks: ["ab".repeat(32)],
    councilQuorum: 2,
    councilSize: 3,
    availableUTXOs: mockUTXOs,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPreparePegin.mockResolvedValue({
      fundedPrePeginTxHex: "0x123abc",
      unsignedPrePeginTxHex: "0xunfunded",
      selectedUTXOs: [mockUTXOs[0]],
      fee: 1000n,
      perVault: [
        {
          htlcVout: 0,
          peginTxid: "txhash123",
          peginTxHex: "0xpeginHex",
          peginInputSignature: "a".repeat(128),
        },
      ],
    });

    mockBtcWallet = {
      getPublicKeyHex: vi.fn().mockResolvedValue("02" + "a".repeat(64)),
    };

    mockEthWallet = {
      account: { address: "0xdepositor" },
    };
  });

  describe("basic functionality", () => {
    it("should pass all available UTXOs to the SDK", async () => {
      await preparePeginTransaction(
        mockBtcWallet as any,
        mockEthWallet as any,
        baseParams,
      );

      expect(mockPreparePegin).toHaveBeenCalledTimes(1);
      const callArgs = mockPreparePegin.mock.calls[0][0];
      expect(callArgs.availableUTXOs).toHaveLength(4);
    });

    it("should return batch-shaped result with perVault array", async () => {
      const result = await preparePeginTransaction(
        mockBtcWallet as any,
        mockEthWallet as any,
        baseParams,
      );

      expect(result.perVault).toHaveLength(1);
      expect(result.perVault[0].htlcVout).toBe(0);
      expect(result.perVault[0].btcTxHash).toBe("0xtxhash123");
      expect(result.perVault[0].peginTxHex).toBe("0xpeginHex");
      expect(result.fundedPrePeginTxHex).toBe("0x123abc");
      expect(result.unsignedPrePeginTxHex).toBe("0xunfunded");
    });

    it("should handle multi-vault params", async () => {
      const multiParams: PreparePeginParams = {
        ...baseParams,
        pegInAmounts: [100000n, 200000n],
        hashlocks: ["ab".repeat(32), "cd".repeat(32)],
      };

      mockPreparePegin.mockResolvedValue({
        fundedPrePeginTxHex: "0x123abc",
        unsignedPrePeginTxHex: "0xunfunded",
        selectedUTXOs: [mockUTXOs[0], mockUTXOs[1]],
        fee: 2000n,
        perVault: [
          {
            htlcVout: 0,
            peginTxid: "txhash0",
            peginTxHex: "peginHex0",
            peginInputSignature: "a".repeat(128),
          },
          {
            htlcVout: 1,
            peginTxid: "txhash1",
            peginTxHex: "peginHex1",
            peginInputSignature: "b".repeat(128),
          },
        ],
      });

      const result = await preparePeginTransaction(
        mockBtcWallet as any,
        mockEthWallet as any,
        multiParams,
      );

      expect(result.perVault).toHaveLength(2);
      expect(result.perVault[0].htlcVout).toBe(0);
      expect(result.perVault[1].htlcVout).toBe(1);
      expect(mockPreparePegin.mock.calls[0][0].amounts).toEqual([
        100000n,
        200000n,
      ]);
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
