/**
 * Hook for borrow transaction
 * Handles the transaction execution for borrowing assets against collateral
 */

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Hex } from "viem";
import { parseUnits } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { useError } from "@/context/error";
import {
  ErrorCode,
  WalletError,
  mapViemErrorToContractError,
} from "@/utils/errors";

import { borrow } from "../services";
import type { AaveReserveConfig } from "../services/fetchConfig";

export interface UseBorrowTransactionProps {
  /** User's position ID (from useAaveUserPosition) */
  positionId: string | undefined;
}

export interface UseBorrowTransactionResult {
  /** Execute the borrow transaction */
  executeBorrow: (
    borrowAmount: number,
    reserve: AaveReserveConfig,
  ) => Promise<boolean>;
  /** Whether transaction is currently processing */
  isProcessing: boolean;
}

/**
 * Hook for executing borrow transactions
 *
 * Returns the transaction handler and processing state.
 * Handles wallet validation, error mapping, and cache invalidation.
 *
 * @param props.positionId - The user's position ID from useAaveUserPosition
 */
export function useBorrowTransaction({
  positionId,
}: UseBorrowTransactionProps): UseBorrowTransactionResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const chain = walletClient?.chain;
  const { handleError } = useError();

  const executeBorrow = async (
    borrowAmount: number,
    reserve: AaveReserveConfig,
  ) => {
    if (borrowAmount <= 0) return false;

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
        throw new Error(
          "No position found. Please add collateral before borrowing.",
        );
      }

      // Convert borrow amount to token decimals
      const borrowAmountBigInt = parseUnits(
        borrowAmount.toString(),
        reserve.token.decimals,
      );

      // Execute the borrow transaction
      await borrow(
        walletClient,
        chain,
        positionId as Hex,
        reserve.reserveId,
        borrowAmountBigInt,
      );

      // Invalidate position queries to refresh data
      await queryClient.invalidateQueries({
        queryKey: ["aaveUserPosition", address],
      });

      return true;
    } catch (error) {
      console.error("Borrow failed:", error);

      const mappedError =
        error instanceof Error
          ? mapViemErrorToContractError(error, "Borrow")
          : new Error("An unexpected error occurred while borrowing");

      handleError({
        error: mappedError,
        displayOptions: {
          showModal: true,
          retryAction: () => executeBorrow(borrowAmount, reserve),
        },
      });

      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    executeBorrow,
    isProcessing,
  };
}
