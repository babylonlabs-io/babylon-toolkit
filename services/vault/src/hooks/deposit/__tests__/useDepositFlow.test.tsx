/**
 * Tests for useDepositFlow hook - focusing on chain switching logic
 */

import { renderHook, waitFor } from "@testing-library/react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDepositFlow } from "../useDepositFlow";

// Mock config/contracts to avoid env var validation
vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULTS_MANAGER: "0x1234567890123456789012345678901234567890",
    AAVE_CONTROLLER: "0x1234567890123456789012345678901234567890",
  },
}));

vi.mock("@/config", () => ({
  FeatureFlags: { isDepositorAsClaimerEnabled: false },
}));

// Mock dependencies
vi.mock("@babylonlabs-io/config", () => ({
  getETHChain: vi.fn(() => ({
    id: 11155111, // Sepolia
    name: "Sepolia",
  })),
  getNetworkConfigETH: vi.fn(() => ({
    chainId: 11155111,
    name: "sepolia",
    rpcUrl: "https://rpc.sepolia.org",
  })),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  getSharedWagmiConfig: vi.fn(() => ({ config: "mock" })),
  useChainConnector: vi.fn(() => ({
    connectedWallet: {
      account: {
        address: "bc1qtest123",
      },
    },
  })),
}));

vi.mock("wagmi/actions", () => ({
  getWalletClient: vi.fn(),
  switchChain: vi.fn(),
}));

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: vi.fn(() => ({
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    })),
  },
}));

vi.mock("@/utils/errors", () => ({
  mapViemErrorToContractError: vi.fn(),
  ContractError: class ContractError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ContractError";
    }
  },
}));

vi.mock(
  "@/clients/eth-contract/btc-vaults-manager/abis/BTCVaultsManager.abi.json",
  () => ({ default: [] }),
);

vi.mock("@/hooks/useUTXOs", () => ({
  useUTXOs: vi.fn(() => ({
    allUTXOs: [
      {
        txid: "0x123",
        vout: 0,
        value: 500000,
        scriptPubKey: "0xabc",
        confirmed: true,
      },
      {
        txid: "0x456",
        vout: 1,
        value: 300000,
        scriptPubKey: "0xdef",
        confirmed: true,
      },
    ],
    confirmedUTXOs: [
      {
        txid: "0x123",
        vout: 0,
        value: 500000,
        scriptPubKey: "0xabc",
        confirmed: true,
      },
      {
        txid: "0x456",
        vout: 1,
        value: 300000,
        scriptPubKey: "0xdef",
        confirmed: true,
      },
    ],
    availableUTXOs: [
      { txid: "0x123", vout: 0, value: 500000, scriptPubKey: "0xabc" },
      { txid: "0x456", vout: 1, value: 300000, scriptPubKey: "0xdef" },
    ],
    inscriptionUTXOs: [],
    spendableUTXOs: [
      { txid: "0x123", vout: 0, value: 500000, scriptPubKey: "0xabc" },
      { txid: "0x456", vout: 1, value: 300000, scriptPubKey: "0xdef" },
    ],
    spendableMempoolUTXOs: [
      {
        txid: "0x123",
        vout: 0,
        value: 500000,
        scriptPubKey: "0xabc",
        confirmed: true,
      },
      {
        txid: "0x456",
        vout: 1,
        value: 300000,
        scriptPubKey: "0xdef",
        confirmed: true,
      },
    ],
    isLoading: false,
    isLoadingOrdinals: false,
    error: null,
    ordinalsError: null,
    refetch: vi.fn(),
  })),
}));

vi.mock("@/hooks/useVaults", () => ({
  useVaults: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
  })),
}));

vi.mock("@/storage/peginStorage", () => ({
  addPendingPegin: vi.fn(),
  updatePendingPeginStatus: vi.fn(),
  getPendingPegins: vi.fn().mockReturnValue([]),
}));

vi.mock("@/services/deposit", () => ({
  depositService: {
    validateDepositAmount: vi.fn(() => ({ valid: true })),
    formatSatoshisToBtc: vi.fn((amount: bigint) => {
      const btc = Number(amount) / 100_000_000;
      return btc.toString();
    }),
  },
}));

vi.mock("@/services/deposit/polling", () => ({
  waitForContractVerification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/async", () => ({
  pollUntil: vi.fn(async (fn) => fn()),
}));

vi.mock("@/services/vault/vaultProofOfPossessionService", () => ({
  createProofOfPossession: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/services/vault/vaultTransactionService", () => ({
  preparePeginTransaction: vi.fn().mockResolvedValue({
    btcTxHash: "0xmocktxid123",
    fundedTxHex: "0xmockhex",
    selectedUTXOs: [
      { txid: "0x123", vout: 0, value: 500000, scriptPubKey: "0xabc" },
    ],
    fee: 1000n,
    depositorBtcPubkey: "ab".repeat(32),
  }),
  registerPeginOnChain: vi.fn().mockResolvedValue({
    transactionHash: "0xmockhash456",
    btcTxHash: "0xmocktxid123",
    btcTxHex: "0xmockhex",
    selectedUTXOs: [],
    fee: 0n,
  }),
}));

vi.mock("@/context/deposit/DepositState", () => ({
  useDepositState: vi.fn(() => ({
    selectedApplication: "0xAaveController123",
  })),
}));

vi.mock("@/utils/btc", () => ({
  processPublicKeyToXOnly: vi.fn((key) => key),
  stripHexPrefix: vi.fn((hex) => hex.replace("0x", "")),
}));

// Mock vault services for steps 3-4
vi.mock("@/services/vault", () => ({
  broadcastPeginTransaction: vi.fn().mockResolvedValue("0xbroadcasttxid"),
  fetchVaultById: vi.fn().mockResolvedValue({
    unsignedBtcTx: "0xmockunsignedtx",
    status: 1,
  }),
  collectReservedUtxoRefs: vi.fn().mockReturnValue([]),
  selectUtxosForDeposit: vi.fn(({ availableUtxos }) => availableUtxos),
  signAndSubmitPayoutSignatures: vi.fn().mockResolvedValue(undefined),
}));

// Mock payout signature service to avoid SDK imports triggering initEccLib
vi.mock("@/services/vault/vaultPayoutSignatureService", () => ({
  prepareTransactionsForSigning: vi.fn().mockReturnValue([
    {
      claimerPubkeyXOnly: "0xmockclaimer",
      payoutOptimisticTxHex: "0xmockpayoutoptimistic",
      payoutTxHex: "0xmockpayout",
      claimTxHex: "0xmockclaim",
      assertTxHex: "0xmockassert",
    },
  ]),
  getSortedVaultKeeperPubkeys: vi.fn((keepers) =>
    keepers.map((k: { btcPubKey: string }) => k.btcPubKey),
  ),
  getSortedUniversalChallengerPubkeys: vi.fn((challengers) =>
    challengers.map((c: { btcPubKey: string }) => c.btcPubKey),
  ),
  signPayoutOptimistic: vi.fn().mockResolvedValue("0xmocksignature1"),
  signPayout: vi.fn().mockResolvedValue("0xmocksignature2"),
  submitSignaturesToVaultProvider: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn().mockReturnValue("signet"),
}));

// Mock protocol params context
vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: vi.fn(() => ({
    config: {
      minimumPegInAmount: 10000n,
      pegInFee: 0n,
      pegInActivationTimeout: 50400n,
      pegInConfirmationDepth: 30n,
    },
    minDeposit: 10000n,
    latestUniversalChallengers: [
      { id: "0xUC1", btcPubKey: "0xUniversalChallengerKey1" },
    ],
  })),
}));

// Mock vault provider RPC
vi.mock("@/clients/vault-provider-rpc", () => {
  return {
    VaultProviderRpcApi: class MockVaultProviderRpcApi {
      requestDepositorPresignTransactions = vi.fn().mockResolvedValue({
        txs: [
          {
            claimer_pubkey: "0xclaimerpubkey",
            claim_tx: { tx_hex: "0xclaimtx", sighash: null },
            payout_optimistic_tx: {
              tx_hex: "0xpayoutoptimistictx",
              sighash: "0xsighash1",
            },
            assert_tx: { tx_hex: "0xasserttx", sighash: null },
            payout_tx: { tx_hex: "0xpayouttx", sighash: "0xsighash2" },
          },
        ],
      });
    },
  };
});

// Mock useVaultProviders hook
vi.mock("../useVaultProviders", () => ({
  useVaultProviders: vi.fn(() => ({
    findProvider: vi.fn(() => ({
      id: "0xProvider123",
      url: "https://vault-provider.test",
      btcPubKey: "0xVaultProviderKey",
      name: "Test Provider",
    })),
    vaultKeepers: [{ btcPubKey: "0xVaultKeeperKey1" }],
    vaultProviders: [],
    loading: false,
    error: null,
    findProviders: vi.fn(),
  })),
}));

describe("useDepositFlow - Chain Switching", () => {
  const mockBtcWalletProvider = {
    signMessage: vi.fn().mockResolvedValue("mocksignature"),
    getPublicKeyHex: vi.fn().mockResolvedValue("0xmockpubkey"),
    getAddress: vi.fn().mockResolvedValue("bc1qtest123"),
    signPsbt: vi.fn().mockResolvedValue("mocksignedpsbt"),
    getNetwork: vi.fn().mockResolvedValue("signet"),
    signPsbts: vi
      .fn()
      .mockImplementation(async (psbtsHexes) =>
        psbtsHexes.map(() => "mocksignedpsbt"),
      ),
  };

  const mockParams = {
    amount: 500000n,
    feeRate: 20, // Fee rate from review modal (sat/vB)
    btcWalletProvider: mockBtcWalletProvider,
    depositorEthAddress: "0xEthAddress123" as Address,
    selectedApplication: "0xcb3843752798493344c254d8d88640621e202395", // Aave controller address
    selectedProviders: ["0xProvider123" as Address],
    vaultProviderBtcPubkey: "0xVaultProviderKey",
    vaultKeeperBtcPubkeys: ["0xVaultKeeperKey1"],
    universalChallengerBtcPubkeys: ["0xUniversalChallengerKey1"],
    modalOpen: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Chain switching on correct chain", () => {
    it("should successfully switch to correct chain before getting wallet client", async () => {
      const { getWalletClient, switchChain } = await import("wagmi/actions");

      // Mock wallet client
      vi.mocked(getWalletClient).mockResolvedValue({
        account: { address: "0xEthAddress123" },
        chain: { id: 11155111 },
      } as any);

      // Mock successful chain switch
      vi.mocked(switchChain).mockResolvedValue({ id: 11155111 } as any);

      const { result } = renderHook(() => useDepositFlow(mockParams));

      // Execute deposit flow
      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(switchChain).toHaveBeenCalledWith(
          { config: "mock" },
          { chainId: 11155111 },
        );
      });

      // Verify wallet client was requested after chain switch
      expect(getWalletClient).toHaveBeenCalledWith(
        { config: "mock" },
        {
          chainId: 11155111,
          account: "0xEthAddress123",
        },
      );
    });

    it("should call switchChain before getWalletClient", async () => {
      const { getWalletClient, switchChain } = await import("wagmi/actions");
      const callOrder: string[] = [];

      vi.mocked(switchChain).mockImplementation(async () => {
        callOrder.push("switchChain");
        return { id: 11155111 } as any;
      });

      vi.mocked(getWalletClient).mockImplementation(async () => {
        callOrder.push("getWalletClient");
        return {
          account: { address: "0xEthAddress123" },
          chain: { id: 11155111 },
        } as any;
      });

      const { result } = renderHook(() => useDepositFlow(mockParams));

      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(callOrder).toEqual(["switchChain", "getWalletClient"]);
      });
    });
  });

  describe("Chain switching failures", () => {
    it("should handle chain switch rejection with user-friendly error", async () => {
      const { switchChain } = await import("wagmi/actions");

      // Mock user rejecting chain switch
      vi.mocked(switchChain).mockRejectedValue(
        new Error("User rejected the request"),
      );

      const { result } = renderHook(() => useDepositFlow(mockParams));

      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(result.current.error).toContain("Please switch to");
        expect(result.current.error).toContain("Sepolia Testnet");
      });

      expect(result.current.processing).toBe(false);
    });

    it("should show mainnet message when chainId is 1", async () => {
      const { getETHChain } = await import("@babylonlabs-io/config");
      const { switchChain } = await import("wagmi/actions");

      // Mock mainnet
      vi.mocked(getETHChain).mockReturnValue({
        id: 1,
        name: "Ethereum Mainnet",
      } as any);

      // Mock chain switch failure
      vi.mocked(switchChain).mockRejectedValue(
        new Error("User rejected the request"),
      );

      const { result } = renderHook(() => useDepositFlow(mockParams));

      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(result.current.error).toContain("Please switch to");
        expect(result.current.error).toContain("Ethereum Mainnet");
      });
    });

    it("should log chain switch error to console", async () => {
      const { switchChain } = await import("wagmi/actions");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const switchError = new Error("Network error during switch");
      vi.mocked(switchChain).mockRejectedValue(switchError);

      const { result } = renderHook(() => useDepositFlow(mockParams));

      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Failed to switch chain:",
          switchError,
        );
      });

      consoleErrorSpy.mockRestore();
    });

    it("should not proceed to getWalletClient if chain switch fails", async () => {
      const { getWalletClient, switchChain } = await import("wagmi/actions");

      vi.mocked(switchChain).mockRejectedValue(
        new Error("Chain switch failed"),
      );

      const { result } = renderHook(() => useDepositFlow(mockParams));

      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // getWalletClient should not be called if chain switch fails
      expect(getWalletClient).not.toHaveBeenCalled();
    });
  });

  describe("Chain switching with different chain IDs", () => {
    it("should handle Sepolia testnet (11155111)", async () => {
      const { getETHChain } = await import("@babylonlabs-io/config");
      const { switchChain } = await import("wagmi/actions");

      vi.mocked(getETHChain).mockReturnValue({
        id: 11155111,
        name: "Sepolia",
      } as any);

      vi.mocked(switchChain).mockResolvedValue({ id: 11155111 } as any);

      const { result } = renderHook(() => useDepositFlow(mockParams));

      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(switchChain).toHaveBeenCalledWith(expect.anything(), {
          chainId: 11155111,
        });
      });
    });

    it("should handle Ethereum mainnet (1)", async () => {
      const { getETHChain } = await import("@babylonlabs-io/config");
      const { switchChain } = await import("wagmi/actions");

      vi.mocked(getETHChain).mockReturnValue({
        id: 1,
        name: "Ethereum Mainnet",
      } as any);

      vi.mocked(switchChain).mockResolvedValue({ id: 1 } as any);

      const { result } = renderHook(() => useDepositFlow(mockParams));

      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(switchChain).toHaveBeenCalledWith(expect.anything(), {
          chainId: 1,
        });
      });
    });
  });

  describe("Integration with deposit flow", () => {
    it("should complete full deposit flow after successful chain switch", async () => {
      const { getWalletClient, switchChain } = await import("wagmi/actions");

      vi.mocked(switchChain).mockResolvedValue({ id: 11155111 } as any);
      vi.mocked(getWalletClient).mockResolvedValue({
        account: { address: "0xEthAddress123" },
        chain: { id: 11155111 },
      } as any);

      const { result } = renderHook(() => useDepositFlow(mockParams));

      expect(result.current.currentStep).toBe(1);
      expect(result.current.processing).toBe(false);

      const flowResult = await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(result.current.processing).toBe(false);
        // executeDepositFlow now returns result instead of calling onSuccess
        expect(flowResult).not.toBeNull();
      });

      // Verify chain switch happened
      expect(switchChain).toHaveBeenCalled();
    });

    it("should set processing state during chain switch", async () => {
      const { switchChain } = await import("wagmi/actions");

      let resolveSwitch: (value: any) => void;
      const switchPromise = new Promise((resolve) => {
        resolveSwitch = resolve;
      });

      vi.mocked(switchChain).mockReturnValue(switchPromise as any);

      const { result } = renderHook(() => useDepositFlow(mockParams));

      const executePromise = result.current.executeDepositFlow();

      // Should be processing while waiting for chain switch
      await waitFor(() => {
        expect(result.current.processing).toBe(true);
      });

      // Resolve the chain switch
      resolveSwitch!({ id: 11155111 });

      await executePromise;
    });

    it("should maintain error state after chain switch failure", async () => {
      const { switchChain } = await import("wagmi/actions");

      vi.mocked(switchChain).mockRejectedValue(new Error("User rejected"));

      const { result } = renderHook(() => useDepositFlow(mockParams));

      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.processing).toBe(false);
      });

      // Error should persist
      expect(result.current.error).toContain("Please switch to");
    });
  });

  describe("Error message formatting", () => {
    it("should include network name in error message for Sepolia", async () => {
      const { getETHChain } = await import("@babylonlabs-io/config");
      const { switchChain } = await import("wagmi/actions");

      vi.mocked(getETHChain).mockReturnValue({
        id: 11155111,
        name: "Sepolia",
      } as any);

      vi.mocked(switchChain).mockRejectedValue(new Error("Failed"));

      const { result } = renderHook(() => useDepositFlow(mockParams));

      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(result.current.error).toBe(
          "Please switch to Sepolia Testnet in your wallet",
        );
      });
    });

    it("should include network name in error message for Mainnet", async () => {
      const { getETHChain } = await import("@babylonlabs-io/config");
      const { switchChain } = await import("wagmi/actions");

      vi.mocked(getETHChain).mockReturnValue({
        id: 1,
        name: "Ethereum Mainnet",
      } as any);

      vi.mocked(switchChain).mockRejectedValue(new Error("Failed"));

      const { result } = renderHook(() => useDepositFlow(mockParams));

      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(result.current.error).toBe(
          "Please switch to Ethereum Mainnet in your wallet",
        );
      });
    });
  });

  describe("Application Controller", () => {
    it("should pass selectedApplication as applicationController to addPendingPegin", async () => {
      const { getWalletClient, switchChain } = await import("wagmi/actions");
      const { addPendingPegin } = await import("@/storage/peginStorage");

      // Mock wallet client and chain switch
      vi.mocked(getWalletClient).mockResolvedValue({
        account: { address: "0xEthAddress123" },
        chain: { id: 11155111 },
      } as any);
      vi.mocked(switchChain).mockResolvedValue({ id: 11155111 } as any);

      const { result } = renderHook(() => useDepositFlow(mockParams));

      // Execute deposit flow
      await result.current.executeDepositFlow();

      // Wait for deposit flow to complete
      await waitFor(() => {
        expect(result.current.processing).toBe(false);
      });

      // Verify addPendingPegin was called with applicationController set to selectedApplication
      expect(addPendingPegin).toHaveBeenCalledWith(
        "0xEthAddress123",
        expect.objectContaining({
          applicationController: "0xcb3843752798493344c254d8d88640621e202395",
        }),
      );
    });
  });
});
