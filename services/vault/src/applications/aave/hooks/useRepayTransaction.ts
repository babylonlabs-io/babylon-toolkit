/**
 * Hook for repay transaction
 * Handles token approval and repay execution
 */

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address, Hex } from "viem";
import { maxUint256, parseUnits } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { ERC20 } from "@/clients/eth-contract";
import { useError } from "@/context/error";
import {
  ErrorCode,
  WalletError,
  mapViemErrorToContractError,
} from "@/utils/errors";

import { getAaveControllerAddress } from "../config";
import { approveForRepay, repay } from "../services";
import type { AaveReserveConfig } from "../services/fetchConfig";

export interface UseRepayTransactionProps {
  /** User's position ID (from useAaveUserPosition) */
  positionId: string | undefined;
}

export interface UseRepayTransactionResult {
  /**
   * Execute the repay transaction (handles approval if needed)
   * @param repayAmount - Amount to repay in token units (e.g., 100 for 100 USDC)
   * @param reserve - Reserve config for the debt token
   * @param isFullRepayment - If true, uses max uint256 to repay all debt including accrued interest
   */
  executeRepay: (
    repayAmount: number,
    reserve: AaveReserveConfig,
    isFullRepayment?: boolean,
  ) => Promise<boolean>;
  /** Whether transaction is currently processing */
  isProcessing: boolean;
}

/**
 * Hook for executing repay transactions
 *
 * Handles:
 * 1. Token approval for the controller contract
 * 2. Repay transaction execution
 * 3. Cache invalidation on success
 *
 * @param props.positionId - The user's position ID from useAaveUserPosition
 */
export function useRepayTransaction({
  positionId,
}: UseRepayTransactionProps): UseRepayTransactionResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const chain = walletClient?.chain;
  const { handleError } = useError();

  const executeRepay = async (
    repayAmount: number,
    reserve: AaveReserveConfig,
    isFullRepayment = false,
  ) => {
    if (repayAmount <= 0) return false;

    setIsProcessing(true);
    try {
      // Validate wallet connection
      if (!walletClient || !chain) {
        throw new WalletError(
          "Please connect your wallet to continue",
          ErrorCode.WALLET_NOT_CONNECTED,
        );
      }

      if (!address) {
        throw new WalletError(
          "Wallet address not available",
          ErrorCode.WALLET_NOT_CONNECTED,
        );
      }

      if (!positionId) {
        throw new Error("No position found. Cannot repay without a position.");
      }

      // Convert repay amount to token decimals
      const repayAmountBigInt = parseUnits(
        repayAmount.toString(),
        reserve.token.decimals,
      );

      const controllerAddress = getAaveControllerAddress();

      // Step 1: Check existing allowance and approve if needed
      // For full repayment, we need to approve max since the exact amount includes accrued interest
      const requiredAllowance = isFullRepayment
        ? maxUint256
        : repayAmountBigInt;
      const currentAllowance = await ERC20.getERC20Allowance(
        reserve.token.address,
        address as Address,
        controllerAddress,
      );

      if (currentAllowance < requiredAllowance) {
        await approveForRepay(walletClient, chain, reserve.reserveId);
      }

      // Step 2: Execute the repay transaction
      // For full repayment, pass max uint256 to repay all debt including accrued interest
      const amountToRepay = isFullRepayment ? maxUint256 : repayAmountBigInt;

      await repay(
        walletClient,
        chain,
        positionId as Hex,
        reserve.reserveId,
        amountToRepay,
      );

      // Invalidate position queries to refresh data
      await queryClient.invalidateQueries({
        queryKey: ["aaveUserPosition", address],
      });

      return true;
    } catch (error) {
      console.error("Repay failed:", error);

      const mappedError =
        error instanceof Error
          ? mapViemErrorToContractError(error, "Repay")
          : new Error("An unexpected error occurred while repaying");

      handleError({
        error: mappedError,
        displayOptions: {
          showModal: true,
          retryAction: () => executeRepay(repayAmount, reserve),
        },
      });

      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    executeRepay,
    isProcessing,
  };
}
