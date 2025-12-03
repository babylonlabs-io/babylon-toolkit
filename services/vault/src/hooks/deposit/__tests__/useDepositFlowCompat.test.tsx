/**
 * Tests for useDepositFlowCompat hook - focusing on chain switching logic
 */

import { renderHook, waitFor } from "@testing-library/react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDepositFlow } from "../useDepositFlowCompat";

// Mock config/contracts to avoid env var validation
vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULTS_MANAGER: "0x1234567890123456789012345678901234567890",
    MORPHO_CONTROLLER: "0x1234567890123456789012345678901234567890",
    BTC_VAULT: "0x1234567890123456789012345678901234567890",
    MORPHO: "0x1234567890123456789012345678901234567890",
  },
}));

// Mock dependencies
vi.mock("@babylonlabs-io/config", () => ({
  getETHChain: vi.fn(() => ({
    id: 11155111, // Sepolia
    name: "Sepolia",
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

vi.mock("@/hooks/useUTXOs", () => ({
  useUTXOs: vi.fn(() => ({
    confirmedUTXOs: [
      { txid: "0x123", vout: 0, value: 500000, scriptPubKey: "0xabc" },
      { txid: "0x456", vout: 1, value: 300000, scriptPubKey: "0xdef" },
    ],
    isLoading: false,
    error: null,
  })),
}));

vi.mock("@/services/deposit", () => ({
  depositService: {
    validateDepositAmount: vi.fn(() => ({ valid: true })),
    calculateDepositFees: vi.fn(() => ({
      btcNetworkFee: 1000n,
      protocolFee: 500n,
    })),
    formatSatoshisToBtc: vi.fn((amount: bigint) => {
      const btc = Number(amount) / 100_000_000;
      return btc.toString();
    }),
  },
}));

vi.mock("@/services/vault/vaultProofOfPossessionService", () => ({
  createProofOfPossession: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/services/vault/vaultTransactionService", () => ({
  submitPeginRequest: vi.fn().mockResolvedValue({
    btcTxid: "mocktxid123",
    transactionHash: "0xmockhash456",
    btcTxHex: "0xmockhex",
    selectedUTXOs: [
      { txid: "0x123", vout: 0, value: 500000, scriptPubKey: "0xabc" },
    ],
    fee: 1000n,
  }),
}));

vi.mock("@/storage/peginStorage", () => ({
  addPendingPegin: vi.fn(),
}));

vi.mock("@/context/deposit/DepositState", () => ({
  useDepositState: vi.fn(() => ({
    selectedApplication: "0xMorphoController123",
  })),
}));

vi.mock("@/utils/btc", () => ({
  processPublicKeyToXOnly: vi.fn((key) => key),
}));

describe("useDepositFlowCompat - Chain Switching", () => {
  const mockBtcWalletProvider = {
    signMessage: vi.fn().mockResolvedValue("mocksignature"),
    getPublicKeyHex: vi.fn().mockResolvedValue("0xmockpubkey"),
  };

  const mockParams = {
    amount: 500000n,
    btcWalletProvider: mockBtcWalletProvider,
    depositorEthAddress: "0xEthAddress123" as Address,
    selectedProviders: ["0xProvider123" as Address],
    vaultProviderBtcPubkey: "0xVaultProviderKey",
    liquidatorBtcPubkeys: ["0xLiquidatorKey1"],
    modalOpen: true,
    onSuccess: vi.fn(),
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

      await result.current.executeDepositFlow();

      await waitFor(() => {
        expect(result.current.processing).toBe(false);
        expect(mockParams.onSuccess).toHaveBeenCalled();
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
});
