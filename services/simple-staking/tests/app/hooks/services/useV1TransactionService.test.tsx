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

// Mock nanoevents (ESM-only module) to avoid Jest parsing issues
jest.mock("nanoevents", () => ({
  createNanoEvents: jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn(),
  })),
}));

// Mock the @babylonlabs-io/btc-staking-ts library
jest.mock("@babylonlabs-io/btc-staking-ts", () => ({
  getUnbondingTxStakerSignature: jest
    .fn()
    .mockReturnValue("mock-staker-signature-hex"),
  BabylonBtcStakingManager: jest.fn(),
  SigningStep: {
    STAKING_SLASHING: "staking-slashing",
    UNBONDING_SLASHING: "unbonding-slashing",
    PROOF_OF_POSSESSION: "proof-of-possession",
    CREATE_BTC_DELEGATION_MSG: "create-btc-delegation-msg",
  },
}));

// Mock the @babylonlabs-io/wallet-connector library
jest.mock("@babylonlabs-io/wallet-connector", () => ({
  Network: {
    MAINNET: "mainnet",
    TESTNET: "testnet",
  },
}));

import { act, renderHook } from "@testing-library/react";
import { Transaction } from "bitcoinjs-lib";
import { ERROR_CODES } from "@/ui/common/errors";
import { getUnbondingTxStakerSignature } from "@babylonlabs-io/btc-staking-ts";

import { getUnbondingEligibility } from "@/ui/common/api/getUnbondingEligibility";
import { postUnbonding } from "@/ui/common/api/postUnbonding";
import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";
import { useNetworkFees } from "@/ui/common/hooks/client/api/useNetworkFees";
import { useStakingManagerService } from "@/ui/common/hooks/services/useStakingManagerService";
import { useV1TransactionService } from "@/ui/common/hooks/services/useV1TransactionService";
import { useAppState } from "@/ui/common/state";
import { validateStakingInput } from "@/ui/common/utils/delegations";
import { txFeeSafetyCheck } from "@/ui/common/utils/delegations/fee";
import { getFeeRateFromMempool } from "@/ui/common/utils/getFeeRateFromMempool";
import { getBbnParamByBtcHeight } from "@/ui/common/utils/params";

// Mock all dependencies
jest.mock("@/ui/common/api/getUnbondingEligibility");
jest.mock("@/ui/common/api/postUnbonding");
jest.mock("@/ui/common/context/wallet/BTCWalletProvider");
jest.mock("@/ui/common/hooks/client/api/useNetworkFees");
jest.mock("@/ui/common/hooks/services/useStakingManagerService");
jest.mock("@/ui/common/state");
jest.mock("@/ui/common/utils/delegations");
jest.mock("@/ui/common/utils/delegations/fee");
jest.mock("@/ui/common/utils/getFeeRateFromMempool");
jest.mock("@/ui/common/utils/params");
jest.mock("bitcoinjs-lib", () => ({
  Transaction: {
    fromHex: jest.fn(),
  },
}));

describe("useV1TransactionService", () => {
  // Mock data
  const mockStakingTxHex = "mock-staking-tx-hex";
  const mockStakingTxId = "mock-staking-tx-id";
  const mockStakingHeight = 100;
  const mockFinalityProviderPkHex = "mock-finality-provider-pk-hex";
  const mockStakingAmountSat = 120000000; // 1.2 BTC in satoshi
  const mockTimelock = 10000;
  const mockEarlyUnbondingTxHex = "mock-early-unbonding-tx-hex";
  const mockParamVersion = 1;
  const mockDefaultFeeRate = 5;
  const mockUnbondingTxId = "mock-unbonding-tx-id";
  const mockUnbondingTxHex = "mock-unbonding-tx-hex";
  const mockStakerSignatureHex = "mock-staker-signature-hex";

  const mockStakingInput = {
    finalityProviderPksNoCoordHex: [mockFinalityProviderPkHex],
    stakingAmountSat: mockStakingAmountSat,
    stakingTimelock: mockTimelock,
  };

  // Mock objects
  const mockStakingTx = {
    getId: jest.fn().mockReturnValue(mockStakingTxId),
    toHex: jest.fn().mockReturnValue(mockStakingTxHex),
  };

  const mockEarlyUnbondingTx = {
    getId: jest.fn().mockReturnValue(mockUnbondingTxId),
    toHex: jest.fn().mockReturnValue(mockUnbondingTxHex),
  };

  const mockSignedUnbondingTx = {
    getId: jest.fn().mockReturnValue(mockUnbondingTxId),
    toHex: jest.fn().mockReturnValue(mockUnbondingTxHex),
    virtualSize: jest.fn().mockReturnValue(200),
  };

  const mockWithdrawalTx = {
    transaction: {
      toHex: jest.fn().mockReturnValue("mock-withdrawal-tx-hex"),
      virtualSize: jest.fn().mockReturnValue(200),
    },
    fee: 1000,
  };

  // Mock function implementations
  const mockPushTx = jest.fn();
  const mockCreateBtcStakingManager = jest.fn();
  const mockBtcStakingManager = {
    createPartialSignedBtcUnbondingTransaction: jest.fn().mockResolvedValue({
      transaction: mockSignedUnbondingTx,
    }),
    createSignedBtcWithdrawEarlyUnbondedTransaction: jest
      .fn()
      .mockResolvedValue(mockWithdrawalTx),
    createSignedBtcWithdrawStakingExpiredTransaction: jest
      .fn()
      .mockResolvedValue(mockWithdrawalTx),
  };

  beforeEach(() => {
    jest.resetAllMocks();

    // Mock useBTCWallet
    (useBTCWallet as jest.Mock).mockReturnValue({
      publicKeyNoCoord: "mock-public-key-no-coord",
      address: "mock-btc-address",
      pushTx: mockPushTx,
    });

    // Mock useNetworkFees and getFeeRateFromMempool
    (useNetworkFees as jest.Mock).mockReturnValue({
      data: { fastestFee: 10, halfHourFee: 7, hourFee: 5, economyFee: 1 },
    });
    (getFeeRateFromMempool as jest.Mock).mockReturnValue({
      defaultFeeRate: mockDefaultFeeRate,
    });

    // Mock useAppState
    (useAppState as jest.Mock).mockReturnValue({
      networkInfo: {
        params: {
          bbnStakingParams: {
            versions: [
              {
                version: mockParamVersion,
                activationHeight: 0,
                unbondingTime: 144, // ~1 day in blocks
              },
            ],
          },
        },
      },
    });

    // Mock useStakingManagerService
    (useStakingManagerService as jest.Mock).mockReturnValue({
      createBtcStakingManager: mockCreateBtcStakingManager,
    });
    // Restore default manager method implementations after reset
    mockBtcStakingManager.createPartialSignedBtcUnbondingTransaction.mockResolvedValue({
      transaction: mockSignedUnbondingTx,
    });
    mockBtcStakingManager.createSignedBtcWithdrawEarlyUnbondedTransaction.mockResolvedValue(
      mockWithdrawalTx,
    );
    mockBtcStakingManager.createSignedBtcWithdrawStakingExpiredTransaction.mockResolvedValue(
      mockWithdrawalTx,
    );
    mockCreateBtcStakingManager.mockReturnValue(mockBtcStakingManager);

    // Mock Transaction.fromHex
    (Transaction.fromHex as jest.Mock).mockImplementation((txHex) => {
      if (txHex === mockStakingTxHex) return mockStakingTx;
      if (txHex === mockEarlyUnbondingTxHex) return mockEarlyUnbondingTx;
      return null;
    });

    // Mock getBbnParamByBtcHeight
    (getBbnParamByBtcHeight as jest.Mock).mockReturnValue({
      version: mockParamVersion,
    });

    // Mock getUnbondingEligibility
    (getUnbondingEligibility as jest.Mock).mockResolvedValue(true);

    // Mock validateStakingInput
    (validateStakingInput as jest.Mock).mockImplementation(() => {});

    // Mock txFeeSafetyCheck
    (txFeeSafetyCheck as jest.Mock).mockImplementation(() => {});

    // Mock postUnbonding
    (postUnbonding as jest.Mock).mockResolvedValue(true);

    // Restore transaction mock behaviors after reset
    (mockStakingTx.getId as jest.Mock).mockReturnValue(mockStakingTxId);
    (mockStakingTx.toHex as jest.Mock).mockReturnValue(mockStakingTxHex);

    (mockEarlyUnbondingTx.getId as jest.Mock).mockReturnValue(
      mockUnbondingTxId,
    );
    (mockEarlyUnbondingTx.toHex as jest.Mock).mockReturnValue(
      mockUnbondingTxHex,
    );

    (mockSignedUnbondingTx.getId as jest.Mock).mockReturnValue(
      mockUnbondingTxId,
    );
    (mockSignedUnbondingTx.toHex as jest.Mock).mockReturnValue(
      mockUnbondingTxHex,
    );
    (mockSignedUnbondingTx.virtualSize as jest.Mock).mockReturnValue(200);

    (mockWithdrawalTx.transaction.toHex as jest.Mock).mockReturnValue(
      "mock-withdrawal-tx-hex",
    );
    (mockWithdrawalTx.transaction.virtualSize as jest.Mock).mockReturnValue(200);

    // Restore signature mock return after reset
    (getUnbondingTxStakerSignature as jest.Mock).mockReturnValue(
      mockStakerSignatureHex,
    );
  });

  describe("submitUnbondingTx", () => {
    it("should successfully submit an unbonding transaction", async () => {
      const { result } = renderHook(() => useV1TransactionService());

      await act(async () => {
        await result.current.submitUnbondingTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
        );
      });

      // Verify Transaction.fromHex was called with stakingTxHex
      expect(Transaction.fromHex).toHaveBeenCalledWith(mockStakingTxHex);

      // Verify getUnbondingEligibility was called with stakingTxId
      expect(getUnbondingEligibility).toHaveBeenCalledWith(mockStakingTxId);

      // Verify getBbnParamByBtcHeight was called with correct params
      expect(getBbnParamByBtcHeight).toHaveBeenCalledWith(
        mockStakingHeight,
        expect.anything(),
      );

      // Verify createPartialSignedBtcUnbondingTransaction was called with correct params
      expect(
        mockBtcStakingManager.createPartialSignedBtcUnbondingTransaction,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "mock-btc-address",
          publicKeyNoCoordHex: "mock-public-key-no-coord",
        }),
        mockStakingInput,
        mockParamVersion,
        mockStakingTx,
      );

      // Verify postUnbonding was called with correct params
      expect(postUnbonding).toHaveBeenCalledWith(
        mockStakerSignatureHex,
        mockStakingTxId,
        mockUnbondingTxId,
        mockUnbondingTxHex,
      );

      // Verify signature function is used and manager created
      expect(getUnbondingTxStakerSignature).toHaveBeenCalledWith(
        mockSignedUnbondingTx,
      );
      expect(mockCreateBtcStakingManager).toHaveBeenCalledTimes(1);
    });

    it("should throw an error when transaction is not eligible for unbonding", async () => {
      // Setup getUnbondingEligibility to return false
      (getUnbondingEligibility as jest.Mock).mockResolvedValue(false);

      const { result } = renderHook(() => useV1TransactionService());

      await expect(
        act(async () => {
          await result.current.submitUnbondingTx(
            mockStakingInput,
            mockStakingHeight,
            mockStakingTxHex,
          );
        }),
      ).rejects.toThrow();

      expect(getUnbondingEligibility).toHaveBeenCalledWith(mockStakingTxId);
      expect(
        mockBtcStakingManager.createPartialSignedBtcUnbondingTransaction,
      ).not.toHaveBeenCalled();
      expect(postUnbonding).not.toHaveBeenCalled();
    });

    it("should handle errors when posting unbonding transaction", async () => {
      // Setup postUnbonding to throw an error
      const mockError = new Error("Server error");
      (postUnbonding as jest.Mock).mockRejectedValue(mockError);

      // Make sure the transaction signature is created before the error happens
      mockBtcStakingManager.createPartialSignedBtcUnbondingTransaction.mockImplementation(
        async () => {
          // Return the transaction as expected
          const result = { transaction: mockSignedUnbondingTx };

          // But ensure postUnbonding gets called - it just fails
          await expect(
            postUnbonding(
              mockStakerSignatureHex,
              mockStakingTxId,
              mockUnbondingTxId,
              mockUnbondingTxHex,
            ),
          ).rejects.toThrow();

          return result;
        },
      );

      const { result } = renderHook(() => useV1TransactionService());

      await expect(
        act(async () => {
          await result.current.submitUnbondingTx(
            mockStakingInput,
            mockStakingHeight,
            mockStakingTxHex,
          );
        }),
      ).rejects.toThrow("Error submitting unbonding transaction");

      expect(
        mockBtcStakingManager.createPartialSignedBtcUnbondingTransaction,
      ).toHaveBeenCalled();
      // Don't need to check postUnbonding here since we manually triggered it in the mock
    });

    it("should throw initialization error when manager is not initialized", async () => {
      mockCreateBtcStakingManager.mockReturnValue(null);

      const { result } = renderHook(() => useV1TransactionService());

      await expect(
        result.current.submitUnbondingTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
        ),
      ).rejects.toMatchObject({
        errorCode: ERROR_CODES.INITIALIZATION_ERROR,
        message: expect.stringContaining("BTC Staking Manager not initialized"),
      });
    });

    it("should throw initialization error when staker info is missing", async () => {
      (useBTCWallet as jest.Mock).mockReturnValue({
        publicKeyNoCoord: "",
        address: "",
        pushTx: mockPushTx,
      });

      const { result } = renderHook(() => useV1TransactionService());

      await expect(
        result.current.submitUnbondingTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
        ),
      ).rejects.toMatchObject({
        errorCode: ERROR_CODES.INITIALIZATION_ERROR,
        message: expect.stringContaining("Staker info not initialized"),
      });
    });

    it("should throw initialization error when staking params are not loaded", async () => {
      (useAppState as jest.Mock).mockReturnValue({
        networkInfo: {
          params: { bbnStakingParams: { versions: [] } },
        },
      });

      const { result } = renderHook(() => useV1TransactionService());

      await expect(
        result.current.submitUnbondingTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
        ),
      ).rejects.toMatchObject({
        errorCode: ERROR_CODES.INITIALIZATION_ERROR,
        message: expect.stringContaining("Staking params not loaded"),
      });
    });

    it("should surface input validation errors from validateStakingInput", async () => {
      (validateStakingInput as jest.Mock).mockImplementation(() => {
        throw new Error("invalid input");
      });

      const { result } = renderHook(() => useV1TransactionService());

      await expect(
        result.current.submitUnbondingTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
        ),
      ).rejects.toThrow("invalid input");
    });

    it("should wrap postUnbonding errors with ClientError and correct code", async () => {
      (postUnbonding as jest.Mock).mockRejectedValue(new Error("Server error"));

      const { result } = renderHook(() => useV1TransactionService());

      await expect(
        result.current.submitUnbondingTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
        ),
      ).rejects.toMatchObject({
        errorCode: ERROR_CODES.EXTERNAL_SERVICE_UNAVAILABLE,
      });
    });

    it("should surface hex parsing failures and stop before API calls", async () => {
      (Transaction.fromHex as jest.Mock).mockImplementation(() => {
        throw new Error("bad hex");
      });

      const { result } = renderHook(() => useV1TransactionService());

      await expect(
        result.current.submitUnbondingTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
        ),
      ).rejects.toThrow("bad hex");

      expect(getUnbondingEligibility).not.toHaveBeenCalled();
      expect(postUnbonding).not.toHaveBeenCalled();
    });
  });

  describe("submitWithdrawalTx", () => {
    it("should successfully submit a withdrawal transaction for expired staking", async () => {
      const { result } = renderHook(() => useV1TransactionService());

      await act(async () => {
        await result.current.submitWithdrawalTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
        );
      });

      // Verify Transaction.fromHex was called with stakingTxHex
      expect(Transaction.fromHex).toHaveBeenCalledWith(mockStakingTxHex);

      // Verify getBbnParamByBtcHeight was called with correct params
      expect(getBbnParamByBtcHeight).toHaveBeenCalledWith(
        mockStakingHeight,
        expect.anything(),
      );

      // Verify createSignedBtcWithdrawStakingExpiredTransaction was called with correct params
      expect(
        mockBtcStakingManager.createSignedBtcWithdrawStakingExpiredTransaction,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "mock-btc-address",
          publicKeyNoCoordHex: "mock-public-key-no-coord",
        }),
        mockStakingInput,
        mockParamVersion,
        mockStakingTx,
        mockDefaultFeeRate,
      );

      // Verify txFeeSafetyCheck was called with correct params
      expect(txFeeSafetyCheck).toHaveBeenCalledWith(
        mockWithdrawalTx.transaction,
        mockDefaultFeeRate,
        mockWithdrawalTx.fee,
      );

      // Verify pushTx was called with the correct transaction hex
      expect(mockPushTx).toHaveBeenCalledWith(
        mockWithdrawalTx.transaction.toHex(),
      );

      // Manager created exactly once
      expect(mockCreateBtcStakingManager).toHaveBeenCalledTimes(1);
    });

    it("should successfully submit a withdrawal transaction for early unbonding", async () => {
      const { result } = renderHook(() => useV1TransactionService());

      await act(async () => {
        await result.current.submitWithdrawalTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
          mockEarlyUnbondingTxHex,
        );
      });

      // Verify Transaction.fromHex was called with earlyUnbondingTxHex
      expect(Transaction.fromHex).toHaveBeenCalledWith(mockEarlyUnbondingTxHex);

      // Verify getBbnParamByBtcHeight was called with correct params
      expect(getBbnParamByBtcHeight).toHaveBeenCalledWith(
        mockStakingHeight,
        expect.anything(),
      );

      // Verify createSignedBtcWithdrawEarlyUnbondedTransaction was called with correct params
      expect(
        mockBtcStakingManager.createSignedBtcWithdrawEarlyUnbondedTransaction,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "mock-btc-address",
          publicKeyNoCoordHex: "mock-public-key-no-coord",
        }),
        mockStakingInput,
        mockParamVersion,
        mockEarlyUnbondingTx,
        mockDefaultFeeRate,
      );

      // Verify txFeeSafetyCheck was called with correct params
      expect(txFeeSafetyCheck).toHaveBeenCalledWith(
        mockWithdrawalTx.transaction,
        mockDefaultFeeRate,
        mockWithdrawalTx.fee,
      );

      // Verify pushTx was called with the correct transaction hex
      expect(mockPushTx).toHaveBeenCalledWith(
        mockWithdrawalTx.transaction.toHex(),
      );

      // Manager created exactly once
      expect(mockCreateBtcStakingManager).toHaveBeenCalledTimes(1);
    });

    it("should not push when txFeeSafetyCheck throws", async () => {
      (txFeeSafetyCheck as jest.Mock).mockImplementation(() => {
        throw new Error("fee too high");
      });

      const { result } = renderHook(() => useV1TransactionService());

      await expect(
        result.current.submitWithdrawalTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
        ),
      ).rejects.toThrow("fee too high");

      expect(mockPushTx).not.toHaveBeenCalled();
    });

    it("should surface manager errors and avoid downstream calls (expired path)", async () => {
      mockBtcStakingManager.createSignedBtcWithdrawStakingExpiredTransaction.mockRejectedValue(
        new Error("create failed"),
      );

      const { result } = renderHook(() => useV1TransactionService());

      await expect(
        result.current.submitWithdrawalTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
        ),
      ).rejects.toThrow("create failed");

      expect(txFeeSafetyCheck).not.toHaveBeenCalled();
      expect(mockPushTx).not.toHaveBeenCalled();
    });

    it("should use defaultFeeRate from mempool wiring", async () => {
      (getFeeRateFromMempool as jest.Mock).mockReturnValue({
        defaultFeeRate: 123,
      });

      const { result } = renderHook(() => useV1TransactionService());

      await act(async () => {
        await result.current.submitWithdrawalTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
        );
      });

      expect(
        mockBtcStakingManager.createSignedBtcWithdrawStakingExpiredTransaction,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "mock-btc-address",
          publicKeyNoCoordHex: "mock-public-key-no-coord",
        }),
        mockStakingInput,
        mockParamVersion,
        expect.any(Object),
        123,
      );
    });

    it("should surface hex parsing errors and avoid downstream calls (early path)", async () => {
      (Transaction.fromHex as jest.Mock).mockImplementation(() => {
        throw new Error("bad hex");
      });

      const { result } = renderHook(() => useV1TransactionService());

      await expect(
        result.current.submitWithdrawalTx(
          mockStakingInput,
          mockStakingHeight,
          mockStakingTxHex,
          mockEarlyUnbondingTxHex,
        ),
      ).rejects.toThrow("bad hex");

      expect(
        mockBtcStakingManager.createSignedBtcWithdrawEarlyUnbondedTransaction,
      ).not.toHaveBeenCalled();
      expect(txFeeSafetyCheck).not.toHaveBeenCalled();
      expect(mockPushTx).not.toHaveBeenCalled();
    });
  });
});
