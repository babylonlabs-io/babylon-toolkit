/**
 * Hook for withdraw collateral transaction
 *
 * Handles withdrawing all collateral from an Aave position.
 * Position must have zero debt before withdrawal.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";

import { useError } from "@/context/error";
import {
  ErrorCode,
  WalletError,
  mapViemErrorToContractError,
} from "@/utils/errors";

import { withdrawAllCollateral } from "../services";

export interface UseWithdrawCollateralTransactionResult {
  /**
   * Execute the withdraw collateral transaction
   * Withdraws all collateral from the position
   */
  executeWithdraw: () => Promise<boolean>;
  /** Whether transaction is currently processing */
  isProcessing: boolean;
}

/**
 * Hook for executing withdraw collateral transactions
 *
 * Handles:
 * 1. Wallet validation
 * 2. Withdraw transaction execution
 * 3. Cache invalidation on success
 */
export function useWithdrawCollateralTransaction(): UseWithdrawCollateralTransactionResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const chain = walletClient?.chain;
  const { handleError } = useError();

  const executeWithdraw = useCallback(async () => {
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

      // Execute the withdraw transaction
      await withdrawAllCollateral(walletClient, chain);

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({
        queryKey: ["aaveUserPosition", address],
      });
      await queryClient.invalidateQueries({
        queryKey: ["vaults", address],
      });

      return true;
    } catch (error) {
      console.error("Withdraw collateral failed:", error);

      const mappedError =
        error instanceof Error
          ? mapViemErrorToContractError(error, "Withdraw Collateral")
          : new Error(
              "An unexpected error occurred while withdrawing collateral",
            );

      handleError({
        error: mappedError,
        displayOptions: {
          showModal: true,
        },
      });

      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [walletClient, chain, address, queryClient, handleError]);

  return {
    executeWithdraw,
    isProcessing,
  };
}
