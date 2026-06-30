/**
 * Hook for withdraw collateral transaction
 *
 * Handles withdrawing selected collateral vaults from an Aave position.
 * Position must have zero debt before withdrawal.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { isWithdrawBlocked } from "@/components/shared/protocolStatus";
import { getETHChain } from "@/config/network";
import { useError } from "@/context/error";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { logger } from "@/infrastructure";
import {
  ErrorCode,
  WalletError,
  mapViemErrorToContractError,
} from "@/utils/errors";
import { invalidateVaultQueries } from "@/utils/queryKeys";

import { usePendingVaults } from "../context";
import { withdrawSelectedCollateral } from "../services";

export interface UseWithdrawCollateralTransactionResult {
  /**
   * Execute the withdraw collateral transaction
   * @param vaultIds - IDs of vaults currently used as collateral (to mark as pending)
   */
  executeWithdraw: (vaultIds: string[]) => Promise<boolean>;
  /** Whether transaction is currently processing */
  isProcessing: boolean;
}

/**
 * Hook for executing withdraw collateral transactions
 *
 * Handles:
 * 1. Wallet validation
 * 2. Withdraw transaction execution
 * 3. Marking vaults as pending withdrawal
 * 4. Cache invalidation on success
 */
export function useWithdrawCollateralTransaction(): UseWithdrawCollateralTransactionResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { handleError } = useError();
  const { markVaultsAsPending } = usePendingVaults();
  const gate = useProtocolGateState();

  const executeWithdraw = useCallback(
    async (vaultIds: string[]) => {
      // Withdraw is an EXIT: blocked only when either scope is paused (Freeze
      // preserves exits). Guard the execution chokepoint so a pause that lands
      // mid-session can't broadcast even if a modal was already open; the menu
      // item is disabled too.
      if (isWithdrawBlocked(gate)) return false;

      setIsProcessing(true);
      try {
        // Validate wallet connection
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

        // Execute selective withdraw transaction
        await withdrawSelectedCollateral(
          walletClient,
          getETHChain(),
          vaultIds as Hex[],
        );

        // Mark vaults as pending withdrawal before indexer updates
        if (vaultIds.length > 0) {
          markVaultsAsPending(vaultIds, "withdraw");
        }

        // Invalidate vault-related queries to refresh from indexer
        await invalidateVaultQueries(queryClient, address as Address);

        return true;
      } catch (error) {
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          { data: { context: "Withdraw collateral failed" } },
        );
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
    },
    [
      walletClient,
      address,
      queryClient,
      handleError,
      markVaultsAsPending,
      gate,
    ],
  );

  return {
    executeWithdraw,
    isProcessing,
  };
}
