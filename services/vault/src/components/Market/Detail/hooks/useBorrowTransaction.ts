/**
 * Hook for borrow transaction handler
 * Handles the borrow flow logic and transaction execution
 */

import { useQueryClient } from "@tanstack/react-query";
import { parseUnits, type Hex } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { BTCVaultsManager } from "../../../../clients/eth-contract";
import {
  getVaultUsageStatusBulk,
  VaultUsageStatus,
} from "../../../../clients/eth-contract/morpho-controller/query";
import { CONTRACTS } from "../../../../config/contracts";
import { useError } from "../../../../context/error";
import {
  addCollateralWithMarketId,
  borrowMoreFromPosition,
} from "../../../../services/position/positionTransactionService";
import {
  ErrorCode,
  WalletError,
  mapViemErrorToContractError,
} from "../../../../utils/errors";
import { findVaultIndicesForAmount } from "../../../../utils/subsetSum";

interface AvailableVault {
  txHash: string;
  amountSatoshis: bigint;
}

interface UseBorrowTransactionProps {
  hasPosition: boolean;
  marketId: string | undefined;
  availableVaults: AvailableVault[];
  refetch: () => Promise<void>;
  onBorrowSuccess: () => void;
  setProcessing: (processing: boolean) => void;
}

export interface UseBorrowTransactionResult {
  handleConfirmBorrow: (
    collateralBTC: number,
    borrowUSDC: number,
  ) => Promise<void>;
}

/**
 * Handles borrow transaction logic
 */
export function useBorrowTransaction({
  hasPosition,
  marketId,
  availableVaults,
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
    collateralBTC: number,
    borrowUSDC: number,
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
      if (collateralBTC <= 0 && borrowUSDC <= 0) {
        throw new Error(
          "Either collateral amount or borrow amount must be greater than 0",
        );
      }

      // Convert borrow amount from USDC to bigint (6 decimals) - only if borrowing
      const borrowAmountBigint =
        borrowUSDC > 0 ? parseUnits(borrowUSDC.toString(), 6) : undefined;

      if (collateralBTC > 0) {
        // Case 1: Add new collateral (with optional borrowing)
        // Convert collateral from BTC to satoshis
        const collateralSatoshis = BigInt(Math.round(collateralBTC * 1e8));

        // Find which vaults to use for this collateral amount
        const vaultAmounts = availableVaults.map((v) => v.amountSatoshis);
        const vaultIndices = findVaultIndicesForAmount(
          vaultAmounts,
          collateralSatoshis,
        );

        if (!vaultIndices) {
          throw new Error(
            `Cannot find vault combination for ${collateralBTC} BTC. Please select a different amount.`,
          );
        }

        // Get txHashes for selected vaults
        const pegInTxHashes = vaultIndices.map(
          (i) => availableVaults[i].txHash as Hex,
        );

        // Validate vault statuses
        const [vaultStatuses, usageStatuses] = await Promise.all([
          Promise.all(
            pegInTxHashes.map((txHash) =>
              BTCVaultsManager.getPeginRequest(
                CONTRACTS.BTC_VAULTS_MANAGER,
                txHash,
              ),
            ),
          ),
          getVaultUsageStatusBulk(CONTRACTS.MORPHO_CONTROLLER, pegInTxHashes),
        ]);

        const invalidVaults = vaultStatuses
          .map((v, index) => ({
            status: v.status,
            usageStatus: usageStatuses[index],
            index,
          }))
          .filter(
            (v) =>
              v.status !== 2 || v.usageStatus !== VaultUsageStatus.Available,
          );

        if (invalidVaults.length > 0) {
          throw new Error(
            `Selected vaults are not available for borrowing. Please refresh and try again.`,
          );
        }

        await addCollateralWithMarketId(
          walletClient,
          chain,
          CONTRACTS.MORPHO_CONTROLLER,
          pegInTxHashes,
          marketId,
          borrowAmountBigint,
        );
      } else if (borrowUSDC > 0) {
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
          borrowAmountBigint!,
        );
      } else {
        // This should never happen due to validation above, but just in case
        throw new Error(
          "Invalid operation: Cannot proceed without collateral or borrow amount",
        );
      }

      // Refetch position data to update UI
      await refetch();

      // Invalidate available collaterals query to refresh the list
      // This ensures vaults that were just added to the position are removed from available list
      await queryClient.invalidateQueries({
        queryKey: ["availableCollaterals", address],
      });

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
          retryAction: () => handleConfirmBorrow(collateralBTC, borrowUSDC),
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
