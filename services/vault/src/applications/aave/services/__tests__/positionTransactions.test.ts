/**
 * Tests for Aave position transactions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoist mock functions so they can be used in vi.mock factories
const {
  mockApproveERC20,
  mockGetERC20Allowance,
  mockGetERC20Balance,
  mockGetUserTotalDebt,
  mockBorrowFromCorePosition,
  mockRepayToCorePosition,
  mockWithdrawAllCollateralFromCorePosition,
} = vi.hoisted(() => ({
  mockApproveERC20: vi.fn(),
  mockGetERC20Allowance: vi.fn(),
  mockGetERC20Balance: vi.fn(),
  mockGetUserTotalDebt: vi.fn(),
  mockBorrowFromCorePosition: vi.fn(),
  mockRepayToCorePosition: vi.fn(),
  mockWithdrawAllCollateralFromCorePosition: vi.fn(),
}));

// Mock ERC20 module
vi.mock("../../../../clients/eth-contract", () => ({
  ERC20: {
    approveERC20: mockApproveERC20,
    getERC20Allowance: mockGetERC20Allowance,
    getERC20Balance: mockGetERC20Balance,
  },
}));

// Mock Aave clients
vi.mock("../../clients", () => ({
  AaveControllerTx: {
    borrowFromCorePosition: mockBorrowFromCorePosition,
    repayToCorePosition: mockRepayToCorePosition,
    withdrawAllCollateralFromCorePosition:
      mockWithdrawAllCollateralFromCorePosition,
  },
  AaveSpoke: {
    getUserTotalDebt: mockGetUserTotalDebt,
  },
}));

// Mock config
vi.mock("../../config", () => ({
  getAaveControllerAddress: vi.fn(() => "0xcontroller"),
}));

import { FULL_REPAY_BUFFER_DIVISOR } from "../../constants";
import {
  borrow,
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

  const mockTxResult = {
    transactionHash: "0xhash",
    receipt: { status: "success" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApproveERC20.mockResolvedValue(mockTxResult);
    mockBorrowFromCorePosition.mockResolvedValue(mockTxResult);
    mockRepayToCorePosition.mockResolvedValue(mockTxResult);
    mockWithdrawAllCollateralFromCorePosition.mockResolvedValue(mockTxResult);
  });

  // ============================================================================
  // borrow
  // ============================================================================
  describe("borrow", () => {
    it("should borrow from position", async () => {
      const debtReserveId = 2n;
      const amount = 1000000n;

      const result = await borrow(
        mockWalletClient,
        mockChain,
        debtReserveId,
        amount,
      );

      expect(mockBorrowFromCorePosition).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xcontroller",
        debtReserveId,
        amount,
        "0xuser",
      );
      expect(result.transactionHash).toBe("0xhash");
    });

    it("should throw error when wallet has no account", async () => {
      const noAccountWallet = { account: undefined } as any;

      await expect(
        borrow(noAccountWallet, mockChain, 1n, 1000n),
      ).rejects.toThrow("Wallet address not available");
    });
  });

  // ============================================================================
  // repay
  // ============================================================================
  describe("repay", () => {
    it("should repay debt to position", async () => {
      const borrower = "0xuser" as any;
      const debtReserveId = 2n;
      const amount = 1000000n;

      const result = await repay(
        mockWalletClient,
        mockChain,
        "0xcontroller" as any,
        borrower,
        debtReserveId,
        amount,
      );

      expect(mockRepayToCorePosition).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xcontroller",
        borrower,
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
          "0xuser" as any,
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
          "0xuser" as any,
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
      mockGetERC20Balance.mockResolvedValue(2000000n);
    });

    it("should approve and repay when allowance insufficient", async () => {
      const amount = 1000000n;

      await repayPartial(
        mockWalletClient,
        mockChain,
        "0xcontroller" as any,
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

      // Should repay with borrower = user address
      expect(mockRepayToCorePosition).toHaveBeenCalled();
    });

    it("should skip approval when allowance sufficient", async () => {
      const amount = 1000000n;
      mockGetERC20Allowance.mockResolvedValue(amount + 1000n);

      await repayPartial(
        mockWalletClient,
        mockChain,
        "0xcontroller" as any,
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
    const defaultDebt = 1000000n;
    const amountToRepay = defaultDebt + defaultDebt / FULL_REPAY_BUFFER_DIVISOR;

    beforeEach(() => {
      mockGetUserTotalDebt.mockResolvedValue(defaultDebt);
      mockGetERC20Allowance.mockResolvedValue(0n);
      mockGetERC20Balance.mockResolvedValue(amountToRepay + 1000n);
    });

    it("should approve exact debt amount plus buffer (not MAX_UINT256)", async () => {
      const currentDebt = 1000000n;
      const expectedRepayAmount =
        currentDebt + currentDebt / FULL_REPAY_BUFFER_DIVISOR;

      await repayFull(
        mockWalletClient,
        mockChain,
        "0xcontroller" as any,
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
    });

    it("should fetch current debt from contract", async () => {
      await repayFull(
        mockWalletClient,
        mockChain,
        "0xcontroller" as any,
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
      const amountToRepay =
        currentDebt + currentDebt / FULL_REPAY_BUFFER_DIVISOR;
      mockGetERC20Allowance.mockResolvedValue(amountToRepay + 1000n);

      await repayFull(
        mockWalletClient,
        mockChain,
        "0xcontroller" as any,
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
          1n,
          "0xtoken" as any,
          "0xspoke" as any,
          "0xproxy" as any,
        ),
      ).rejects.toThrow("No debt to repay");
    });

    it("should throw error when user balance is insufficient to cover debt plus buffer", async () => {
      mockGetERC20Balance.mockResolvedValue(amountToRepay - 1n);

      await expect(
        repayFull(
          mockWalletClient,
          mockChain,
          "0xcontroller" as any,
          1n,
          "0xtoken" as any,
          "0xspoke" as any,
          "0xproxy" as any,
        ),
      ).rejects.toThrow(
        "insufficient balance to fully repay: not enough stablecoin to cover the debt plus interest",
      );
    });

    it("should throw error when wallet has no account", async () => {
      const noAccountWallet = { account: undefined } as any;

      await expect(
        repayFull(
          noAccountWallet,
          mockChain,
          "0xcontroller" as any,
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
      );
      expect(result.transactionHash).toBe("0xhash");
    });
  });
});
