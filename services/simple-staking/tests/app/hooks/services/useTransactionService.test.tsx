import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Transaction } from "bitcoinjs-lib";
import type { ReactNode } from "react";

import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { useNetworkFees } from "@/ui/common/hooks/client/api/useNetworkFees";
import { useBbnQuery } from "@/ui/common/hooks/client/rpc/queries/useBbnQuery";
import { DELEGATIONS_V2_KEY } from "@/ui/common/hooks/client/api/useDelegationsV2";
import { useStakingManagerService } from "@/ui/common/hooks/services/useStakingManagerService";
import {
  BtcStakingInputs,
  BtcStakingExpansionInputs,
  useTransactionService,
} from "@/ui/common/hooks/services/useTransactionService";
import { useAppState } from "@/ui/common/state";
import * as mempoolAPI from "@/ui/common/utils/mempool_api";

import { testingNetworks } from "../../../helper";

// Mock modules before importing anything
// Mock the module dependencies
jest.mock("@babylonlabs-io/btc-staking-ts", () => ({
  SigningStep: {
    STAKING_SLASHING: "staking-slashing",
    UNBONDING_SLASHING: "unbonding-slashing",
    PROOF_OF_POSSESSION: "proof-of-possession",
    CREATE_BTC_DELEGATION_MSG: "create-btc-delegation-msg",
  },
  BabylonBtcStakingManager: class MockManager {
    constructor() {}
  },
}));

// Mock all dependencies at the module level, so we avoid importing the actual files
jest.mock("@/ui/common/hooks/services/useStakingManagerService", () => ({
  useStakingManagerService: jest.fn(),
}));

jest.mock("@/ui/common/hooks/client/api/useNetworkFees", () => ({
  useNetworkFees: jest.fn(),
}));

jest.mock("@/ui/common/hooks/client/rpc/queries/useBbnQuery", () => ({
  useBbnQuery: jest.fn(),
}));

jest.mock("@/ui/common/context/wallet/BTCWalletProvider", () => ({
  useBTCWallet: jest.fn(),
}));

jest.mock("@/ui/common/context/wallet/CosmosWalletProvider", () => ({
  useCosmosWallet: jest.fn(),
}));

jest.mock("@/ui/common/state", () => ({
  useAppState: jest.fn(),
}));

jest.mock("@/ui/common/utils/mempool_api", () => ({
  getTxMerkleProof: jest.fn(),
  getTxInfo: jest.fn(),
}));

// Mock helper modules
jest.mock("../../../helper", () => ({
  testingNetworks: [
    {
      networkName: "mainnet",
      dataGenerator: {
        generateRandomKeyPair: jest.fn().mockReturnValue({
          noCoordPublicKey: "mock-no-coord-public-key",
          publicKey: "mock-public-key",
        }),
        generateRandomTxId: jest.fn().mockReturnValue("mock-tx-id"),
        generateRandomStakingTerm: jest.fn().mockReturnValue(1000),
        generateRandomUTXOs: jest.fn().mockReturnValue([
          {
            txid: "mock-utxo-txid-1",
            vout: 0,
            value: 1000000,
            scriptPubKey: "mock-script-pubkey",
          },
        ]),
      },
    },
  ],
}));

describe("useTransactionService", () => {
  // Setup test data
  const mockGenerator = testingNetworks[0].dataGenerator;
  const mockCovenantPair = mockGenerator.generateRandomKeyPair();
  const mockStakerPair = mockGenerator.generateRandomKeyPair();
  const mockStakingTerm = mockGenerator.generateRandomStakingTerm();
  const mockFeeRate = 5;

  // Mock staking inputs
  const mockStakingInputs: BtcStakingInputs = {
    finalityProviderPksNoCoordHex: [mockCovenantPair.noCoordPublicKey],
    stakingAmountSat: 1000000,
    stakingTimelock: mockStakingTerm,
  };

  // Mock a BabylonBtcStakingManager instance
  const mockBtcStakingManager = {
    preStakeRegistrationBabylonTransaction: jest.fn(),
    estimateBtcStakingFee: jest.fn(),
    postStakeRegistrationBabylonTransaction: jest.fn(),
    createSignedBtcStakingTransaction: jest.fn(),
    createSignedBtcUnbondingTransaction: jest.fn(),
    createSignedBtcWithdrawEarlyUnbondedTransaction: jest.fn(),
    createSignedBtcWithdrawStakingExpiredTransaction: jest.fn(),
    createSignedBtcWithdrawSlashingTransaction: jest.fn(),
    stakingExpansionRegistrationBabylonTransaction: jest.fn(),
    estimateBtcStakingExpansionFee: jest.fn(),
    createSignedBtcStakingExpansionTransaction: jest.fn(),
  };

  // Mock transaction and other values
  const mockTxId = mockGenerator.generateRandomTxId();
  const mockTransaction = { getId: () => mockTxId, toHex: () => "mock-tx-hex" };
  const mockStakerInfo = {
    address: "mock-btc-address",
    publicKeyNoCoordHex: mockStakerPair.noCoordPublicKey,
  };
  const mockAvailableUTXOs = mockGenerator.generateRandomUTXOs(
    2000000,
    3,
    "mock-script-pubkey",
  );
  const mockTipHeight = 800000;
  const mockBech32Address = "mock-bech32-address";
  const mockSignedBabylonTx = "mock-signed-babylon-tx";
  const mockPushTx = jest.fn();
  const mockRefetchUTXOs = jest.fn();
  const mockEventCallback = jest.fn();
  let mockRefetchBtcTip: jest.Mock;
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  beforeEach(() => {
    jest.clearAllMocks();

    queryClient = new QueryClient();
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    mockRefetchBtcTip = jest.fn().mockResolvedValue({ data: mockTipHeight });

    // Mock useStakingManagerService
    (useStakingManagerService as jest.Mock).mockReturnValue({
      createBtcStakingManager: jest.fn().mockReturnValue(mockBtcStakingManager),
      on: jest.fn((callback) => {
        mockEventCallback.mockImplementation(callback);
      }),
      off: jest.fn(),
    });

    // Mock useNetworkFees with the correct fee rates
    (useNetworkFees as jest.Mock).mockReturnValue({
      data: { fastestFee: 10, halfHourFee: 10, hourFee: 5, economyFee: 1 },
    });

    // Mock useBbnQuery
    (useBbnQuery as jest.Mock).mockReturnValue({
      btcTipQuery: { data: mockTipHeight, refetch: mockRefetchBtcTip },
    });

    // Mock useBTCWallet
    (useBTCWallet as jest.Mock).mockReturnValue({
      publicKeyNoCoord: mockStakerPair.noCoordPublicKey,
      address: mockStakerInfo.address,
      pushTx: mockPushTx,
    });

    // Mock useCosmosWallet
    (useCosmosWallet as jest.Mock).mockReturnValue({
      bech32Address: mockBech32Address,
    });

    // Mock useAppState
    (useAppState as jest.Mock).mockReturnValue({
      availableUTXOs: mockAvailableUTXOs,
      refetchUTXOs: mockRefetchUTXOs,
    });

    // Mock Transaction.fromHex
    jest.spyOn(Transaction, "fromHex").mockReturnValue(mockTransaction as any);

    // Mock mempool API functions with correct structure
    jest.spyOn(mempoolAPI, "getTxMerkleProof").mockResolvedValue({
      pos: 1,
      merkle: ["merkle-proof"],
      blockHeight: 790000,
    });
    jest.spyOn(mempoolAPI, "getTxInfo").mockResolvedValue({
      txid: mockTxId,
      version: 2,
      locktime: 0,
      vin: [],
      vout: [],
      size: 200,
      weight: 800,
      fee: 1000,
      status: {
        confirmed: true,
        blockHeight: 790000,
        blockHash: "mock-block-hash",
        blockTime: 1600000000,
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("createDelegationEoi", () => {
    it("should create a delegation EOI successfully", async () => {
      // Mock the response from the staking manager
      mockBtcStakingManager.preStakeRegistrationBabylonTransaction.mockResolvedValue(
        {
          stakingTx: mockTransaction,
          signedBabylonTx: mockSignedBabylonTx,
        },
      );

      const { result } = renderHook(() => useTransactionService(), { wrapper });

      // Call the function
      let eoi;
      await act(async () => {
        eoi = await result.current.createDelegationEoi(
          mockStakingInputs,
          mockFeeRate,
        );
      });

      // Check the results
      expect(
        mockBtcStakingManager.preStakeRegistrationBabylonTransaction,
      ).toHaveBeenCalledWith(
        mockStakerInfo,
        mockStakingInputs,
        mockTipHeight,
        mockAvailableUTXOs,
        mockFeeRate,
        mockBech32Address,
      );
      expect(eoi).toEqual({
        stakingTxHash: mockTxId,
        signedBabylonTx: mockSignedBabylonTx,
      });
    });

    it("calls refetchBtcTip before creating EOI", async () => {
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      await act(async () => {
        await result.current.createDelegationEoi(mockStakingInputs, mockFeeRate);
      });
      expect(mockRefetchBtcTip).toHaveBeenCalled();
    });

    it("should throw error when UTXOs not initialized", async () => {
      // Mock useAppState to return undefined UTXOs
      (useAppState as jest.Mock).mockReturnValue({
        availableUTXOs: undefined,
        refetchUTXOs: mockRefetchUTXOs,
      });

      const { result } = renderHook(() => useTransactionService(), { wrapper });

      // Call the function and expect it to throw
      await expect(
        result.current.createDelegationEoi(mockStakingInputs, mockFeeRate),
      ).rejects.toThrow("Available UTXOs not initialized");
    });
  });

  describe("estimateStakingFee", () => {
    it("should estimate staking fee correctly", () => {
      // Mock the response from the staking manager
      mockBtcStakingManager.estimateBtcStakingFee.mockReturnValue(5000);

      const { result } = renderHook(() => useTransactionService(), { wrapper });

      // Call the function
      const fee = result.current.estimateStakingFee(
        mockStakingInputs,
        mockFeeRate,
      );

      // Check the results
      expect(mockBtcStakingManager.estimateBtcStakingFee).toHaveBeenCalledWith(
        mockStakerInfo,
        mockTipHeight,
        mockStakingInputs,
        mockAvailableUTXOs,
        mockFeeRate,
      );
      expect(fee).toBe(5000);
    });

    it("throws when UTXOs not initialized", () => {
      (useAppState as jest.Mock).mockReturnValue({
        availableUTXOs: undefined,
        refetchUTXOs: jest.fn(),
      });
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      expect(() =>
        result.current.estimateStakingFee(mockStakingInputs, mockFeeRate),
      ).toThrow("Available UTXOs not initialized");
    });
  });

  describe("transitionPhase1Delegation", () => {
    it("should transition to phase 1 delegation correctly", async () => {
      // Mock the response from the staking manager
      mockBtcStakingManager.postStakeRegistrationBabylonTransaction.mockResolvedValue(
        {
          stakingTx: mockTransaction,
          signedBabylonTx: mockSignedBabylonTx,
        },
      );

      const { result } = renderHook(() => useTransactionService(), { wrapper });
      const mockStakingTxHex = "mock-staking-tx-hex";
      const mockStakingHeight = 790000;

      // Call the function
      let transition;
      await act(async () => {
        transition = await result.current.transitionPhase1Delegation(
          mockStakingTxHex,
          mockStakingHeight,
          mockStakingInputs,
        );
      });

      // Verify mempool API calls for inclusion proof
      expect(mempoolAPI.getTxMerkleProof).toHaveBeenCalledWith(mockTxId);
      expect(mempoolAPI.getTxInfo).toHaveBeenCalledWith(mockTxId);

      // Check the staking manager call
      expect(
        mockBtcStakingManager.postStakeRegistrationBabylonTransaction,
      ).toHaveBeenCalledWith(
        mockStakerInfo,
        mockTransaction,
        mockStakingHeight,
        mockStakingInputs,
        {
          pos: 1,
          merkle: ["merkle-proof"],
          blockHashHex: "mock-block-hash",
        },
        mockBech32Address,
      );

      // Check the results
      expect(transition).toEqual({
        stakingTxHash: mockTxId,
        signedBabylonTx: mockSignedBabylonTx,
      });
    });

    it("calls refetchBtcTip before transitioning", async () => {
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      await act(async () => {
        await result.current.transitionPhase1Delegation(
          "hex",
          123,
          mockStakingInputs,
        );
      });
      expect(mockRefetchBtcTip).toHaveBeenCalled();
    });

    it("propagates inclusion-proof errors", async () => {
      jest
        .spyOn(mempoolAPI, "getTxMerkleProof")
        .mockRejectedValueOnce(new Error("boom"));
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      await expect(
        result.current.transitionPhase1Delegation("hex", 123, mockStakingInputs),
      ).rejects.toThrow("boom");
    });
  });

  describe("submitStakingTx", () => {
    it("should submit staking transaction successfully when hash matches", async () => {
      // Mock the response from the staking manager
      mockBtcStakingManager.createSignedBtcStakingTransaction.mockResolvedValue(
        mockTransaction,
      );

      const { result } = renderHook(() => useTransactionService(), { wrapper });
      const mockParamVersion = 1;
      const mockUnSignedStakingTxHex = "mock-unsigned-staking-tx-hex";

      // Call the function
      await act(async () => {
        await result.current.submitStakingTx(
          mockStakingInputs,
          mockParamVersion,
          mockTxId,
          mockUnSignedStakingTxHex,
        );
      });

      // Check the staking manager call
      expect(
        mockBtcStakingManager.createSignedBtcStakingTransaction,
      ).toHaveBeenCalledWith(
        mockStakerInfo,
        mockStakingInputs,
        mockTransaction,
        mockAvailableUTXOs,
        mockParamVersion,
      );

      // Verify transaction was pushed and UTXOs were refreshed
      expect(mockPushTx).toHaveBeenCalledWith("mock-tx-hex");
      expect(mockRefetchUTXOs).toHaveBeenCalled();
    });

    it("should throw error when transaction hash does not match expected", async () => {
      // Mock the response with a different hash
      const differentTxId = "different-tx-id";
      const differentTx = {
        getId: () => differentTxId,
        toHex: () => "different-tx-hex",
      };
      mockBtcStakingManager.createSignedBtcStakingTransaction.mockResolvedValue(
        differentTx,
      );

      const { result } = renderHook(() => useTransactionService(), { wrapper });
      const mockParamVersion = 1;
      const mockUnSignedStakingTxHex = "mock-unsigned-staking-tx-hex";

      // Call the function and expect it to throw
      await expect(
        result.current.submitStakingTx(
          mockStakingInputs,
          mockParamVersion,
          mockTxId,
          mockUnSignedStakingTxHex,
        ),
      ).rejects.toThrow(
        `Staking transaction hash mismatch, expected ${mockTxId} but got ${differentTxId}`,
      );

      // Verify no transaction was pushed and UTXOs were not refreshed
      expect(mockPushTx).not.toHaveBeenCalled();
      expect(mockRefetchUTXOs).not.toHaveBeenCalled();
    });

    it("invalidates delegations after success", async () => {
      (mockBtcStakingManager.createSignedBtcStakingTransaction as jest.Mock).mockResolvedValue(
        mockTransaction,
      );
      const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      await act(async () => {
        await result.current.submitStakingTx(
          mockStakingInputs,
          1,
          mockTxId,
          "hex",
        );
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [DELEGATIONS_V2_KEY] });
    });

    it("throws and does not invalidate when pushTx fails", async () => {
      (mockBtcStakingManager.createSignedBtcStakingTransaction as jest.Mock).mockResolvedValue(
        mockTransaction,
      );
      const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
      mockPushTx.mockRejectedValueOnce(new Error("broadcast failed"));
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      await expect(
        result.current.submitStakingTx(mockStakingInputs, 1, mockTxId, "hex"),
      ).rejects.toThrow("broadcast failed");
      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(mockRefetchUTXOs).not.toHaveBeenCalled();
    });

    it("throws when UTXOs not initialized", async () => {
      (useAppState as jest.Mock).mockReturnValue({
        availableUTXOs: undefined,
        refetchUTXOs: jest.fn(),
      });
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      await expect(
        result.current.submitStakingTx(mockStakingInputs, 1, mockTxId, "hex"),
      ).rejects.toThrow("Available UTXOs not initialized");
    });
  });

  describe("expansion flows", () => {
    const baseExpansion: BtcStakingExpansionInputs = {
      finalityProviderPksNoCoordHex: ["hex"],
      stakingAmountSat: 1000,
      stakingTimelock: 100,
      previousStakingTxHex: "prev-hex",
      previousStakingParamsVersion: 1,
      previousStakingInput: {
        finalityProviderPksNoCoordHex: ["hex"],
        stakingAmountSat: 1000,
        stakingTimelock: 100,
      },
    };

    it("createStakingExpansionEoi works and calls refetchBtcTip", async () => {
      (mockBtcStakingManager.stakingExpansionRegistrationBabylonTransaction as jest.Mock).mockResolvedValue(
        { stakingTx: mockTransaction, signedBabylonTx: mockSignedBabylonTx },
      );
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      await act(async () => {
        await result.current.createStakingExpansionEoi(baseExpansion, 5);
      });
      expect(mockRefetchBtcTip).toHaveBeenCalled();
      expect(
        mockBtcStakingManager.stakingExpansionRegistrationBabylonTransaction,
      ).toHaveBeenCalled();
    });

    it("estimateStakingExpansionFee returns value", () => {
      (mockBtcStakingManager.estimateBtcStakingExpansionFee as jest.Mock).mockReturnValue(777);
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      const fee = result.current.estimateStakingExpansionFee(baseExpansion, 5);
      expect(fee).toBe(777);
    });

    it("submitStakingExpansionTx refetches UTXOs", async () => {
      (mockBtcStakingManager.createSignedBtcStakingExpansionTransaction as jest.Mock).mockResolvedValue(
        mockTransaction,
      );
      const refetchSpy = jest.fn();
      (useAppState as jest.Mock).mockReturnValue({
        availableUTXOs: mockAvailableUTXOs,
        refetchUTXOs: refetchSpy,
      });
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      await act(async () => {
        await result.current.submitStakingExpansionTx(
          baseExpansion,
          1,
          mockTxId,
          "hex",
          [{ btcPkHex: "pk", sigHex: "sig" }],
        );
      });
      expect(refetchSpy).toHaveBeenCalled();
    });

    it("createStakingExpansionEoi throws when UTXOs loading", async () => {
      (useAppState as jest.Mock).mockReturnValue({
        availableUTXOs: mockAvailableUTXOs,
        refetchUTXOs: jest.fn(),
        isLoading: true,
      });
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      await expect(
        result.current.createStakingExpansionEoi(baseExpansion, 5),
      ).rejects.toThrow("Wallet UTXOs are still loading");
    });

    it("estimateStakingExpansionFee throws when UTXOs empty", () => {
      (useAppState as jest.Mock).mockReturnValue({
        availableUTXOs: [],
        refetchUTXOs: jest.fn(),
      });
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      expect(() =>
        result.current.estimateStakingExpansionFee(baseExpansion, 5),
      ).toThrow("No available UTXOs found");
    });
  });

  describe("tipHeight", () => {
    it("exposes tipHeight from btcTipQuery", () => {
      const { result } = renderHook(() => useTransactionService(), { wrapper });
      expect(result.current.tipHeight).toBe(mockTipHeight);
    });
  });

  describe("submitUnbondingTx", () => {
    it("should submit unbonding transaction successfully", async () => {
      // Mock the response from the staking manager
      mockBtcStakingManager.createSignedBtcUnbondingTransaction.mockResolvedValue(
        {
          transaction: mockTransaction,
        },
      );

      const { result } = renderHook(() => useTransactionService(), { wrapper });
      const mockParamVersion = 1;
      const mockStakingTxHex = "mock-staking-tx-hex";
      const mockUnbondingTxHex = "mock-unbonding-tx-hex";
      const mockCovenantSignatures = [
        { btcPkHex: "mock-btc-pk-hex", sigHex: "mock-sig-hex" },
      ];

      // Call the function
      await act(async () => {
        await result.current.submitUnbondingTx(
          mockStakingInputs,
          mockParamVersion,
          mockStakingTxHex,
          mockUnbondingTxHex,
          mockCovenantSignatures,
        );
      });

      // Check the staking manager call
      expect(
        mockBtcStakingManager.createSignedBtcUnbondingTransaction,
      ).toHaveBeenCalledWith(
        mockStakerInfo,
        mockStakingInputs,
        mockParamVersion,
        mockTransaction,
        mockTransaction,
        mockCovenantSignatures,
      );

      // Verify transaction was pushed
      expect(mockPushTx).toHaveBeenCalledWith("mock-tx-hex");
    });
  });

  describe("submitEarlyUnbondedWithdrawalTx", () => {
    it("should submit early unbonded withdrawal transaction successfully", async () => {
      // Mock the response from the staking manager
      mockBtcStakingManager.createSignedBtcWithdrawEarlyUnbondedTransaction.mockResolvedValue(
        {
          transaction: mockTransaction,
        },
      );

      const { result } = renderHook(() => useTransactionService(), { wrapper });
      const mockParamVersion = 1;
      const mockEarlyUnbondingTxHex = "mock-early-unbonding-tx-hex";

      // Call the function
      await act(async () => {
        await result.current.submitEarlyUnbondedWithdrawalTx(
          mockStakingInputs,
          mockParamVersion,
          mockEarlyUnbondingTxHex,
        );
      });

      // Check the staking manager call
      expect(
        mockBtcStakingManager.createSignedBtcWithdrawEarlyUnbondedTransaction,
      ).toHaveBeenCalledWith(
        mockStakerInfo,
        mockStakingInputs,
        mockParamVersion,
        mockTransaction,
        10, // Updated from 5 to match the mock half hour fee
      );

      // Verify transaction was pushed
      expect(mockPushTx).toHaveBeenCalledWith("mock-tx-hex");
    });
  });

  describe("submitTimelockUnbondedWithdrawalTx", () => {
    it("should submit timelock unbonded withdrawal transaction successfully", async () => {
      // Mock the response from the staking manager
      mockBtcStakingManager.createSignedBtcWithdrawStakingExpiredTransaction.mockResolvedValue(
        {
          transaction: mockTransaction,
        },
      );

      const { result } = renderHook(() => useTransactionService(), { wrapper });
      const mockParamVersion = 1;
      const mockStakingTxHex = "mock-staking-tx-hex";

      // Call the function
      await act(async () => {
        await result.current.submitTimelockUnbondedWithdrawalTx(
          mockStakingInputs,
          mockParamVersion,
          mockStakingTxHex,
        );
      });

      // Check the staking manager call
      expect(
        mockBtcStakingManager.createSignedBtcWithdrawStakingExpiredTransaction,
      ).toHaveBeenCalledWith(
        mockStakerInfo,
        mockStakingInputs,
        mockParamVersion,
        mockTransaction,
        10, // Updated from 5 to match the mock half hour fee
      );

      // Verify transaction was pushed
      expect(mockPushTx).toHaveBeenCalledWith("mock-tx-hex");
    });
  });

  describe("submitSlashingWithdrawalTx", () => {
    it("should submit slashing withdrawal transaction successfully", async () => {
      // Mock the response from the staking manager
      mockBtcStakingManager.createSignedBtcWithdrawSlashingTransaction.mockResolvedValue(
        {
          transaction: mockTransaction,
        },
      );

      const { result } = renderHook(() => useTransactionService(), { wrapper });
      const mockParamVersion = 1;
      const mockSlashingTxHex = "mock-slashing-tx-hex";

      // Call the function
      await act(async () => {
        await result.current.submitSlashingWithdrawalTx(
          mockStakingInputs,
          mockParamVersion,
          mockSlashingTxHex,
        );
      });

      // Check the staking manager call
      expect(
        mockBtcStakingManager.createSignedBtcWithdrawSlashingTransaction,
      ).toHaveBeenCalledWith(
        mockStakerInfo,
        mockStakingInputs,
        mockParamVersion,
        mockTransaction,
        10, // Updated from 5 to match the mock half hour fee
      );

      // Verify transaction was pushed
      expect(mockPushTx).toHaveBeenCalledWith("mock-tx-hex");
    });
  });

  describe("error handling", () => {
    it("should throw error when staking manager is not initialized", () => {
      // Return null for the staking manager
      (useStakingManagerService as jest.Mock).mockReturnValue({
        createBtcStakingManager: jest.fn().mockReturnValue(null),
        on: jest.fn(),
        off: jest.fn(),
      });

      const { result } = renderHook(() => useTransactionService(), { wrapper });

      // Call any function that uses validateCommonInputs
      expect(() => {
        result.current.estimateStakingFee(mockStakingInputs, mockFeeRate);
      }).toThrow("BTC Staking Manager not initialized");
    });

    it("should throw error when tip height is 0", () => {
      // Mock useBbnQuery to return 0 height
      (useBbnQuery as jest.Mock).mockReturnValue({
        btcTipQuery: { data: 0, refetch: jest.fn() },
      });

      const { result } = renderHook(() => useTransactionService(), { wrapper });

      // Call any function that uses validateCommonInputs
      expect(() => {
        result.current.estimateStakingFee(mockStakingInputs, mockFeeRate);
      }).toThrow("Tip height not initialized");
    });

    it("should throw error when staker info is incomplete", () => {
      // Mock useBTCWallet to return incomplete staker info
      (useBTCWallet as jest.Mock).mockReturnValue({
        publicKeyNoCoord: "", // Empty public key
        address: mockStakerInfo.address,
        pushTx: mockPushTx,
      });

      const { result } = renderHook(() => useTransactionService(), { wrapper });

      // Call any function that uses validateCommonInputs
      expect(() => {
        result.current.estimateStakingFee(mockStakingInputs, mockFeeRate);
      }).toThrow("Staker info not initialized");
    });
  });
});
