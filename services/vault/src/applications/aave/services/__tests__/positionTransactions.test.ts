/**
 * Tests for Aave position transactions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Buffer for full repayment (0.01% = 1/10000)
// Matches FULL_REPAY_BUFFER_BPS from @babylonlabs-io/ts-sdk
const FULL_REPAY_BUFFER_BPS = 10000n;

// Hoist mock functions so they can be used in vi.mock factories
const {
  mockApproveERC20,
  mockGetERC20Allowance,
  mockGetReserveById,
  mockGetVbtcReserveId,
  mockGetUserTotalDebt,
  mockHasDebt,
  mockAddCollateralToCorePosition,
  mockBorrowFromCorePosition,
  mockRepayToCorePosition,
  mockWithdrawAllCollateralFromCorePosition,
  mockDepositorRedeem,
  mockFetchAaveConfig,
} = vi.hoisted(() => ({
  mockApproveERC20: vi.fn(),
  mockGetERC20Allowance: vi.fn(),
  mockGetReserveById: vi.fn(),
  mockGetVbtcReserveId: vi.fn(),
  mockGetUserTotalDebt: vi.fn(),
  mockHasDebt: vi.fn(),
  mockAddCollateralToCorePosition: vi.fn(),
  mockBorrowFromCorePosition: vi.fn(),
  mockRepayToCorePosition: vi.fn(),
  mockWithdrawAllCollateralFromCorePosition: vi.fn(),
  mockDepositorRedeem: vi.fn(),
  mockFetchAaveConfig: vi.fn(),
}));

// Mock ERC20 module
vi.mock("../../../../clients/eth-contract", () => ({
  ERC20: {
    approveERC20: mockApproveERC20,
    getERC20Allowance: mockGetERC20Allowance,
  },
}));

// Mock reserve service
vi.mock("../reserveService", () => ({
  getReserveById: mockGetReserveById,
  getVbtcReserveId: mockGetVbtcReserveId,
}));

// Mock Aave clients
vi.mock("../../clients", () => ({
  AaveControllerTx: {
    addCollateralToCorePosition: mockAddCollateralToCorePosition,
    borrowFromCorePosition: mockBorrowFromCorePosition,
    repayToCorePosition: mockRepayToCorePosition,
    withdrawAllCollateralFromCorePosition:
      mockWithdrawAllCollateralFromCorePosition,
    depositorRedeem: mockDepositorRedeem,
  },
  AaveSpoke: {
    getUserTotalDebt: mockGetUserTotalDebt,
    hasDebt: mockHasDebt,
  },
}));

// Mock config
vi.mock("../../config", () => ({
  getAaveControllerAddress: vi.fn(() => "0xcontroller"),
}));

vi.mock("../fetchConfig", () => ({
  fetchAaveConfig: mockFetchAaveConfig,
}));

import {
  addCollateral,
  approveForRepay,
  borrow,
  canWithdraw,
  redeemVault,
  repay,
  repayFull,
  repayPartial,
  withdrawAllCollateral,
} from "../positionTransactions";

describe("positionTransactions", () => {
  const mockWalletClient = {
    account: { address: "0xuser" },
  } as any;

  const mockChain = { id: 1 } as any;

  const mockReserve = {
    id: 1n,
    token: {
      address: "0xtoken",
      decimals: 18,
      symbol: "USDC",
    },
  };

  const mockTxResult = {
    transactionHash: "0xhash",
    receipt: { status: "success" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReserveById.mockResolvedValue(mockReserve);
    mockGetVbtcReserveId.mockResolvedValue(1n);
    mockApproveERC20.mockResolvedValue(mockTxResult);
    mockAddCollateralToCorePosition.mockResolvedValue(mockTxResult);
    mockBorrowFromCorePosition.mockResolvedValue(mockTxResult);
    mockRepayToCorePosition.mockResolvedValue(mockTxResult);
    mockWithdrawAllCollateralFromCorePosition.mockResolvedValue(mockTxResult);
    mockDepositorRedeem.mockResolvedValue(mockTxResult);
    mockFetchAaveConfig.mockResolvedValue({
      btcVaultCoreSpokeAddress: "0xspoke",
    });
  });

  // ============================================================================
  // addCollateral
  // ============================================================================
  describe("addCollateral", () => {
    it("should add collateral with vault IDs", async () => {
      const vaultIds = ["0xvault1", "0xvault2"] as any[];

      const result = await addCollateral(mockWalletClient, mockChain, vaultIds);

      expect(mockAddCollateralToCorePosition).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xcontroller",
        vaultIds,
        1n, // reserveId from mockGetVbtcReserveId
      );
      expect(result.transactionHash).toBe("0xhash");
    });

    it("should fetch vBTC reserve ID", async () => {
      await addCollateral(mockWalletClient, mockChain, ["0xvault1"] as any[]);

      expect(mockGetVbtcReserveId).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // borrow
  // ============================================================================
  describe("borrow", () => {
    it("should borrow from position", async () => {
      const positionId = "0xposition" as any;
      const debtReserveId = 2n;
      const amount = 1000000n;

      const result = await borrow(
        mockWalletClient,
        mockChain,
        positionId,
        debtReserveId,
        amount,
      );

      expect(mockBorrowFromCorePosition).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xcontroller",
        positionId,
        debtReserveId,
        amount,
        "0xuser",
      );
      expect(result.transactionHash).toBe("0xhash");
    });

    it("should throw error when wallet has no account", async () => {
      const noAccountWallet = { account: undefined } as any;

      await expect(
        borrow(noAccountWallet, mockChain, "0xposition" as any, 1n, 1000n),
      ).rejects.toThrow("Wallet address not available");
    });
  });

  // ============================================================================
  // approveForRepay - Token Approval Security
  // ============================================================================
  describe("approveForRepay", () => {
    it("should approve exact amount plus buffer (not unlimited)", async () => {
      const amount = 1000000n;
      const expectedApproval = amount + amount / FULL_REPAY_BUFFER_BPS;

      await approveForRepay(mockWalletClient, mockChain, 1n, amount);

      expect(mockApproveERC20).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        mockReserve.token.address,
        "0xcontroller",
        expectedApproval,
      );
    });

    it("should throw error when amount is 0", async () => {
      await expect(
        approveForRepay(mockWalletClient, mockChain, 1n, 0n),
      ).rejects.toThrow("Approval amount must be greater than 0");

      expect(mockApproveERC20).not.toHaveBeenCalled();
    });

    it("should throw error when amount is negative", async () => {
      await expect(
        approveForRepay(mockWalletClient, mockChain, 1n, -100n),
      ).rejects.toThrow("Approval amount must be greater than 0");

      expect(mockApproveERC20).not.toHaveBeenCalled();
    });

    it("should throw error when reserve not found", async () => {
      mockGetReserveById.mockResolvedValue(null);

      await expect(
        approveForRepay(mockWalletClient, mockChain, 999n, 1000n),
      ).rejects.toThrow("Reserve 999 not found");
    });

    it("should add correct buffer percentage", async () => {
      // FULL_REPAY_BUFFER_BPS = 10000n means 0.01% buffer
      const amount = 10000n;
      const expectedApproval = amount + amount / FULL_REPAY_BUFFER_BPS;

      await approveForRepay(mockWalletClient, mockChain, 1n, amount);

      expect(mockApproveERC20).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expectedApproval,
      );
    });
  });

  // ============================================================================
  // repay
  // ============================================================================
  describe("repay", () => {
    it("should repay debt to position", async () => {
      const positionId = "0xposition" as any;
      const debtReserveId = 2n;
      const amount = 1000000n;

      const result = await repay(
        mockWalletClient,
        mockChain,
        "0xcontroller" as any,
        positionId,
        debtReserveId,
        amount,
      );

      expect(mockRepayToCorePosition).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xcontroller",
        positionId,
        debtReserveId,
        amount,
      );
      expect(result.transactionHash).toBe("0xhash");
    });

    it("should throw error when amount is 0", async () => {
      await expect(
        repay(
          mockWalletClient,
          mockChain,
          "0xcontroller" as any,
          "0xposition" as any,
          1n,
          0n,
        ),
      ).rejects.toThrow("Repay amount must be greater than 0");
    });

    it("should throw error when amount is negative", async () => {
      await expect(
        repay(
          mockWalletClient,
          mockChain,
          "0xcontroller" as any,
          "0xposition" as any,
          1n,
          -100n,
        ),
      ).rejects.toThrow("Repay amount must be greater than 0");
    });
  });

  // ============================================================================
  // repayPartial
  // ============================================================================
  describe("repayPartial", () => {
    beforeEach(() => {
      mockGetERC20Allowance.mockResolvedValue(0n);
    });

    it("should approve and repay when allowance insufficient", async () => {
      const amount = 1000000n;

      await repayPartial(
        mockWalletClient,
        mockChain,
        "0xcontroller" as any,
        "0xposition" as any,
        1n,
        "0xtoken" as any,
        amount,
      );

      // Should check allowance
      expect(mockGetERC20Allowance).toHaveBeenCalledWith(
        "0xtoken",
        "0xuser",
        "0xcontroller",
      );

      // Should approve exact amount (not MAX_UINT256)
      expect(mockApproveERC20).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xtoken",
        "0xcontroller",
        amount,
      );

      // Should repay
      expect(mockRepayToCorePosition).toHaveBeenCalled();
    });

    it("should skip approval when allowance sufficient", async () => {
      const amount = 1000000n;
      mockGetERC20Allowance.mockResolvedValue(amount + 1000n);

      await repayPartial(
        mockWalletClient,
        mockChain,
        "0xcontroller" as any,
        "0xposition" as any,
        1n,
        "0xtoken" as any,
        amount,
      );

      expect(mockApproveERC20).not.toHaveBeenCalled();
      expect(mockRepayToCorePosition).toHaveBeenCalled();
    });

    it("should throw error when wallet has no account", async () => {
      const noAccountWallet = { account: undefined } as any;

      await expect(
        repayPartial(
          noAccountWallet,
          mockChain,
          "0xcontroller" as any,
          "0xposition" as any,
          1n,
          "0xtoken" as any,
          1000n,
        ),
      ).rejects.toThrow("Wallet address not available");
    });
  });

  // ============================================================================
  // repayFull - Token Approval Security
  // ============================================================================
  describe("repayFull", () => {
    beforeEach(() => {
      mockGetUserTotalDebt.mockResolvedValue(1000000n);
      mockGetERC20Allowance.mockResolvedValue(0n);
    });

    it("should approve exact debt amount plus buffer (not MAX_UINT256)", async () => {
      const currentDebt = 1000000n;
      const expectedRepayAmount =
        currentDebt + currentDebt / FULL_REPAY_BUFFER_BPS;

      await repayFull(
        mockWalletClient,
        mockChain,
        "0xcontroller" as any,
        "0xposition" as any,
        1n,
        "0xtoken" as any,
        "0xspoke" as any,
        "0xproxy" as any,
      );

      // Verify approval is for exact amount, not MAX_UINT256
      expect(mockApproveERC20).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xtoken",
        "0xcontroller",
        expectedRepayAmount,
      );

      // Ensure MAX_UINT256 was NOT used
      const approvalAmount = mockApproveERC20.mock.calls[0][4];
      expect(approvalAmount).toBeLessThan(2n ** 256n - 1n);
    });

    it("should fetch current debt from contract", async () => {
      await repayFull(
        mockWalletClient,
        mockChain,
        "0xcontroller" as any,
        "0xposition" as any,
        1n,
        "0xtoken" as any,
        "0xspoke" as any,
        "0xproxy" as any,
      );

      expect(mockGetUserTotalDebt).toHaveBeenCalledWith(
        "0xspoke",
        1n,
        "0xproxy",
      );
    });

    it("should skip approval if allowance is sufficient", async () => {
      const currentDebt = 1000000n;
      const amountToRepay = currentDebt + currentDebt / FULL_REPAY_BUFFER_BPS;
      mockGetERC20Allowance.mockResolvedValue(amountToRepay + 1000n);

      await repayFull(
        mockWalletClient,
        mockChain,
        "0xcontroller" as any,
        "0xposition" as any,
        1n,
        "0xtoken" as any,
        "0xspoke" as any,
        "0xproxy" as any,
      );

      expect(mockApproveERC20).not.toHaveBeenCalled();
    });

    it("should throw error when there is no debt to repay", async () => {
      mockGetUserTotalDebt.mockResolvedValue(0n);

      await expect(
        repayFull(
          mockWalletClient,
          mockChain,
          "0xcontroller" as any,
          "0xposition" as any,
          1n,
          "0xtoken" as any,
          "0xspoke" as any,
          "0xproxy" as any,
        ),
      ).rejects.toThrow("No debt to repay");
    });

    it("should throw error when wallet has no account", async () => {
      const noAccountWallet = { account: undefined } as any;

      await expect(
        repayFull(
          noAccountWallet,
          mockChain,
          "0xcontroller" as any,
          "0xposition" as any,
          1n,
          "0xtoken" as any,
          "0xspoke" as any,
          "0xproxy" as any,
        ),
      ).rejects.toThrow("Wallet address not available");
    });
  });

  // ============================================================================
  // withdrawAllCollateral
  // ============================================================================
  describe("withdrawAllCollateral", () => {
    it("should withdraw all collateral", async () => {
      const result = await withdrawAllCollateral(mockWalletClient, mockChain);

      expect(mockWithdrawAllCollateralFromCorePosition).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xcontroller",
        1n, // reserveId
      );
      expect(result.transactionHash).toBe("0xhash");
    });

    it("should fetch vBTC reserve ID", async () => {
      await withdrawAllCollateral(mockWalletClient, mockChain);

      expect(mockGetVbtcReserveId).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // redeemVault
  // ============================================================================
  describe("redeemVault", () => {
    it("should redeem vault", async () => {
      const vaultId = "0xvault" as any;

      const result = await redeemVault(mockWalletClient, mockChain, vaultId);

      expect(mockDepositorRedeem).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xcontroller",
        vaultId,
      );
      expect(result.transactionHash).toBe("0xhash");
    });
  });

  // ============================================================================
  // canWithdraw
  // ============================================================================
  describe("canWithdraw", () => {
    it("should return true when position has no debt", async () => {
      mockHasDebt.mockResolvedValue(false);

      const result = await canWithdraw("0xproxy" as any, 1n);

      expect(mockHasDebt).toHaveBeenCalledWith("0xspoke", 1n, "0xproxy");
      expect(result).toBe(true);
    });

    it("should return false when position has debt", async () => {
      mockHasDebt.mockResolvedValue(true);

      const result = await canWithdraw("0xproxy" as any, 1n);

      expect(result).toBe(false);
    });

    it("should return false when config fetch fails", async () => {
      mockFetchAaveConfig.mockResolvedValue(null);

      const result = await canWithdraw("0xproxy" as any, 1n);

      expect(result).toBe(false);
    });
  });
});
