/**
 * Hook for repay transaction handler
 * Handles the repay flow logic and transaction execution
 */

import { parseUnits } from "viem";
import { useWalletClient } from "wagmi";

import { CONTRACTS } from "../../../../config/contracts";
import {
  approveLoanTokenForRepay,
  repayDebtFull,
  repayDebtPartial,
  withdrawCollateralFromPosition,
} from "../../../../services/position/positionTransactionService";

interface UseRepayTransactionProps {
  hasPosition: boolean;
  userPosition: {
    positionId: string;
    marketId: string;
  } | null;
  currentLoanAmount: number;
  refetch: () => Promise<void>;
  onRepaySuccess: () => void;
  setProcessing: (processing: boolean) => void;
}

export interface UseRepayTransactionResult {
  handleConfirmRepay: (
    repayAmount: number,
    withdrawAmount: number,
  ) => Promise<void>;
}

/**
 * Handles repay transaction logic
 */
export function useRepayTransaction({
  hasPosition,
  userPosition,
  currentLoanAmount,
  refetch,
  onRepaySuccess,
  setProcessing,
}: UseRepayTransactionProps): UseRepayTransactionResult {
  const { data: walletClient } = useWalletClient();
  const chain = walletClient?.chain;

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

        // Validate at least one action is requested
        if (repayAmount <= 0 && withdrawAmount <= 0) {
          throw new Error("Please enter an amount to repay or withdraw.");
        }

        const { positionId, marketId } = userPosition;

        // Step 1: Repay debt (if user wants to repay)
        if (repayAmount > 0) {
          // Approve USDC spending for repayment
          await approveLoanTokenForRepay(walletClient, chain, marketId);

          // Determine if this is a full or partial repayment
          const tolerance = 0.01; // 0.01 USDC tolerance
          const isFullRepayment =
            Math.abs(repayAmount - currentLoanAmount) < tolerance;

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
        }

        // Step 2: Withdraw collateral (if user wants to withdraw)
        if (withdrawAmount > 0) {
          await withdrawCollateralFromPosition(
            walletClient,
            chain,
            CONTRACTS.VAULT_CONTROLLER,
            marketId,
          );
        }

        // Step 3: Refetch position data to update UI
        await refetch();

        // Success - show success modal
        onRepaySuccess();
      } catch (error) {
        console.error("Repayment failed:", error);
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
    handleConfirmRepay,
  };
}
