/**
 * Tests for Aave position transactions.
 */

import { encodeEventTopics, maxUint256, numberToHex } from "viem";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

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

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), event: vi.fn() },
}));

import { logger } from "@/infrastructure";

import {
  ContractError,
  ErrorCode,
  tagSimulationPhase,
} from "../../../../utils/errors";
import { getAaveAdapterAddress } from "../../config";
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

  const mockToken = { symbol: "USDC", decimals: 6 };

  // `logs: []` routes ensureAllowance's verification to the fallback
  // allowance re-read (no Approval event to parse); event-path behavior is
  // covered by the dedicated approval-verification tests below.
  const mockTxResult = {
    transactionHash: "0xhash",
    receipt: { status: "success", logs: [] },
  };

  // Shared mutable allowance state — simulates the on-chain allowance moving
  // from its starting value to the just-approved amount. The fallback
  // verification re-reads it (the shared mock receipt has no Approval event),
  // so the mock must reflect that transition or every test would throw the
  // approval-not-confirmed error.
  let simulatedAllowance: bigint;

  /**
   * Override the simulated on-chain allowance for the current test. Use this
   * instead of `mockGetERC20Allowance.mockResolvedValue(X)` so that
   * approveERC20 calls still update the value (mimicking real chain state).
   */
  const setSimulatedAllowance = (value: bigint) => {
    simulatedAllowance = value;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    simulatedAllowance = 0n;
    mockGetERC20Allowance.mockImplementation(async () => simulatedAllowance);
    mockApproveERC20.mockImplementation(
      async (
        _walletClient: unknown,
        _chain: unknown,
        _tokenAddress: unknown,
        _spenderAddress: unknown,
        amount: bigint,
      ) => {
        simulatedAllowance = amount;
        return mockTxResult;
      },
    );
    mockBorrowFromCorePosition.mockResolvedValue(mockTxResult);
    mockRepayToCorePosition.mockResolvedValue(mockTxResult);
    mockWithdrawCollaterals.mockResolvedValue(mockTxResult);
    mockGetCoreSpokeAddress.mockResolvedValue("0xspoke");
    // vi.clearAllMocks does not clear mockReturnValue overrides; pin the
    // default so per-describe overrides can't leak into later suites.
    (getAaveAdapterAddress as Mock).mockReturnValue("0xadapter");
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
      // Global default already starts simulatedAllowance at 0; only the
      // balance needs to be set here.
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
        mockToken,
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
      setSimulatedAllowance(amount + 1000n);

      await repayPartial(
        mockWalletClient,
        mockChain,
        1n,
        "0xtoken" as any,
        amount,
        mockToken,
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
          1n,
          "0xtoken" as any,
          1000n,
          mockToken,
        ),
      ).rejects.toThrow("Wallet address not available");
    });
  });

  // ============================================================================
  // repayMaxCapped
  // ============================================================================
  describe("repayMaxCapped", () => {
    // Global default already starts simulatedAllowance at 0; no per-block
    // setup needed.

    it("should approve the full balance as the cap and send the repay-all sentinel", async () => {
      const balanceAmount = 200_000_000n;

      await repayMaxCapped(
        mockWalletClient,
        mockChain,
        1n,
        "0xtoken" as any,
        balanceAmount,
        mockToken,
      );

      // Approve exactly the cap (the user's balance), not cap × (1+buffer).
      expect(mockApproveERC20).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xtoken",
        "0xadapter",
        balanceAmount,
      );

      // Send maxUint256 so the adapter clears the full current debt (including
      // interest accrued during broadcast), capped by the approved balance.
      expect(mockRepayToCorePosition).toHaveBeenCalledWith(
        mockWalletClient,
        mockChain,
        "0xadapter",
        "0xuser",
        1n,
        maxUint256,
      );
    });

    it("should skip approval when allowance is sufficient", async () => {
      const balanceAmount = 200_000_000n;
      setSimulatedAllowance(balanceAmount + 1n);

      await repayMaxCapped(
        mockWalletClient,
        mockChain,
        1n,
        "0xtoken" as any,
        balanceAmount,
        mockToken,
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
        mockToken,
      );

      expect(mockGetUserTotalDebt).not.toHaveBeenCalled();
    });

    it("should throw error when balanceAmount is 0", async () => {
      await expect(
        repayMaxCapped(
          mockWalletClient,
          mockChain,
          1n,
          "0xtoken" as any,
          0n,
          mockToken,
        ),
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
          mockToken,
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
      // Global default already starts simulatedAllowance at 0.
      mockGetUserTotalDebt.mockResolvedValue(defaultDebt);
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
        mockToken,
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
        mockToken,
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
      setSimulatedAllowance(amountToRepay + 1000n);

      await repayFull(
        mockWalletClient,
        mockChain,
        1n,
        "0xtoken" as any,
        "0xproxy" as any,
        mockToken,
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
          mockToken,
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
          mockToken,
        ),
      ).rejects.toThrow(
        "insufficient balance to fully repay: not enough stablecoin to cover the debt plus interest",
      );
    });

    it("throws when the fallback allowance verification exhausts its retries", async () => {
      // approveERC20 succeeds but its receipt carries no Approval event and
      // every allowance read keeps returning the stale pre-approve value —
      // the flow retries the read a bounded number of times, then surfaces a
      // clear error instead of letting the user sign a doomed repay tx.
      vi.useFakeTimers();
      try {
        mockApproveERC20.mockReset();
        mockApproveERC20.mockResolvedValue(mockTxResult);

        const result = repayFull(
          mockWalletClient,
          mockChain,
          1n,
          "0xtoken" as any,
          "0xproxy" as any,
          mockToken,
        );
        const assertion = expect(result).rejects.toThrow(
          /approval could not be confirmed/i,
        );
        await vi.runAllTimersAsync();
        await assertion;

        // Bounded budget: 1 short-circuit read + exactly 3 verification reads.
        expect(mockGetERC20Allowance).toHaveBeenCalledTimes(4);
        // Crucially, the repay was never broadcast — the user would have
        // signed a doomed tx if we'd skipped the verification.
        expect(mockRepayToCorePosition).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
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
          mockToken,
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
          mockToken,
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

  // ============================================================================
  // approval verification from the approve receipt's Approval event
  // ============================================================================
  describe("receipt-event approval verification", () => {
    const TOKEN = "0x1000000000000000000000000000000000000001";
    const OWNER = "0x2000000000000000000000000000000000000002";
    const ADAPTER = "0x3000000000000000000000000000000000000003";

    const APPROVAL_EVENT_ABI = [
      {
        type: "event",
        name: "Approval",
        inputs: [
          { indexed: true, name: "owner", type: "address" },
          { indexed: true, name: "spender", type: "address" },
          { indexed: false, name: "value", type: "uint256" },
        ],
      },
    ] as const;

    const approvalLog = (value: bigint) => ({
      address: TOKEN,
      topics: encodeEventTopics({
        abi: APPROVAL_EVENT_ABI,
        eventName: "Approval",
        args: { owner: OWNER, spender: ADAPTER },
      }),
      data: numberToHex(value, { size: 32 }),
    });

    const ownerWallet = { account: { address: OWNER } } as any;

    beforeEach(() => {
      (getAaveAdapterAddress as Mock).mockReturnValue(ADAPTER);
      mockGetERC20Balance.mockResolvedValue(2000000n);
    });

    it("verifies from the receipt's Approval event without re-reading allowance", async () => {
      const amount = 1000000n;
      mockApproveERC20.mockResolvedValue({
        transactionHash: "0xhash",
        receipt: { status: "success", logs: [approvalLog(amount)] },
      });

      await repayPartial(
        ownerWallet,
        mockChain,
        1n,
        TOKEN as any,
        amount,
        mockToken,
      );

      // Exactly one allowance read: the pre-approve short-circuit check.
      // The verification came from the receipt, immune to stale RPC reads.
      expect(mockGetERC20Allowance).toHaveBeenCalledTimes(1);
      expect(mockRepayToCorePosition).toHaveBeenCalled();
    });

    it("rejects without retries when the approved value is below the requirement", async () => {
      // e.g. the user edited the wallet's spending cap below the repay amount.
      const amount = 1000000n;
      mockApproveERC20.mockResolvedValue({
        transactionHash: "0xhash",
        receipt: { status: "success", logs: [approvalLog(amount - 1n)] },
      });

      await expect(
        repayPartial(
          ownerWallet,
          mockChain,
          1n,
          TOKEN as any,
          amount,
          mockToken,
        ),
      ).rejects.toThrow(/approved a lower amount than required/i);

      expect(mockGetERC20Allowance).toHaveBeenCalledTimes(1);
      expect(mockRepayToCorePosition).not.toHaveBeenCalled();
    });

    it("ignores foreign and mismatched logs and verifies from the LAST matching Approval", async () => {
      const amount = 1000000n;
      const FOREIGN_TOKEN = "0x9000000000000000000000000000000000000009";
      const OTHER_SPENDER = "0x4000000000000000000000000000000000000004";
      const OTHER_OWNER = "0x5000000000000000000000000000000000000005";
      // A Safe-style batched receipt. Hostile sufficient-value logs sit both
      // BEFORE and AFTER the matching pair: dropping any filter predicate
      // (token, owner, spender) makes a trailing hostile log the last match
      // and flips this test's outcome — each predicate is load-bearing.
      const erc721StyleLog = {
        address: TOKEN,
        topics: [
          ...encodeEventTopics({
            abi: APPROVAL_EVENT_ABI,
            eventName: "Approval",
            args: { owner: OWNER, spender: ADAPTER },
          }),
          numberToHex(7n, { size: 32 }),
        ],
        data: "0x",
      };
      mockApproveERC20.mockResolvedValue({
        transactionHash: "0xhash",
        receipt: {
          status: "success",
          logs: [
            { ...approvalLog(amount * 10n), address: FOREIGN_TOKEN },
            erc721StyleLog,
            {
              address: TOKEN,
              topics: encodeEventTopics({
                abi: APPROVAL_EVENT_ABI,
                eventName: "Approval",
                args: { owner: OWNER, spender: OTHER_SPENDER },
              }),
              data: numberToHex(amount * 10n, { size: 32 }),
            },
            approvalLog(amount),
            approvalLog(amount - 1n),
            { ...approvalLog(amount * 10n), address: FOREIGN_TOKEN },
            {
              address: TOKEN,
              topics: encodeEventTopics({
                abi: APPROVAL_EVENT_ABI,
                eventName: "Approval",
                args: { owner: OWNER, spender: OTHER_SPENDER },
              }),
              data: numberToHex(amount * 10n, { size: 32 }),
            },
            {
              address: TOKEN,
              topics: encodeEventTopics({
                abi: APPROVAL_EVENT_ABI,
                eventName: "Approval",
                args: { owner: OTHER_OWNER, spender: ADAPTER },
              }),
              data: numberToHex(amount * 10n, { size: 32 }),
            },
          ],
        },
      });

      await expect(
        repayPartial(
          ownerWallet,
          mockChain,
          1n,
          TOKEN as any,
          amount,
          mockToken,
        ),
      ).rejects.toThrow(/approved a lower amount than required/i);

      // Verified from the last MATCHING log (amount - 1n), not the foreign,
      // ERC-721-shaped, wrong-spender, or earlier sufficient logs.
      expect(mockRepayToCorePosition).not.toHaveBeenCalled();
      expect(mockGetERC20Allowance).toHaveBeenCalledTimes(1);
    });

    it("recovers when the fallback allowance re-read succeeds on a later attempt", async () => {
      vi.useFakeTimers();
      try {
        const amount = 1000000n;
        // No Approval event in the receipt (e.g. wallet-replaced tx) and the
        // first verification read is still stale; the second sees the value.
        mockApproveERC20.mockResolvedValue({
          transactionHash: "0xhash",
          receipt: { status: "success", logs: [] },
        });
        mockGetERC20Allowance.mockReset();
        mockGetERC20Allowance
          .mockResolvedValueOnce(0n) // pre-approve short-circuit check
          .mockResolvedValueOnce(0n) // verification attempt 1 (stale)
          .mockResolvedValue(amount); // verification attempt 2

        const result = repayPartial(
          ownerWallet,
          mockChain,
          1n,
          TOKEN as any,
          amount,
          mockToken,
        );
        const assertion = expect(result).resolves.toMatchObject({
          transactionHash: "0xhash",
        });
        await vi.runAllTimersAsync();
        await assertion;

        expect(mockGetERC20Allowance).toHaveBeenCalledTimes(3);
        expect(mockRepayToCorePosition).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ============================================================================
  // stale-simulation repay retry
  // ============================================================================
  describe("stale-simulation repay retry", () => {
    const staleSimulationError = () =>
      tagSimulationPhase(
        new ContractError(
          "execution reverted",
          ErrorCode.CONTRACT_REVERT,
          undefined,
          "ERC20InsufficientAllowance",
        ),
      );

    beforeEach(() => {
      mockGetERC20Balance.mockResolvedValue(2000000n);
    });

    it("retries once after a stale simulation revert when the approve was short-circuited", async () => {
      vi.useFakeTimers();
      try {
        setSimulatedAllowance(2000000n);
        mockRepayToCorePosition
          .mockRejectedValueOnce(staleSimulationError())
          .mockResolvedValue(mockTxResult);

        const result = repayPartial(
          mockWalletClient,
          mockChain,
          1n,
          "0xtoken" as any,
          1000000n,
          mockToken,
        );
        const assertion = expect(result).resolves.toMatchObject({
          transactionHash: "0xhash",
        });
        await vi.runAllTimersAsync();
        await assertion;

        expect(mockRepayToCorePosition).toHaveBeenCalledTimes(2);
        expect(mockApproveERC20).not.toHaveBeenCalled();
        // Each absorbed retry is observable — the rescue must not be silent.
        expect(logger.warn).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("forces an approve after a second stale failure on the short-circuit path", async () => {
      vi.useFakeTimers();
      try {
        // The stale-HIGH read scenario: the short-circuit saw enough
        // allowance, but the chain disagrees on every simulation.
        setSimulatedAllowance(2000000n);
        mockRepayToCorePosition
          .mockRejectedValueOnce(staleSimulationError())
          .mockRejectedValueOnce(staleSimulationError())
          .mockResolvedValue(mockTxResult);

        const result = repayPartial(
          mockWalletClient,
          mockChain,
          1n,
          "0xtoken" as any,
          1000000n,
          mockToken,
        );
        const assertion = expect(result).resolves.toMatchObject({
          transactionHash: "0xhash",
        });
        await vi.runAllTimersAsync();
        await assertion;

        expect(mockRepayToCorePosition).toHaveBeenCalledTimes(3);
        expect(mockApproveERC20).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not retry a mined allowance revert", async () => {
      setSimulatedAllowance(2000000n);
      // Same decoded reason but NOT simulation-tagged: the tx was broadcast
      // and reverted on-chain. Auto-retrying would re-prompt the wallet.
      mockRepayToCorePosition.mockRejectedValue(
        new ContractError(
          "execution reverted",
          ErrorCode.CONTRACT_REVERT,
          undefined,
          "ERC20InsufficientAllowance",
        ),
      );

      await expect(
        repayPartial(
          mockWalletClient,
          mockChain,
          1n,
          "0xtoken" as any,
          1000000n,
          mockToken,
        ),
      ).rejects.toThrow("execution reverted");

      expect(mockRepayToCorePosition).toHaveBeenCalledTimes(1);
    });

    it("gives up after three attempts when the approve was already sent", async () => {
      vi.useFakeTimers();
      try {
        // Allowance starts short, so ensureAllowance sends the approve; a
        // forced re-approve could not change anything, so the third attempt
        // is a plain re-simulation and then the error propagates.
        mockRepayToCorePosition.mockRejectedValue(staleSimulationError());

        const result = repayPartial(
          mockWalletClient,
          mockChain,
          1n,
          "0xtoken" as any,
          1000000n,
          mockToken,
        );
        const assertion = expect(result).rejects.toThrow("execution reverted");
        await vi.runAllTimersAsync();
        await assertion;

        expect(mockRepayToCorePosition).toHaveBeenCalledTimes(3);
        expect(mockApproveERC20).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("forces the balance-cap approve amount for repayMaxCapped on the short-circuit path", async () => {
      vi.useFakeTimers();
      try {
        const balanceAmount = 1500000n;
        setSimulatedAllowance(balanceAmount);
        mockRepayToCorePosition
          .mockRejectedValueOnce(staleSimulationError())
          .mockRejectedValueOnce(staleSimulationError())
          .mockResolvedValue(mockTxResult);

        const result = repayMaxCapped(
          mockWalletClient,
          mockChain,
          1n,
          "0xtoken" as any,
          balanceAmount,
          mockToken,
        );
        const assertion = expect(result).resolves.toMatchObject({
          transactionHash: "0xhash",
        });
        await vi.runAllTimersAsync();
        await assertion;

        // The forced approve re-approves the balance cap, not maxUint256.
        expect(mockApproveERC20).toHaveBeenCalledTimes(1);
        expect(mockApproveERC20).toHaveBeenCalledWith(
          mockWalletClient,
          mockChain,
          "0xtoken",
          "0xadapter",
          balanceAmount,
        );
        expect(mockRepayToCorePosition).toHaveBeenCalledTimes(3);
        // Every attempt sends the repay-all sentinel.
        expect(mockRepayToCorePosition).toHaveBeenLastCalledWith(
          mockWalletClient,
          mockChain,
          "0xadapter",
          "0xuser",
          1n,
          maxUint256,
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
