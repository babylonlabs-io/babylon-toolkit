/**
 * Hook for borrow and repay transaction handlers
 */

import { parseUnits } from "viem";
import { useWalletClient } from "wagmi";

import { CONTRACTS } from "../../../../config/contracts";
import {
  repayDebtFull,
  repayDebtPartial,
  withdrawCollateralFromPosition,
} from "../../../../services/position/positionTransactionService";

interface UseBorrowRepayTransactionsProps {
  hasPosition: boolean;
  userPosition: {
    positionId: string;
    marketId: string;
  } | null;
  currentLoanAmount: number;
  refetch: () => Promise<void>;
  onBorrowSuccess: () => void;
  onRepaySuccess: () => void;
  setProcessing: (processing: boolean) => void;
}

export interface UseBorrowRepayTransactionsResult {
  handleConfirmBorrow: () => Promise<void>;
  handleConfirmRepay: (
    repayAmount: number,
    withdrawAmount: number,
  ) => Promise<void>;
}

/**
 * Handles borrow and repay transaction logic
 */
export function useBorrowRepayTransactions({
  hasPosition,
  userPosition,
  currentLoanAmount,
  refetch,
  onBorrowSuccess,
  onRepaySuccess,
  setProcessing,
}: UseBorrowRepayTransactionsProps): UseBorrowRepayTransactionsResult {
  const { data: walletClient } = useWalletClient();
  const chain = walletClient?.chain;

  const handleConfirmBorrow = async () => {
    setProcessing(true);
    try {
      // TODO: Implement real borrow logic
      await new Promise((resolve) => setTimeout(resolve, 2000));
      onBorrowSuccess();
    } catch {
      // Handle error silently
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmRepay = async (
    repayAmount: number,
    withdrawAmount: number,
  ) => {
    // If user has a position, use real repay logic
    if (hasPosition && userPosition) {
      setProcessing(true);
      try {
        // Validate wallet connection
        if (!walletClient || !chain) {
          throw new Error("Wallet not connected. Please connect your wallet.");
        }

        const { positionId, marketId } = userPosition;

        // Determine if this is a full or partial repayment
        const tolerance = 0.01; // 0.01 USDC tolerance
        const isFullRepayment =
          Math.abs(repayAmount - currentLoanAmount) < tolerance;

        // Step 1: Repay debt
        if (isFullRepayment) {
          await repayDebtFull(
            walletClient,
            chain,
            CONTRACTS.VAULT_CONTROLLER,
            positionId as `0x${string}`,
            marketId,
          );
        } else {
          const repayAmountBigint = parseUnits(repayAmount.toString(), 6);

          await repayDebtPartial(
            walletClient,
            chain,
            CONTRACTS.VAULT_CONTROLLER,
            positionId as `0x${string}`,
            marketId,
            repayAmountBigint,
          );
        }

        // Step 2: Withdraw collateral if user requested it
        if (withdrawAmount > 0) {
          await withdrawCollateralFromPosition(
            walletClient,
            chain,
            CONTRACTS.VAULT_CONTROLLER,
            marketId,
          );
        }

        // Refetch position data to update UI
        await refetch();

        // Success - show success modal
        onRepaySuccess();
      } catch (error) {
        // Show error to user
        console.error("Repayment failed:", error);
        alert(
          `Repayment failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      } finally {
        setProcessing(false);
      }
    } else {
      // Market view - mock repay (user shouldn't actually reach here without position)
      setProcessing(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        onRepaySuccess();
      } finally {
        setProcessing(false);
      }
    }
  };

  return {
    handleConfirmBorrow,
    handleConfirmRepay,
  };
}
