/**
 * Hook for repay transaction
 *
 * Thin wrapper around the repayDebt service function.
 * Manages React state and query invalidation.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { parseUnits } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { useError } from "@/context/error";
import {
  ErrorCode,
  WalletError,
  mapViemErrorToContractError,
} from "@/utils/errors";

import { useAaveConfig } from "../context";
import { repayFull, repayPartial } from "../services";
import type { AaveReserveConfig } from "../services/fetchConfig";

export interface UseRepayTransactionProps {
  /** User's proxy contract address (for debt queries) */
  proxyContract: string | undefined;
}

export interface UseRepayTransactionResult {
  /**
   * Execute the repay transaction (handles approval if needed)
   * @param repayAmount - Amount to repay in token units (e.g., 100 for 100 USDC)
   * @param reserve - Reserve config for the debt token
   * @param isFullRepayment - If true, fetches exact debt from contract and repays all
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
 * Delegates business logic to repayDebt service.
 * Handles React state, error handling, and cache invalidation.
 */
export function useRepayTransaction({
  proxyContract,
}: UseRepayTransactionProps): UseRepayTransactionResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const chain = walletClient?.chain;
  const { handleError } = useError();
  const { config } = useAaveConfig();

  const executeRepay = async (
    repayAmount: number,
    reserve: AaveReserveConfig,
    isFullRepayment = false,
  ) => {
    if (repayAmount <= 0) return false;

    setIsProcessing(true);
    try {
      // Validate prerequisites
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

      if (!config?.controllerAddress || !config?.btcVaultCoreSpokeAddress) {
        throw new Error("Aave config not available");
      }

      // Call appropriate service based on repayment type
      // The borrower address is resolved from the connected wallet (self-repay)
      if (isFullRepayment) {
        if (!proxyContract) {
          throw new Error(
            "Cannot perform full repayment: position data not available",
          );
        }

        await repayFull(
          walletClient,
          chain,
          config.controllerAddress as Address,
          reserve.reserveId,
          reserve.token.address,
          config.btcVaultCoreSpokeAddress as Address,
          proxyContract as Address,
        );
      } else {
        await repayPartial(
          walletClient,
          chain,
          config.controllerAddress as Address,
          reserve.reserveId,
          reserve.token.address,
          parseUnits(repayAmount.toString(), reserve.token.decimals),
        );
      }

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
