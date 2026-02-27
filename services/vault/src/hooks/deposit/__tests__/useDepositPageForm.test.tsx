import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock env before importing modules that use it
vi.mock("@/config/env", () => ({
  ENV: {
    BTC_VAULTS_MANAGER: "0x1234567890123456789012345678901234567890",
    AAVE_CONTROLLER: "0x1234567890123456789012345678901234567890",
    GRAPHQL_ENDPOINT: "https://test.example.com/graphql",
  },
}));

// Mock babylon-config to avoid env var requirements
vi.mock("@babylonlabs-io/config", () => ({
  getNetworkConfigETH: vi.fn(() => ({
    chainId: 11155111,
    name: "sepolia",
  })),
  getNetworkConfigBTC: vi.fn(() => ({
    network: "signet",
    mempoolApiUrl: "https://mempool.space/signet/api",
  })),
  getETHChain: vi.fn(() => ({
    id: 11155111,
    name: "Sepolia",
  })),
}));

// Mock eth-contract client to avoid viem initialization
vi.mock("@/clients/eth-contract", () => ({
  ethClient: {
    readContract: vi.fn(),
    getTransactionReceipt: vi.fn(),
  },
  BTCVaultsManagerQuery: {
    getPeginRequest: vi.fn(),
  },
}));

import { useApplications } from "../../useApplications";
import { useDepositPageForm } from "../useDepositPageForm";
import { useEstimatedBtcFee } from "../useEstimatedBtcFee";

vi.mock("../../../context/wallet", () => ({
  useBTCWallet: vi.fn(() => ({
    address: "bc1qtest123",
    connected: true,
  })),
  useETHWallet: vi.fn(() => ({
    connected: true,
  })),
  useConnection: vi.fn(() => ({
    isConnected: true,
    btcConnected: true,
    ethConnected: true,
  })),
}));

vi.mock("../../usePrices", () => ({
  usePrice: vi.fn(() => 95000.5),
  usePrices: vi.fn(() => ({
    prices: { BTC: 95000.5 },
    metadata: {},
    isLoading: false,
    error: null,
    hasStalePrices: false,
    hasPriceFetchError: false,
  })),
}));

vi.mock("../../useUTXOs", () => ({
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
  calculateBalance: vi.fn((utxos) => {
    return utxos.reduce(
      (sum: number, utxo: { value: number }) => sum + utxo.value,
      0,
    );
  }),
}));

vi.mock("../../useApplications", () => ({
  useApplications: vi.fn(() => ({
    data: [
      {
        id: "0xControllerAddress1",
        name: "App One",
        type: "Lending",
        logoUrl: "https://example.com/logo1.png",
        registeredAt: "2024-01-01T00:00:00Z",
        blockNumber: "1000000",
        transactionHash: "0xabc123",
        description: "Test app one",
        websiteUrl: "https://appone.com",
      },
      {
        id: "0xControllerAddress2",
        name: "App Two",
        type: "DEX",
        logoUrl: null,
        registeredAt: "2024-01-02T00:00:00Z",
        blockNumber: "1000001",
        transactionHash: "0xdef456",
        description: null,
        websiteUrl: null,
      },
    ],
    isLoading: false,
  })),
}));

vi.mock("../useVaultProviders", () => ({
  useVaultProviders: vi.fn(() => ({
    vaultProviders: [
      {
        id: "0x1234567890abcdef1234567890abcdef12345678",
        btcPubKey: "pubkey1",
      },
      {
        id: "0xabcdef1234567890abcdef1234567890abcdef12",
        btcPubKey: "pubkey2",
      },
    ],
    loading: false,
  })),
}));

vi.mock("../../../utils/formatting", () => ({
  formatProviderName: vi.fn((id: string) => `Provider ${id.slice(0, 6)}...`),
}));

vi.mock("../../../services/deposit", () => ({
  depositService: {
    parseBtcToSatoshis: vi.fn((btc: string) => {
      const num = parseFloat(btc);
      if (isNaN(num) || num <= 0) return 0n;
      return BigInt(Math.floor(num * 100000000));
    }),
    formatSatoshisToBtc: vi.fn((sats: bigint, decimals: number) => {
      return (Number(sats) / 100000000).toFixed(decimals);
    }),
    isDepositAmountValid: vi.fn(
      (params: {
        amountSats: bigint;
        minDeposit: bigint;
        btcBalance: bigint;
      }) => {
        const { amountSats, minDeposit, btcBalance } = params;
        if (amountSats <= 0n) return false;
        if (amountSats < minDeposit) return false;
        if (amountSats > btcBalance) return false;
        return true;
      },
    ),
  },
}));

const mockValidateAmount = vi.fn((amount: string) => {
  if (!amount || parseFloat(amount) <= 0) {
    return { valid: false, error: "Amount must be greater than zero" };
  }
  if (parseFloat(amount) < 0.0001) {
    return { valid: false, error: "Minimum deposit is 0.0001 BTC" };
  }
  return { valid: true };
});

const mockValidateProviders = vi.fn((providers: string[]) => {
  if (providers.length === 0) {
    return {
      valid: false,
      error: "Please select at least one vault provider",
    };
  }
  return { valid: true };
});

vi.mock("../useEstimatedBtcFee", () => ({
  useEstimatedBtcFee: vi.fn(() => ({
    fee: 1500n,
    feeRate: 5,
    isLoading: false,
    error: null,
    maxDeposit: 798500n,
  })),
}));

vi.mock("../useDepositValidation", () => ({
  useDepositValidation: vi.fn(() => ({
    validateAmount: mockValidateAmount,
    validateProviders: mockValidateProviders,
    minDeposit: 10000n,
    maxDeposit: 100_000_000n,
    availableProviders: [
      "0x1234567890abcdef1234567890abcdef12345678",
      "0xabcdef1234567890abcdef1234567890abcdef12",
    ],
  })),
}));

describe("useDepositPageForm", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
    // Reset to default applications data
    vi.mocked(useApplications).mockReturnValue({
      data: [
        {
          id: "0xControllerAddress1",
          name: "App One",
          type: "Lending",
          logoUrl: "https://example.com/logo1.png",
          registeredAt: "2024-01-01T00:00:00Z",
          blockNumber: "1000000",
          transactionHash: "0xabc123",
          description: "Test app one",
          websiteUrl: "https://appone.com",
        },
        {
          id: "0xControllerAddress2",
          name: "App Two",
          type: "DEX",
          logoUrl: null,
          registeredAt: "2024-01-02T00:00:00Z",
          blockNumber: "1000001",
          transactionHash: "0xdef456",
          description: null,
          websiteUrl: null,
        },
      ],
      isLoading: false,
      error: null,
      isError: false,
      isPending: false,
      isSuccess: true,
      status: "success",
      fetchStatus: "idle",
      isFetching: false,
      isRefetching: false,
      isPaused: false,
      refetch: vi.fn(),
      isLoadingError: false,
      isRefetchError: false,
      dataUpdatedAt: Date.now(),
      errorUpdatedAt: 0,
      failureCount: 0,
      failureReason: null,
      errorUpdateCount: 0,
      isFetched: true,
      isFetchedAfterMount: true,
      isInitialLoading: false,
      isPlaceholderData: false,
      isStale: false,
      promise: Promise.resolve([]),
    } as unknown as ReturnType<typeof useApplications>);
  });

  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  describe("initialization", () => {
    it("should initialize with empty form data", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.formData).toEqual({
        amountBtc: "",
        selectedApplication: "",
        selectedProvider: "",
      });
      expect(result.current.errors).toEqual({});
      expect(result.current.isValid).toBe(false);
    });

    it("should auto-select application when only one is available", async () => {
      // Mock useApplications to return only one application
      vi.mocked(useApplications).mockReturnValue({
        data: [
          {
            id: "0xControllerAddress1",
            name: "App One",
            type: "Lending",
            logoUrl: "https://example.com/logo1.png",
            registeredAt: "2024-01-01T00:00:00Z",
            blockNumber: "1000000",
            transactionHash: "0xabc123",
            description: "Test app one",
            websiteUrl: "https://appone.com",
          },
        ],
        isLoading: false,
        error: null,
        isError: false,
        isPending: false,
        isSuccess: true,
        status: "success",
        fetchStatus: "idle",
        isFetching: false,
        isRefetching: false,
        isPaused: false,
        refetch: vi.fn(),
        isLoadingError: false,
        isRefetchError: false,
        dataUpdatedAt: Date.now(),
        errorUpdatedAt: 0,
        failureCount: 0,
        failureReason: null,
        errorUpdateCount: 0,
        isFetched: true,
        isFetchedAfterMount: true,
        isInitialLoading: false,
        isPlaceholderData: false,
        isStale: false,
        promise: Promise.resolve([]),
      } as unknown as ReturnType<typeof useApplications>);

      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      // After effect runs, should auto-select the only available application
      await waitFor(() => {
        expect(result.current.formData.selectedApplication).toBe(
          "0xControllerAddress1",
        );
      });
    });

    it("should calculate BTC balance from UTXOs", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.btcBalance).toBe(800000n);
    });

    it("should format BTC balance correctly", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.btcBalanceFormatted).toBe(0.008);
    });

    it("should load applications", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.applications).toHaveLength(2);
      // Hook only exposes id, name, type, logoUrl from Application
      expect(result.current.applications[0]).toEqual({
        id: "0xControllerAddress1",
        name: "App One",
        type: "Lending",
        logoUrl: "https://example.com/logo1.png",
      });
      expect(result.current.applications[1]).toEqual({
        id: "0xControllerAddress2",
        name: "App Two",
        type: "DEX",
        logoUrl: null,
      });
    });

    it("should load providers", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers[0].id).toBe(
        "0x1234567890abcdef1234567890abcdef12345678",
      );
      expect(result.current.providers[0].btcPubkey).toBe("pubkey1");
    });

    it("should expose BTC price", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.btcPrice).toBe(95000.5);
    });

    it("should expose estimated fee values from useEstimatedBtcFee", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.estimatedFeeSats).toBe(1500n);
      expect(result.current.estimatedFeeRate).toBe(5);
      expect(result.current.isLoadingFee).toBe(false);
      expect(result.current.feeError).toBeNull();
      expect(result.current.maxDepositSats).toBe(798500n);
    });

    it("should propagate fee loading state", () => {
      vi.mocked(useEstimatedBtcFee).mockReturnValue({
        fee: null,
        feeRate: 0,
        isLoading: true,
        error: null,
        maxDeposit: null,
      });

      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.isLoadingFee).toBe(true);
      expect(result.current.estimatedFeeSats).toBeNull();
    });

    it("should propagate fee error state", () => {
      vi.mocked(useEstimatedBtcFee).mockReturnValue({
        fee: null,
        feeRate: 5,
        isLoading: false,
        error: "Insufficient funds: need 900000 sats, have 800000 sats",
        maxDeposit: 798500n,
      });

      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.feeError).toBe(
        "Insufficient funds: need 900000 sats, have 800000 sats",
      );
      expect(result.current.estimatedFeeSats).toBeNull();
      expect(result.current.estimatedFeeRate).toBe(5);
    });
  });

  describe("setFormData", () => {
    it("should update amount field", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({ amountBtc: "0.001" });
      });

      expect(result.current.formData.amountBtc).toBe("0.001");
    });

    it("should update application field", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          selectedApplication: "0xControllerAddress1",
        });
      });

      expect(result.current.formData.selectedApplication).toBe(
        "0xControllerAddress1",
      );
    });

    it("should update provider field", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          selectedProvider: "0x1234567890abcdef1234567890abcdef12345678",
        });
      });

      expect(result.current.formData.selectedProvider).toBe(
        "0x1234567890abcdef1234567890abcdef12345678",
      );
    });

    it("should update multiple fields at once", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          amountBtc: "0.002",
          selectedApplication: "0xControllerAddress2",
        });
      });

      expect(result.current.formData.amountBtc).toBe("0.002");
      expect(result.current.formData.selectedApplication).toBe(
        "0xControllerAddress2",
      );
    });

    it("should clear amount error when amount is updated", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.validateForm();
      });

      expect(result.current.errors.amount).toBeDefined();

      act(() => {
        result.current.setFormData({ amountBtc: "0.001" });
      });

      expect(result.current.errors.amount).toBeUndefined();
    });

    it("should clear application error when application is updated", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.validateForm();
      });

      expect(result.current.errors.application).toBeDefined();

      act(() => {
        result.current.setFormData({
          selectedApplication: "0xControllerAddress1",
        });
      });

      expect(result.current.errors.application).toBeUndefined();
    });

    it("should clear provider error when provider is updated", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.validateForm();
      });

      expect(result.current.errors.provider).toBeDefined();

      act(() => {
        result.current.setFormData({
          selectedProvider: "0x1234567890abcdef1234567890abcdef12345678",
        });
      });

      expect(result.current.errors.provider).toBeUndefined();
    });
  });

  describe("amountSats calculation", () => {
    it("should return 0 for empty amount", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.amountSats).toBe(0n);
    });

    it("should convert BTC to satoshis", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({ amountBtc: "0.001" });
      });

      expect(result.current.amountSats).toBe(100000n);
    });

    it("should handle decimal amounts", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({ amountBtc: "0.00012345" });
      });

      expect(result.current.amountSats).toBe(12345n);
    });
  });

  describe("validateForm", () => {
    it("should return false and set errors for empty form", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      let isValid: boolean = false;
      act(() => {
        isValid = result.current.validateForm();
      });

      expect(isValid).toBe(false);
      expect(result.current.errors.amount).toBe(
        "Amount must be greater than zero",
      );
      expect(result.current.errors.application).toBe(
        "Please select an application",
      );
      expect(result.current.errors.provider).toBe(
        "Please select a vault provider",
      );
    });

    it("should validate amount field", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          amountBtc: "0.00001",
          selectedApplication: "0xControllerAddress1",
          selectedProvider: "0x1234567890abcdef1234567890abcdef12345678",
        });
      });

      let isValid: boolean = false;
      act(() => {
        isValid = result.current.validateForm();
      });

      expect(isValid).toBe(false);
      expect(result.current.errors.amount).toBe(
        "Minimum deposit is 0.0001 BTC",
      );
    });

    it("should validate application field", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          amountBtc: "0.001",
          selectedProvider: "0x1234567890abcdef1234567890abcdef12345678",
        });
      });

      let isValid: boolean = false;
      act(() => {
        isValid = result.current.validateForm();
      });

      expect(isValid).toBe(false);
      expect(result.current.errors.application).toBe(
        "Please select an application",
      );
    });

    it("should validate provider field", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          amountBtc: "0.001",
          selectedApplication: "0xControllerAddress1",
        });
      });

      let isValid: boolean = false;
      act(() => {
        isValid = result.current.validateForm();
      });

      expect(isValid).toBe(false);
      expect(result.current.errors.provider).toBe(
        "Please select a vault provider",
      );
    });

    it("should return true for valid form", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          amountBtc: "0.001",
          selectedApplication: "0xControllerAddress1",
          selectedProvider: "0x1234567890abcdef1234567890abcdef12345678",
        });
      });

      let isValid: boolean = false;
      act(() => {
        isValid = result.current.validateForm();
      });

      expect(isValid).toBe(true);
      expect(result.current.errors).toEqual({});
    });

    it("should call validation functions with correct arguments", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          amountBtc: "0.001",
          selectedApplication: "0xControllerAddress1",
          selectedProvider: "0x1234567890abcdef1234567890abcdef12345678",
        });
      });

      act(() => {
        result.current.validateForm();
      });

      expect(mockValidateAmount).toHaveBeenCalledWith("0.001");
      expect(mockValidateProviders).toHaveBeenCalledWith([
        "0x1234567890abcdef1234567890abcdef12345678",
      ]);
    });
  });

  describe("isValid computed property", () => {
    it("should be false for empty form", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.isValid).toBe(false);
    });

    it("should be false if amount is missing", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          selectedApplication: "0xControllerAddress1",
          selectedProvider: "0x1234567890abcdef1234567890abcdef12345678",
        });
      });

      expect(result.current.isValid).toBe(false);
    });

    it("should be false if application is missing", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          amountBtc: "0.001",
          selectedProvider: "0x1234567890abcdef1234567890abcdef12345678",
        });
      });

      expect(result.current.isValid).toBe(false);
    });

    it("should be false if provider is missing", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          amountBtc: "0.001",
          selectedApplication: "0xControllerAddress1",
        });
      });

      expect(result.current.isValid).toBe(false);
    });

    it("should be false if there are validation errors", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          amountBtc: "0.001",
          selectedApplication: "0xControllerAddress1",
          selectedProvider: "0x1234567890abcdef1234567890abcdef12345678",
        });
      });

      act(() => {
        result.current.validateForm();
      });

      expect(result.current.isValid).toBe(true);

      act(() => {
        result.current.setFormData({ amountBtc: "" });
      });

      expect(result.current.isValid).toBe(false);
    });

    it("should be true when all fields are filled and no errors", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          amountBtc: "0.001",
          selectedApplication: "0xControllerAddress1",
          selectedProvider: "0x1234567890abcdef1234567890abcdef12345678",
        });
      });

      expect(result.current.isValid).toBe(true);
    });

    it("should be false when amount exceeds balance", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      // Balance is 800,000 sats (from mocked UTXOs: 500000 + 300000)
      // 1 BTC = 100,000,000 sats, so we set an amount higher than balance
      act(() => {
        result.current.setFormData({
          amountBtc: "0.01", // 1,000,000 sats - exceeds 800,000 balance
          selectedApplication: "app1",
          selectedProvider: "0x1234567890abcdef1234567890abcdef12345678",
        });
      });

      expect(result.current.isValid).toBe(false);
    });
  });

  describe("resetForm", () => {
    it("should reset form data to initial state", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.setFormData({
          amountBtc: "0.001",
          selectedApplication: "0xControllerAddress1",
          selectedProvider: "0x1234567890abcdef1234567890abcdef12345678",
        });
      });

      expect(result.current.formData.amountBtc).toBe("0.001");

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.formData).toEqual({
        amountBtc: "",
        selectedApplication: "",
        selectedProvider: "",
      });
    });

    it("should clear all errors", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      act(() => {
        result.current.validateForm();
      });

      expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);

      act(() => {
        result.current.resetForm();
      });

      expect(result.current.errors).toEqual({});
    });
  });

  describe("loading states", () => {
    it("should expose applications loading state", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.isLoadingApplications).toBe(false);
    });

    it("should expose providers loading state", () => {
      const { result } = renderHook(() => useDepositPageForm(), { wrapper });

      expect(result.current.isLoadingProviders).toBe(false);
    });
  });
});
