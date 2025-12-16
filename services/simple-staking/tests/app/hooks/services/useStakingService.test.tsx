// Mock SVG imports
jest.mock("@/ui/common/assets/warning-triangle.svg", () => "SVG-mock");

// Mock the Error Provider to avoid the SVG import issue
jest.mock("@/ui/common/context/Error/ErrorProvider", () => ({
  useError: jest.fn(),
}));

// Mock @uidotdev/usehooks to handle ESM module issue
jest.mock("@uidotdev/usehooks", () => ({
  useDebounce: jest.fn((value) => value),
}));

// Mock ESM dependency to prevent node_modules ESM parsing
jest.mock("@babylonlabs-io/btc-staking-ts", () => ({
  BabylonBtcStakingManager: jest.fn(() => ({})),
}));

import { act, renderHook } from "@testing-library/react";

import { getDelegationV2 } from "@/ui/common/api/getDelegationsV2";
import { useError } from "@/ui/common/context/Error/ErrorProvider";
import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { useBbnTransaction } from "@/ui/common/hooks/client/rpc/mutation/useBbnTransaction";
import { useStakingService } from "@/ui/common/hooks/services/useStakingService";
import { useTransactionService } from "@/ui/common/hooks/services/useTransactionService";
import { useDelegationV2State } from "@/ui/common/state/DelegationV2State";
import { StakingStep, useStakingState } from "@/ui/common/state/StakingState";
import {
  DelegationV2,
  DelegationV2StakingState,
} from "@/ui/common/types/delegationsV2";
import { retry } from "@/ui/common/utils";

// Mock all dependencies
jest.mock("@/ui/common/api/getDelegationsV2");
jest.mock("@/ui/common/context/Error/ErrorProvider");
jest.mock("@/ui/common/context/wallet/BTCWalletProvider");
jest.mock("@/ui/common/context/wallet/CosmosWalletProvider");
jest.mock("@/ui/common/hooks/services/useTransactionService");
jest.mock("@/ui/common/hooks/client/rpc/mutation/useBbnTransaction");
jest.mock("@/ui/common/state/DelegationV2State");
jest.mock("@/ui/common/state/StakingState");
jest.mock("@/ui/common/utils", () => ({
  retry: jest.fn(),
}));
jest.mock("nanoevents", () => ({
  createNanoEvents: jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn(),
  })),
}));

describe("useStakingService", () => {
  // Mock data
  const mockAmountSat = 120000000; // satoshi
  const mockFormData = {
    finalityProviders: ["mock-finality-provider"],
    amount: mockAmountSat, // satoshi
    term: 10000, // blocks
    feeRate: 5,
    feeAmount: 5000, // satoshi
  };
  const mockStakingTxHash = "mock-staking-tx-hash";
  const mockSignedBabylonTx = "mock-signed-babylon-tx";

  const mockDelegation: DelegationV2 = {
    stakingAmount: mockAmountSat,
    stakingTxHashHex: mockStakingTxHash,
    startHeight: 100,
    state: DelegationV2StakingState.VERIFIED,
    stakingTxHex: "mock-staking-tx-hex",
    paramsVersion: 1,
    finalityProviderBtcPksHex: ["mock-finality-provider"],
    stakerBtcPkHex: "mock-staker-btc-pk",
    stakingTimelock: 10000,
    bbnInceptionHeight: 100,
    bbnInceptionTime: new Date().toISOString(),
    endHeight: 200,
    unbondingTimelock: 1000,
    unbondingTxHex: "mock-unbonding-tx-hex",
    slashing: {
      stakingSlashingTxHex: "",
      unbondingSlashingTxHex: "",
      spendingHeight: 0,
    },
  };

  // Mock function implementations
  const mockSetFormData = jest.fn();
  const mockGoToStep = jest.fn();
  const mockSetProcessing = jest.fn();
  const mockSetVerifiedDelegation = jest.fn();
  const mockReset = jest.fn();
  const mockSendBbnTx = jest.fn();
  const mockRefetchDelegations = jest.fn();
  const mockAddDelegation = jest.fn();
  const mockUpdateDelegationStatus = jest.fn();
  const mockEstimateStakingFee = jest.fn().mockReturnValue(5000);
  const mockCreateDelegationEoi = jest.fn();
  const mockSubmitStakingTx = jest.fn();
  const mockSubscribeToSigningSteps = jest.fn();
  const mockHandleError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock useStakingState
    (useStakingState as jest.Mock).mockReturnValue({
      setFormData: mockSetFormData,
      goToStep: mockGoToStep,
      setProcessing: mockSetProcessing,
      setVerifiedDelegation: mockSetVerifiedDelegation,
      reset: mockReset,
    });

    // Mock useBbnTransaction
    (useBbnTransaction as jest.Mock).mockReturnValue({
      sendBbnTx: mockSendBbnTx,
    });

    // Mock useDelegationV2State
    (useDelegationV2State as jest.Mock).mockReturnValue({
      refetch: mockRefetchDelegations,
      addDelegation: mockAddDelegation,
      updateDelegationStatus: mockUpdateDelegationStatus,
    });

    // Mock useTransactionService
    (useTransactionService as jest.Mock).mockReturnValue({
      estimateStakingFee: mockEstimateStakingFee,
      createDelegationEoi: mockCreateDelegationEoi,
      submitStakingTx: mockSubmitStakingTx,
      subscribeToSigningSteps: mockSubscribeToSigningSteps,
    });

    // Mock useError
    (useError as jest.Mock).mockReturnValue({
      handleError: mockHandleError,
    });

    // Mock wallet hooks
    (useBTCWallet as jest.Mock).mockReturnValue({
      publicKeyNoCoord: "mock-public-key-no-coord",
      address: "mock-btc-address",
    });

    (useCosmosWallet as jest.Mock).mockReturnValue({
      bech32Address: "mock-bech32-address",
    });

    // Mock getDelegationV2 API call
    (getDelegationV2 as jest.Mock).mockResolvedValue(mockDelegation);

    // Mock retry utility
    (retry as jest.Mock).mockImplementation(async (fn) => {
      return fn();
    });

    // Setup success response for createDelegationEoi
    mockCreateDelegationEoi.mockResolvedValue({
      stakingTxHash: mockStakingTxHash,
      signedBabylonTx: mockSignedBabylonTx,
    });

    mockSendBbnTx.mockResolvedValue(undefined);
    mockSubmitStakingTx.mockResolvedValue(undefined);
  });

  describe("calculateFeeAmount", () => {
    it("should calculate fee amount correctly", () => {
      const { result } = renderHook(() => useStakingService());

      const fee = result.current.calculateFeeAmount({
        finalityProviders: mockFormData.finalityProviders,
        amount: 1.2, // BTC input for fee estimation
        term: mockFormData.term,
        feeRate: mockFormData.feeRate,
      });

      // Verify estimateStakingFee was called correctly
      expect(mockEstimateStakingFee).toHaveBeenCalledWith(
        {
          finalityProviderPksNoCoordHex: mockFormData.finalityProviders,
          stakingAmountSat: mockAmountSat,
          stakingTimelock: mockFormData.term,
          feeRate: mockFormData.feeRate,
        },
        mockFormData.feeRate,
      );

      expect(fee).toBe(5000);
    });

    it("should throw when fee estimation fails", () => {
      mockEstimateStakingFee.mockImplementation(() => {
        throw new Error("Test error");
      });

      const { result } = renderHook(() => useStakingService());

      expect(() => {
        result.current.calculateFeeAmount({
          finalityProviders: mockFormData.finalityProviders,
          amount: 1.2, // BTC input
          term: mockFormData.term,
          feeRate: mockFormData.feeRate,
        });
      }).toThrow("Test error");
    });
  });

  describe("displayPreview", () => {
    it("should set form data and go to preview step", () => {
      const { result } = renderHook(() => useStakingService());

      result.current.displayPreview(mockFormData);

      expect(mockSetFormData).toHaveBeenCalledWith(mockFormData);
      expect(mockGoToStep).toHaveBeenCalledWith(StakingStep.PREVIEW);
    });
  });

  describe("createEOI", () => {
    it("should handle successful EOI creation and delegation", async () => {
      const { result } = renderHook(() => useStakingService());

      await act(async () => {
        await result.current.createEOI(mockFormData);
      });

      // Verify correct steps are taken
      expect(mockSetProcessing).toHaveBeenCalledWith(true);

      expect(mockCreateDelegationEoi).toHaveBeenCalledWith(
        {
          finalityProviderPksNoCoordHex: mockFormData.finalityProviders,
          stakingAmountSat: mockAmountSat,
          stakingTimelock: mockFormData.term,
          feeRate: mockFormData.feeRate,
        },
        mockFormData.feeRate,
      );

      expect(mockGoToStep).toHaveBeenCalledWith(StakingStep.EOI_SEND_BBN);
      expect(mockSendBbnTx).toHaveBeenCalledWith(mockSignedBabylonTx);

      expect(mockAddDelegation).toHaveBeenCalledWith({
        stakingAmount: mockFormData.amount,
        stakingTxHashHex: mockStakingTxHash,
        startHeight: 0,
        state: DelegationV2StakingState.INTERMEDIATE_PENDING_VERIFICATION,
      });

      expect(mockGoToStep).toHaveBeenCalledWith(StakingStep.VERIFYING);

      expect(getDelegationV2).toHaveBeenCalledWith(mockStakingTxHash);
      expect(mockSetVerifiedDelegation).toHaveBeenCalledWith(mockDelegation);
      expect(mockRefetchDelegations).toHaveBeenCalled();
      expect(mockGoToStep).toHaveBeenCalledWith(StakingStep.VERIFIED);
      const [, predicate] = (retry as jest.Mock).mock.calls[0];
      const pendingDelegation = {
        state: DelegationV2StakingState.INTERMEDIATE_PENDING_VERIFICATION,
      } as DelegationV2;

      expect(typeof predicate).toBe("function");
      expect(predicate(mockDelegation)).toBe(true);
      expect(predicate(pendingDelegation)).toBe(false);

      expect(mockSetProcessing).toHaveBeenNthCalledWith(1, true);
      expect(mockSetProcessing).toHaveBeenLastCalledWith(false);
      expect(mockSetProcessing).toHaveBeenCalledTimes(2);
    });

    it("should handle errors during EOI creation", async () => {
      // Setup error response for createDelegationEoi
      const mockError = new Error("Failed to create EOI");
      mockCreateDelegationEoi.mockRejectedValue(mockError);

      const { result } = renderHook(() => useStakingService());

      await act(async () => {
        await result.current.createEOI(mockFormData);
      });

      expect(mockSetProcessing).toHaveBeenCalledWith(true);
      expect(mockHandleError).toHaveBeenCalledWith({
        error: mockError,
        metadata: {
          userPublicKey: "mock-public-key-no-coord",
          btcAddress: "mock-btc-address",
          babylonAddress: "mock-bech32-address",
        },
      });
      expect(mockReset).toHaveBeenCalled();
      expect(mockSetProcessing).toHaveBeenNthCalledWith(1, true);
      expect(mockSetProcessing).toHaveBeenLastCalledWith(false);
      expect(mockGoToStep).not.toHaveBeenCalledWith(StakingStep.VERIFYING);
    });

    it("should handle failures when sending the Babylon transaction", async () => {
      const mockError = new Error("Failed to send BBN transaction");
      mockSendBbnTx.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useStakingService());

      await act(async () => {
        await result.current.createEOI(mockFormData);
      });

      expect(mockSetProcessing).toHaveBeenNthCalledWith(1, true);
      expect(mockSetProcessing).toHaveBeenLastCalledWith(false);
      expect(mockCreateDelegationEoi).toHaveBeenCalled();
      expect(mockSendBbnTx).toHaveBeenCalledWith(mockSignedBabylonTx);
      expect(mockHandleError).toHaveBeenCalledWith({
        error: mockError,
        metadata: {
          userPublicKey: "mock-public-key-no-coord",
          btcAddress: "mock-btc-address",
          babylonAddress: "mock-bech32-address",
        },
      });
      expect(mockReset).toHaveBeenCalled();
      expect(retry).not.toHaveBeenCalled();
      expect(getDelegationV2).not.toHaveBeenCalled();
      expect(mockRefetchDelegations).not.toHaveBeenCalled();
      expect(mockGoToStep).not.toHaveBeenCalledWith(StakingStep.VERIFIED);
    });
  });

  describe("stakeDelegation", () => {
    it("should handle successful delegation staking", async () => {
      const { result } = renderHook(() => useStakingService());

      await act(async () => {
        await result.current.stakeDelegation(mockDelegation);
      });

      expect(mockSetProcessing).toHaveBeenCalledWith(true);

      expect(mockSubmitStakingTx).toHaveBeenCalledWith(
        {
          finalityProviderPksNoCoordHex:
            mockDelegation.finalityProviderBtcPksHex,
          stakingAmountSat: mockDelegation.stakingAmount,
          stakingTimelock: mockDelegation.stakingTimelock,
        },
        mockDelegation.paramsVersion,
        mockDelegation.stakingTxHashHex,
        mockDelegation.stakingTxHex,
      );

      expect(mockUpdateDelegationStatus).toHaveBeenCalledWith(
        mockDelegation.stakingTxHashHex,
        DelegationV2StakingState.INTERMEDIATE_PENDING_BTC_CONFIRMATION,
      );

      expect(mockReset).toHaveBeenCalled();
      expect(mockSetProcessing).toHaveBeenNthCalledWith(1, true);
      expect(mockSetProcessing).toHaveBeenLastCalledWith(false);
      expect(mockSetProcessing).toHaveBeenCalledTimes(2);
    });

    it("should handle errors during delegation staking", async () => {
      // Setup error response for submitStakingTx
      const mockError = new Error("Failed to submit staking transaction");
      mockSubmitStakingTx.mockRejectedValue(mockError);

      const { result } = renderHook(() => useStakingService());

      await act(async () => {
        await result.current.stakeDelegation(mockDelegation);
      });

      expect(mockSetProcessing).toHaveBeenCalledWith(true);
      expect(mockReset).toHaveBeenCalled();
      expect(mockHandleError).toHaveBeenCalledWith({
        error: mockError,
        displayOptions: {
          retryAction: expect.any(Function),
        },
        metadata: {
          stakingTxHash: mockDelegation.stakingTxHashHex,
          userPublicKey: "mock-public-key-no-coord",
          btcAddress: "mock-btc-address",
          babylonAddress: "mock-bech32-address",
        },
      });
      expect(mockUpdateDelegationStatus).not.toHaveBeenCalled();
      expect(mockSetProcessing).toHaveBeenNthCalledWith(1, true);
      expect(mockSetProcessing).toHaveBeenLastCalledWith(false);
    });

    it("should retry staking when retryAction is invoked", async () => {
      const mockError = new Error("Failed to submit staking transaction");
      mockSubmitStakingTx.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useStakingService());

      await act(async () => {
        await result.current.stakeDelegation(mockDelegation);
      });

      const handleErrorArgs = mockHandleError.mock.calls
        .map(([arg]) => arg)
        .find((arg) => arg?.displayOptions?.retryAction);

      expect(handleErrorArgs).toBeDefined();

      const retryAction = handleErrorArgs?.displayOptions?.retryAction as
        | (() => Promise<void>)
        | undefined;
      expect(typeof retryAction).toBe("function");

      mockSubmitStakingTx.mockResolvedValueOnce(undefined);

      await act(async () => {
        await retryAction!();
      });

      expect(mockSubmitStakingTx).toHaveBeenCalledTimes(2);
      expect(mockUpdateDelegationStatus).toHaveBeenCalledWith(
        mockDelegation.stakingTxHashHex,
        DelegationV2StakingState.INTERMEDIATE_PENDING_BTC_CONFIRMATION,
      );
      expect(mockSetProcessing).toHaveBeenLastCalledWith(false);
    });
  });
});
