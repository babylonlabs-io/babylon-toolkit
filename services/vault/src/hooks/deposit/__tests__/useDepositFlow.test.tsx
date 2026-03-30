/**
 * Tests for useDepositFlow hook - focusing on chain switching logic
 */

import { renderHook, waitFor } from "@testing-library/react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DepositFlowStep } from "../depositFlowSteps/types";
import { useDepositFlow } from "../useDepositFlow";

// Mock config/contracts to avoid env var validation
vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0x1234567890123456789012345678901234567890",
    AAVE_ADAPTER: "0x1234567890123456789012345678901234567890",
  },
}));

vi.mock("@/config", () => ({
  FeatureFlags: {
    isDepositDisabled: false,
    isBorrowDisabled: false,
    isSimplifiedTermsEnabled: false,
  },
}));

// Mock ts-sdk tbv/core to avoid ecc library initialization
vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  ensureHexPrefix: (hex: string) => (hex.startsWith("0x") ? hex : `0x${hex}`),
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

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
}));
vi.mock("@/infrastructure", () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
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
  "@/clients/eth-contract/btc-vault-registry/abis/BTCVaultRegistry.abi.json",
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
    fundedPrePeginTxHex: "0xmockhex",
    peginTxHex: "0xmockpegintx",
    peginInputSignature: "cc".repeat(64),
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
  }),
}));

vi.mock("@/context/deposit/DepositState", () => ({
  useDepositState: vi.fn(() => ({
    selectedApplication: "0xAaveAdapter123",
  })),
}));

vi.mock("@/utils/btc", () => ({
  processPublicKeyToXOnly: vi.fn((key) => key),
  stripHexPrefix: vi.fn((hex) => hex.replace("0x", "")),
}));

// Mock vault services for steps 3-4
vi.mock("@/services/vault", () => ({
  broadcastPrePeginTransaction: vi.fn().mockResolvedValue("0xbroadcasttxid"),
  fetchVaultById: vi.fn().mockResolvedValue({
    depositorSignedPeginTx: "0xmockunsignedtx",
    unsignedPrePeginTx: "0xmockprepeginTx",
    status: 1,
  }),
  collectReservedUtxoRefs: vi.fn().mockReturnValue([]),
  selectUtxosForDeposit: vi.fn(({ availableUtxos }) => availableUtxos),
}));

// Mock payout signature service to avoid SDK imports triggering initEccLib
vi.mock("@/services/vault/vaultPayoutSignatureService", () => ({
  prepareTransactionsForSigning: vi.fn().mockReturnValue([
    {
      claimerPubkeyXOnly: "0xmockclaimer",
      payoutTxHex: "0xmockpayout",
      assertTxHex: "0xmockassert",
    },
  ]),
  getSortedVaultKeeperPubkeys: vi.fn((keepers) =>
    keepers.map((k: { btcPubKey: string }) => k.btcPubKey),
  ),
  getSortedUniversalChallengerPubkeys: vi.fn((challengers) =>
    challengers.map((c: { btcPubKey: string }) => c.btcPubKey),
  ),
  signPayoutTransactions: vi.fn().mockResolvedValue({
    "0xmockclaimer": { payout_signature: "0xmocksignature2" },
  }),
  submitSignaturesToVaultProvider: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn().mockReturnValue("signet"),
}));

// Mock depositor graph signing service to avoid SDK imports triggering initEccLib
vi.mock("@/services/vault/depositorGraphSigningService", () => ({
  signDepositorGraph: vi.fn().mockResolvedValue({
    payout_signatures: { payout_signature: "mock_payout_sig" },
    per_challenger: {},
  }),
}));

vi.mock("@/services/vault/vaultActivationService", () => ({
  activateVaultWithSecret: vi
    .fn()
    .mockResolvedValue({ hash: "0xActivationTxHash" }),
}));

// Mock protocol params query to avoid ETH client initialization
vi.mock("@/clients/eth-contract/protocol-params/query", () => ({
  getLatestOffchainParams: vi.fn().mockResolvedValue({
    timelockAssert: 100,
    securityCouncilKeys: ["0xcouncil1"],
  }),
}));

// Mock Lamport service (deriveLamportPkHash returns a mock hash)
vi.mock("@/services/lamport/lamportService", () => ({
  deriveLamportPkHash: vi
    .fn()
    .mockResolvedValue(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    ),
}));

// Mock protocol params context
vi.mock("@/context/ProtocolParamsContext", () => ({
  useProtocolParamsContext: vi.fn(() => ({
    config: {
      minimumPegInAmount: 10000n,
      maxPegInAmount: 100_000_000n,
      pegInAckTimeout: 50400n,
      peginActivationTimeout: 100800n,
      timelockPegin: 100,
      offchainParams: {
        babeInstancesToFinalize: 2,
        councilQuorum: 1,
        securityCouncilKeys: ["0xcouncil1"],
        feeRate: 10n,
      },
    },
    minDeposit: 10000n,
    maxDeposit: 100_000_000n,
    timelockPegin: 100,
    latestUniversalChallengers: [
      { id: "0xUC1", btcPubKey: "0xUniversalChallengerKey1" },
    ],
    getOffchainParamsByVersion: vi.fn(() => ({
      timelockAssert: 100n,
      securityCouncilKeys: ["0xcouncil1"],
    })),
  })),
}));

// Mock VP proxy URL builder
vi.mock("@/utils/rpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/rpc")>()),
  getVpProxyUrl: (address: string) => `https://proxy.test/rpc/${address}`,
}));

// Mock vault provider RPC
vi.mock("@/clients/vault-provider-rpc", () => {
  return {
    VaultProviderRpcApi: class MockVaultProviderRpcApi {
      requestDepositorPresignTransactions = vi.fn().mockResolvedValue({
        txs: [
          {
            claimer_pubkey: "0xclaimerpubkey",
            claim_tx: { tx_hex: "0xclaimtx" },
            assert_tx: { tx_hex: "0xasserttx" },
            payout_tx: { tx_hex: "0xpayouttx" },
          },
        ],
        depositor_graph: {
          claim_tx: { tx_hex: "0xdepclaim" },
          assert_tx: { tx_hex: "0xdepassert" },
          payout_tx: { tx_hex: "0xdeppayout" },
          challenger_presign_data: [],
          payout_psbt: "bW9ja19wYXlvdXRfcHNidA==",
          offchain_params_version: 0,
        },
      });
      getPeginStatus = vi.fn().mockResolvedValue({
        pegin_txid: "test",
        status: "PendingDepositorSignatures",
        progress: {},
        health_info: "",
      });
      submitDepositorLamportKey = vi.fn().mockResolvedValue(undefined);
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
    mempoolFeeRate: 20, // Mempool fee rate in sat/vB
    btcWalletProvider: mockBtcWalletProvider,
    depositorEthAddress: "0xEthAddress123" as Address,
    selectedApplication: "0xcb3843752798493344c254d8d88640621e202395", // Aave adapter address
    selectedProviders: ["0xProvider123" as Address],
    vaultProviderBtcPubkey: "0xVaultProviderKey",
    vaultKeeperBtcPubkeys: ["0xVaultKeeperKey1"],
    universalChallengerBtcPubkeys: ["0xUniversalChallengerKey1"],
    modalOpen: true,
    getMnemonic: async () => "test mnemonic phrase for lamport key derivation",
    htlcSecretHex: "ab".repeat(32),
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

      // Fire the flow without awaiting — it will block on artifact download
      result.current.executeDepositFlow();

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

      // Fire the flow without awaiting — it will block on artifact download
      result.current.executeDepositFlow();

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

    it("should log chain switch error via logger", async () => {
      const { switchChain } = await import("wagmi/actions");
      mockLoggerError.mockClear();

      const switchError = new Error("Network error during switch");
      vi.mocked(switchChain).mockRejectedValue(switchError);

      const { result } = renderHook(() => useDepositFlow(mockParams));

      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(mockLoggerError).toHaveBeenCalledWith(switchError, {
          data: { context: "Failed to switch chain" },
        });
      });
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

      // Fire the flow without awaiting — it will block on artifact download
      result.current.executeDepositFlow();

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

      // Fire the flow without awaiting — it will block on artifact download
      result.current.executeDepositFlow();

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

      expect(result.current.currentStep).toBe(DepositFlowStep.SIGN_POP);
      expect(result.current.processing).toBe(false);

      const flowPromise = result.current.executeDepositFlow();

      // Wait for the artifact download step and then continue past it
      await waitFor(() => {
        expect(result.current.currentStep).toBe(
          DepositFlowStep.ARTIFACT_DOWNLOAD,
        );
      });
      result.current.continueAfterArtifactDownload();

      const flowResult = await flowPromise;

      await waitFor(() => {
        expect(result.current.processing).toBe(false);
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

      // Resolve the chain switch — flow will block on artifact download
      resolveSwitch!({ id: 11155111 });

      // Wait for artifact download step and continue past it
      await waitFor(() => {
        expect(result.current.currentStep).toBe(
          DepositFlowStep.ARTIFACT_DOWNLOAD,
        );
      });
      result.current.continueAfterArtifactDownload();

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

  describe("Application Entry Point", () => {
    it("should pass selectedApplication as applicationEntryPoint to addPendingPegin", async () => {
      const { getWalletClient, switchChain } = await import("wagmi/actions");
      const { addPendingPegin } = await import("@/storage/peginStorage");

      // Mock wallet client and chain switch
      vi.mocked(getWalletClient).mockResolvedValue({
        account: { address: "0xEthAddress123" },
        chain: { id: 11155111 },
      } as any);
      vi.mocked(switchChain).mockResolvedValue({ id: 11155111 } as any);

      const { result } = renderHook(() => useDepositFlow(mockParams));

      // Fire flow — addPendingPegin is called before the artifact download step
      result.current.executeDepositFlow();

      // Verify addPendingPegin was called with applicationEntryPoint set to selectedApplication
      await waitFor(() => {
        expect(addPendingPegin).toHaveBeenCalledWith(
          "0xEthAddress123",
          expect.objectContaining({
            applicationEntryPoint: "0xcb3843752798493344c254d8d88640621e202395",
          }),
        );
      });
    });
  });
});
