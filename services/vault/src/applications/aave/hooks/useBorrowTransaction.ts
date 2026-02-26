/**
 * Hook for borrow transaction
 * Handles the transaction execution for borrowing assets against collateral
 */

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
 * The controller resolves the borrower's proxy automatically from msg.sender.
 */
export function useBorrowTransaction(): UseBorrowTransactionResult {
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

      // Convert borrow amount to token decimals
      const borrowAmountBigInt = parseUnits(
        borrowAmount.toString(),
        reserve.token.decimals,
      );

      // Execute the borrow transaction
      // Controller resolves borrower's proxy from msg.sender
      await borrow(walletClient, chain, reserve.reserveId, borrowAmountBigInt);

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
