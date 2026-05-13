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
  mockGetCoreSpokeAddress,
  mockBorrowFromCorePosition,
  mockRepayToCorePosition,
  mockWithdrawCollaterals,
} = vi.hoisted(() => ({
  mockApproveERC20: vi.fn(),
  mockGetERC20Allowance: vi.fn(),
  mockGetERC20Balance: vi.fn(),
  mockGetUserTotalDebt: vi.fn(),
  mockGetCoreSpokeAddress: vi.fn(),
  mockBorrowFromCorePosition: vi.fn(),
  mockRepayToCorePosition: vi.fn(),
  mockWithdrawCollaterals: vi.fn(),
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
  AaveAdapterTx: {
    borrowFromCorePosition: mockBorrowFromCorePosition,
    repayToCorePosition: mockRepayToCorePosition,
    withdrawCollaterals: mockWithdrawCollaterals,
    getCoreSpokeAddress: mockGetCoreSpokeAddress,
  },
  AaveSpoke: {
    getUserTotalDebt: mockGetUserTotalDebt,
  },
}));

// Mock config
vi.mock("../../config", () => ({
  getAaveAdapterAddress: vi.fn(() => "0xadapter"),
}));

import { FULL_REPAY_BUFFER_DIVISOR } from "../../constants";
import {
  borrow,
  repay,
  repayFull,
  repayMaxCapped,
  repayPartial,
  withdrawSelectedCollateral,
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
    mockWithdrawCollaterals.mockResolvedValue(mockTxResult);
    mockGetCoreSpokeAddress.mockResolvedValue("0xspoke");
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
        "0xadapter",
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
        borrower,
        debtReserveId,
        amount,
      );

      expect(mockRepayToCorePosition).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xadapter",
        borrower,
        debtReserveId,
        amount,
      );
      expect(result.transactionHash).toBe("0xhash");
    });

    it("should throw error when amount is 0", async () => {
      await expect(
        repay(mockWalletClient, mockChain, "0xuser" as any, 1n, 0n),
      ).rejects.toThrow("Repay amount must be greater than 0");
    });

    it("should throw error when amount is negative", async () => {
      await expect(
        repay(mockWalletClient, mockChain, "0xuser" as any, 1n, -100n),
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
        1n,
        "0xtoken" as any,
        amount,
      );

      // Should check allowance against the pinned adapter address
      expect(mockGetERC20Allowance).toHaveBeenCalledWith(
        "0xtoken",
        "0xuser",
        "0xadapter",
      );

      // Should approve exact amount (not MAX_UINT256) to the pinned adapter address
      expect(mockApproveERC20).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xtoken",
        "0xadapter",
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
        repayPartial(noAccountWallet, mockChain, 1n, "0xtoken" as any, 1000n),
      ).rejects.toThrow("Wallet address not available");
    });
  });

  // ============================================================================
  // repayMaxCapped
  // ============================================================================
  describe("repayMaxCapped", () => {
    beforeEach(() => {
      mockGetERC20Allowance.mockResolvedValue(0n);
    });

    it("should approve and send the user's full balance verbatim (no buffer math)", async () => {
      const balanceAmount = 200_000_000n;

      await repayMaxCapped(
        mockWalletClient,
        mockChain,
        1n,
        "0xtoken" as any,
        balanceAmount,
      );

      // The whole point of this path: approve exactly the cap, not cap × (1+buffer).
      expect(mockApproveERC20).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xtoken",
        "0xadapter",
        balanceAmount,
      );

      expect(mockRepayToCorePosition).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xadapter",
        "0xuser",
        1n,
        balanceAmount,
      );
    });

    it("should skip approval when allowance is sufficient", async () => {
      const balanceAmount = 200_000_000n;
      mockGetERC20Allowance.mockResolvedValue(balanceAmount + 1n);

      await repayMaxCapped(
        mockWalletClient,
        mockChain,
        1n,
        "0xtoken" as any,
        balanceAmount,
      );

      expect(mockApproveERC20).not.toHaveBeenCalled();
      expect(mockRepayToCorePosition).toHaveBeenCalled();
    });

    it("should not refetch debt — the cap is the user's balance, period", async () => {
      // If this path fetched debt, an interest-accrual race could push the
      // approval above the user's balance and break the failure-mode-A fix.
      await repayMaxCapped(
        mockWalletClient,
        mockChain,
        1n,
        "0xtoken" as any,
        1_000_000n,
      );

      expect(mockGetUserTotalDebt).not.toHaveBeenCalled();
    });

    it("should throw error when balanceAmount is 0", async () => {
      await expect(
        repayMaxCapped(mockWalletClient, mockChain, 1n, "0xtoken" as any, 0n),
      ).rejects.toThrow("Repay amount must be greater than 0");
    });

    it("should throw error when wallet has no account", async () => {
      const noAccountWallet = { account: undefined } as any;

      await expect(
        repayMaxCapped(
          noAccountWallet,
          mockChain,
          1n,
          "0xtoken" as any,
          1_000n,
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

    it("should approve exact debt amount plus buffer to the pinned adapter address (not MAX_UINT256)", async () => {
      const currentDebt = 1000000n;
      const expectedRepayAmount =
        currentDebt + currentDebt / FULL_REPAY_BUFFER_DIVISOR;

      await repayFull(
        mockWalletClient,
        mockChain,
        1n,
        "0xtoken" as any,
        "0xproxy" as any,
      );

      // Verify approval is for exact amount, not MAX_UINT256, to the pinned adapter address
      expect(mockApproveERC20).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xtoken",
        "0xadapter",
        expectedRepayAmount,
      );
    });

    it("should fetch current debt from the pinned spoke address", async () => {
      await repayFull(
        mockWalletClient,
        mockChain,
        1n,
        "0xtoken" as any,
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
        1n,
        "0xtoken" as any,
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
          1n,
          "0xtoken" as any,
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
          1n,
          "0xtoken" as any,
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
          1n,
          "0xtoken" as any,
          "0xproxy" as any,
        ),
      ).rejects.toThrow("Wallet address not available");
    });

    // The buffer uses ceiling division so dust-scale debts (currentDebt <
    // FULL_REPAY_BUFFER_DIVISOR, where percentage math floors to zero) still
    // get at least 1 base unit of buffer. Without this, micro-cent residuals
    // can persist forever because each repay sends the exact debt and the
    // next block re-introduces a unit of interest.
    describe("ceiling-division buffer for dust-scale debts", () => {
      const runWithDebt = async (debt: bigint) => {
        mockGetUserTotalDebt.mockResolvedValue(debt);
        mockGetERC20Balance.mockResolvedValue(1_000_000_000n); // plenty of headroom
        await repayFull(
          mockWalletClient,
          mockChain,
          1n,
          "0xtoken" as any,
          "0xproxy" as any,
        );
      };

      it("currentDebt = 1n → approves 2n (1 base unit of buffer, not 0)", async () => {
        await runWithDebt(1n);
        expect(mockApproveERC20).toHaveBeenCalledWith(
          mockWalletClient,
          mockChain,
          "0xtoken",
          "0xadapter",
          2n,
        );
      });

      it("currentDebt = 3n (the reported 3 µUSDC case) → approves 4n", async () => {
        await runWithDebt(3n);
        expect(mockApproveERC20).toHaveBeenCalledWith(
          mockWalletClient,
          mockChain,
          "0xtoken",
          "0xadapter",
          4n,
        );
      });

      it("currentDebt = 199n (just below divisor) → approves 200n", async () => {
        await runWithDebt(199n);
        expect(mockApproveERC20).toHaveBeenCalledWith(
          mockWalletClient,
          mockChain,
          "0xtoken",
          "0xadapter",
          200n,
        );
      });

      it("currentDebt = 200n (exact divisor) → approves 201n", async () => {
        await runWithDebt(200n);
        expect(mockApproveERC20).toHaveBeenCalledWith(
          mockWalletClient,
          mockChain,
          "0xtoken",
          "0xadapter",
          201n,
        );
      });

      it("currentDebt = 201n (just above divisor) → approves 203n (ceiling rounds up)", async () => {
        await runWithDebt(201n);
        expect(mockApproveERC20).toHaveBeenCalledWith(
          mockWalletClient,
          mockChain,
          "0xtoken",
          "0xadapter",
          203n,
        );
      });
    });
  });

  // ============================================================================
  // withdrawSelectedCollateral
  // ============================================================================
  describe("withdrawSelectedCollateral", () => {
    it("should withdraw selected vaults", async () => {
      const vaultIds = ["0xvault1", "0xvault2"] as any;

      const result = await withdrawSelectedCollateral(
        mockWalletClient,
        mockChain,
        vaultIds,
      );

      expect(mockWithdrawCollaterals).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xadapter",
        vaultIds,
      );
      expect(result.transactionHash).toBe("0xhash");
    });
  });
});
