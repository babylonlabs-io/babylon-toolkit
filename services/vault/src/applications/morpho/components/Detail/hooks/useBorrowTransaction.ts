/**
 * Hook for borrow transaction handler
 * Handles the borrow flow logic and transaction execution
 */

import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { CONTRACTS } from "../../../../../config/contracts";
import { useError } from "../../../../../context/error";
import {
  ErrorCode,
  WalletError,
  mapViemErrorToContractError,
} from "../../../../../utils/errors";
import { invalidateVaultQueries } from "../../../../../utils/queryKeys";
import { findVaultIndicesForAmount } from "../../../../../utils/subsetSum";
import {
  addCollateralWithMarketId,
  borrowMoreFromPosition,
} from "../../../services";

import type { BorrowableVault } from "./useVaultsForBorrowing";

interface UseBorrowTransactionProps {
  hasPosition: boolean;
  marketId: string | undefined;
  borrowableVaults: BorrowableVault[];
  refetch: () => Promise<void>;
  onBorrowSuccess: () => void;
  setProcessing: (processing: boolean) => void;
}

export interface UseBorrowTransactionResult {
  handleConfirmBorrow: (
    collateralSatoshis: bigint,
    borrowAmount: bigint,
  ) => Promise<void>;
}

/**
 * Handles borrow transaction logic
 */
export function useBorrowTransaction({
  hasPosition,
  marketId,
  borrowableVaults,
  refetch,
  onBorrowSuccess,
  setProcessing,
}: UseBorrowTransactionProps): UseBorrowTransactionResult {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const chain = walletClient?.chain;
  const { handleError } = useError();

  const handleConfirmBorrow = async (
    collateralSatoshis: bigint,
    borrowAmount: bigint,
  ) => {
    setProcessing(true);
    try {
      // Validate wallet connection
      if (!walletClient || !chain) {
        throw new WalletError(
          "Please connect your wallet to continue",
          ErrorCode.WALLET_NOT_CONNECTED,
        );
      }

      // Validate market ID
      if (!marketId) {
        throw new Error("Market ID is required for borrowing.");
      }

      // Validate at least one amount is provided
      if (collateralSatoshis <= 0n && borrowAmount <= 0n) {
        throw new Error(
          "Either collateral amount or borrow amount must be greater than 0",
        );
      }

      if (collateralSatoshis > 0n) {
        // Case 1: Add new collateral (with optional borrowing)
        // Find which vaults to use for this collateral amount
        const vaultAmounts = borrowableVaults.map((v) => v.amountSatoshis);
        const vaultIndices = findVaultIndicesForAmount(
          vaultAmounts,
          collateralSatoshis,
        );

        if (!vaultIndices) {
          throw new Error(
            `Cannot find vault combination for the requested amount. Please select a different amount.`,
          );
        }

        // Get txHashes for selected vaults
        const pegInTxHashes = vaultIndices.map(
          (i) => borrowableVaults[i].txHash as Hex,
        );

        await addCollateralWithMarketId(
          walletClient,
          chain,
          CONTRACTS.MORPHO_CONTROLLER,
          pegInTxHashes,
          marketId,
          borrowAmount > 0n ? borrowAmount : undefined,
        );
      } else if (borrowAmount > 0n) {
        // Case 2: Borrow more from existing position (no new collateral)
        if (!hasPosition) {
          throw new Error(
            "No existing position found. Please add collateral first.",
          );
        }

        await borrowMoreFromPosition(
          walletClient,
          chain,
          CONTRACTS.MORPHO_CONTROLLER,
          marketId,
          borrowAmount,
        );
      } else {
        // This should never happen due to validation above, but just in case
        throw new Error(
          "Invalid operation: Cannot proceed without collateral or borrow amount",
        );
      }

      // Refetch position data to update UI
      await refetch();

      // Invalidate vault-related queries to refresh available collateral and usage status
      await invalidateVaultQueries(queryClient, address as Address);

      // Success - show success modal
      onBorrowSuccess();
    } catch (error) {
      console.error("Borrow failed:", error);

      const mappedError =
        error instanceof Error
          ? mapViemErrorToContractError(error, "Borrow")
          : new Error("An unexpected error occurred during borrowing");

      handleError({
        error: mappedError,
        displayOptions: {
          showModal: true,
          retryAction: () =>
            handleConfirmBorrow(collateralSatoshis, borrowAmount),
        },
      });
    } finally {
      setProcessing(false);
    }
  };

  return {
    handleConfirmBorrow,
  };
}
