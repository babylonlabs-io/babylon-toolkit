/**
 * Hook for repay transaction handler
 * Handles the repay flow logic and transaction execution
 */

import { useQueryClient } from "@tanstack/react-query";
import { type Address, parseUnits } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { CONTRACTS } from "../../../../../config/contracts";
import { useError } from "../../../../../context/error";
import {
  ErrorCode,
  WalletError,
  mapViemErrorToContractError,
} from "../../../../../utils/errors";
import { invalidateVaultQueries } from "../../../../../utils/queryKeys";
import {
  approveLoanTokenForRepay,
  repayDebtFull,
  repayDebtPartial,
  withdrawAllCollateralFromPosition,
} from "../../../services";

interface UseRepayTransactionProps {
  hasPosition: boolean;
  userPosition: {
    positionId: string;
    marketId: string;
  } | null;
  currentLoanAmount: number;
  currentCollateralAmount: number;
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
  currentCollateralAmount,
  refetch,
  onRepaySuccess,
  setProcessing,
}: UseRepayTransactionProps): UseRepayTransactionResult {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const chain = walletClient?.chain;
  const { handleError } = useError();

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
          throw new WalletError(
            "Please connect your wallet to continue",
            ErrorCode.WALLET_NOT_CONNECTED,
          );
        }

        // Validate at least one action is requested
        if (repayAmount <= 0 && withdrawAmount <= 0) {
          throw new Error("Please enter an amount to repay or withdraw.");
        }

        const { positionId, marketId } = userPosition;

        // Validate there's collateral to withdraw
        if (withdrawAmount > 0 && currentCollateralAmount <= 0) {
          throw new Error(
            "No collateral available to withdraw. The position has no collateral.",
          );
        }

        // Validate withdrawal: can only withdraw if there's no debt
        // (or if repaying to zero in the same transaction)
        if (withdrawAmount > 0 && currentLoanAmount > 0) {
          const willRepayFull =
            repayAmount > 0 && Math.abs(repayAmount - currentLoanAmount) < 0.01;

          if (!willRepayFull) {
            throw new Error(
              "Cannot withdraw collateral while there's outstanding debt. " +
                `Current debt: ${currentLoanAmount.toFixed(2)} USDC. ` +
                "Please repay all debt first, then withdraw collateral.",
            );
          }
        }

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
              CONTRACTS.MORPHO_CONTROLLER,
              positionId as `0x${string}`,
              marketId,
            );
          } else {
            const repayAmountBigint = parseUnits(repayAmount.toString(), 6);

            await repayDebtPartial(
              walletClient,
              chain,
              CONTRACTS.MORPHO_CONTROLLER,
              positionId as `0x${string}`,
              marketId,
              repayAmountBigint,
            );
          }
        }

        // Step 2: Withdraw collateral (if user wants to withdraw)
        if (withdrawAmount > 0) {
          // Note: withdrawAllCollateralFromPosition withdraws ALL collateral
          // The contract will revert if there's any outstanding debt
          // We can only withdraw after debt is fully repaid

          try {
            await withdrawAllCollateralFromPosition(
              walletClient,
              chain,
              CONTRACTS.MORPHO_CONTROLLER,
              marketId,
            );
          } catch (error) {
            // Provide more helpful error message
            if (error instanceof Error) {
              const errorMessage = error.message.toLowerCase();
              if (
                errorMessage.includes("internal json-rpc error") ||
                errorMessage.includes("execution reverted")
              ) {
                throw new Error(
                  "Cannot withdraw collateral. This usually means there's still outstanding debt on the position. " +
                    "Please ensure all debt is repaid before withdrawing collateral. " +
                    "Note: Interest may have accrued between repayment and withdrawal.",
                );
              }
            }
            throw error;
          }
        }

        // Step 3: Refetch position data to update UI
        await refetch();

        // Invalidate vault-related queries to update availability and usage status
        await invalidateVaultQueries(queryClient, address as Address);

        // Success - show success modal
        onRepaySuccess();
      } catch (error) {
        console.error("Repayment failed:", error);

        const mappedError =
          error instanceof Error
            ? mapViemErrorToContractError(error, "Repay")
            : new Error("An unexpected error occurred during repayment");

        handleError({
          error: mappedError,
          displayOptions: {
            showModal: true,
            retryAction: () => handleConfirmRepay(repayAmount, withdrawAmount),
          },
        });
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
