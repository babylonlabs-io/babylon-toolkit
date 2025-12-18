/**
 * Hook for add collateral transaction
 * Handles the transaction execution for adding vaults as collateral
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { useError } from "../../../context/error";
import {
  ErrorCode,
  WalletError,
  mapViemErrorToContractError,
} from "../../../utils/errors";
import { invalidateVaultQueries } from "../../../utils/queryKeys";
import { usePendingVaults } from "../context";
import { addCollateral } from "../services";

export interface UseAddCollateralTransactionResult {
  /** Execute the add collateral transaction */
  executeAddCollateral: (vaultIds: string[]) => Promise<boolean>;
  /** Whether transaction is currently processing */
  isProcessing: boolean;
}

/**
 * Hook for executing add collateral transactions
 *
 * Returns the transaction handler and processing state.
 * Handles wallet validation, error mapping, and cache invalidation.
 */
export function useAddCollateralTransaction(): UseAddCollateralTransactionResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const chain = walletClient?.chain;
  const { handleError } = useError();
  const { markVaultsAsPending } = usePendingVaults();

  const executeAddCollateral = useCallback(
    async (vaultIds: string[]) => {
      if (vaultIds.length === 0) return false;

      setIsProcessing(true);
      try {
        // Validate wallet connection
        if (!walletClient || !chain) {
          throw new WalletError(
            "Please connect your wallet to continue",
            ErrorCode.WALLET_NOT_CONNECTED,
          );
        }

        // Execute the add collateral transaction
        await addCollateral(walletClient, chain, vaultIds as Hex[]);

        // Mark vaults as pending to prevent re-selection before indexer updates
        markVaultsAsPending(vaultIds);

        // Invalidate vault-related queries to refresh from indexer
        await invalidateVaultQueries(queryClient, address as Address);

        return true;
      } catch (error) {
        console.error("Add collateral failed:", error);

        const mappedError =
          error instanceof Error
            ? mapViemErrorToContractError(error, "Add Collateral")
            : new Error("An unexpected error occurred while adding collateral");

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
    },
    [
      walletClient,
      chain,
      address,
      queryClient,
      handleError,
      markVaultsAsPending,
    ],
  );

  return {
    executeAddCollateral,
    isProcessing,
  };
}
