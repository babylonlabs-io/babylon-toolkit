/**
 * Hook for reordering vaults on-chain.
 *
 * Calls reorderVaults(bytes32[]) on the AaveIntegrationAdapter
 * to change the prefix ordering for liquidation priority.
 */

import { getETHChain } from "@babylonlabs-io/config";
import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { useError } from "@/context/error";
import { logger } from "@/infrastructure";
import {
  ErrorCode,
  WalletError,
  mapViemErrorToContractError,
} from "@/utils/errors";

import { reorderVaultOrder } from "../services";

export interface UseReorderVaultsResult {
  /** Execute the reorder transaction */
  executeReorder: (permutedVaultIds: Hex[]) => Promise<boolean>;
  /** Whether transaction is currently processing */
  isProcessing: boolean;
}

/**
 * Hook for executing vault reorder transactions.
 *
 * Handles:
 * 1. Wallet validation
 * 2. Reorder transaction execution
 *
 * Cache invalidation is deferred to the success modal close handler
 * to give the indexer time to process the block.
 */
export function useReorderVaults(): UseReorderVaultsResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const { handleError } = useError();

  const executeReorder = useCallback(
    async (permutedVaultIds: Hex[]) => {
      setIsProcessing(true);
      try {
        if (!walletClient) {
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

        await reorderVaultOrder(walletClient, getETHChain(), permutedVaultIds);

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
    [walletClient, address, handleError],
  );

  return {
    executeReorder,
    isProcessing,
  };
}
