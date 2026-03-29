/**
 * Hook for reordering vaults on-chain.
 *
 * Calls reorderVaults(bytes32[]) on the AaveIntegrationAdapter
 * to change the prefix ordering for liquidation priority.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { useError } from "@/context/error";
import { logger } from "@/infrastructure";
import {
  ErrorCode,
  WalletError,
  mapViemErrorToContractError,
} from "@/utils/errors";
import { invalidateVaultQueries } from "@/utils/queryKeys";

import { reorderVaultOrder } from "../services";

export interface UseReorderVaultsResult {
  /** Execute the reorder transaction */
  executeReorder: (permutedVaultIds: string[]) => Promise<boolean>;
  /** Whether transaction is currently processing */
  isProcessing: boolean;
}

/**
 * Hook for executing vault reorder transactions.
 *
 * Handles:
 * 1. Wallet validation
 * 2. Reorder transaction execution
 * 3. Cache invalidation on success (vault order + vault queries)
 */
export function useReorderVaults(): UseReorderVaultsResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const chain = walletClient?.chain;
  const { handleError } = useError();

  const executeReorder = useCallback(
    async (permutedVaultIds: string[]) => {
      setIsProcessing(true);
      try {
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

        await reorderVaultOrder(walletClient, chain, permutedVaultIds as Hex[]);

        // Invalidate vault order query to refetch from contract
        await queryClient.invalidateQueries({
          queryKey: ["vaultOrder", address],
        });

        // Invalidate vault-related queries
        await invalidateVaultQueries(queryClient, address as Address);

        return true;
      } catch (error) {
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          { data: { context: "Reorder vaults failed" } },
        );
        const mappedError =
          error instanceof Error
            ? mapViemErrorToContractError(error, "Reorder Vaults")
            : new Error("An unexpected error occurred while reordering vaults");

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
    [walletClient, chain, address, queryClient, handleError],
  );

  return {
    executeReorder,
    isProcessing,
  };
}
