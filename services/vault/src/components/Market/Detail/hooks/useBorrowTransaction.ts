/**
 * Hook for borrow transaction handler
 * Handles the borrow flow logic and transaction execution
 */

import { parseUnits, type Hex } from "viem";
import { useWalletClient } from "wagmi";

import { BTCVaultsManager } from "../../../../clients/eth-contract";
import { CONTRACTS } from "../../../../config/contracts";
import {
  addCollateralWithMarketId,
  borrowMoreFromPosition,
} from "../../../../services/position/positionTransactionService";
import { findVaultIndicesForAmount } from "../../../../utils/subsetSum";

interface AvailableVault {
  txHash: string;
  amountSatoshis: bigint;
}

interface UseBorrowTransactionProps {
  hasPosition: boolean;
  marketId: string | undefined;
  availableVaults: AvailableVault[];
  lastBorrowData: {
    collateral: number;
    borrow: number;
  };
  refetch: () => Promise<void>;
  onBorrowSuccess: () => void;
  setProcessing: (processing: boolean) => void;
}

export interface UseBorrowTransactionResult {
  handleConfirmBorrow: () => Promise<void>;
}

/**
 * Handles borrow transaction logic
 */
export function useBorrowTransaction({
  hasPosition,
  marketId,
  availableVaults,
  lastBorrowData,
  refetch,
  onBorrowSuccess,
  setProcessing,
}: UseBorrowTransactionProps): UseBorrowTransactionResult {
  const { data: walletClient } = useWalletClient();
  const chain = walletClient?.chain;

  const handleConfirmBorrow = async () => {
    setProcessing(true);
    try {
      // Validate wallet connection
      if (!walletClient || !chain) {
        throw new Error("Wallet not connected. Please connect your wallet.");
      }

      // Validate market ID
      if (!marketId) {
        throw new Error("Market ID is required for borrowing.");
      }

      const { collateral: collateralBTC, borrow: borrowUSDC } = lastBorrowData;

      // Validate amounts
      if (borrowUSDC <= 0) {
        throw new Error("Borrow amount must be greater than 0");
      }

      // Convert borrow amount from USDC to bigint (6 decimals)
      const borrowAmountBigint = parseUnits(borrowUSDC.toString(), 6);

      if (collateralBTC > 0) {
        // Case 1: Add new collateral and borrow
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

        // Validate vault statuses before attempting to borrow
        const vaultStatuses = await Promise.all(
          pegInTxHashes.map((txHash) =>
            BTCVaultsManager.getPeginRequest(
              CONTRACTS.BTC_VAULTS_MANAGER,
              txHash,
            ),
          ),
        );

        // Check all vaults are in AVAILABLE status (status 2)
        const invalidVaults = vaultStatuses.filter((v) => v.status !== 2);
        if (invalidVaults.length > 0) {
          const statusNames = invalidVaults.map((v) =>
            v.status === 0
              ? "Pending"
              : v.status === 1
                ? "Verified"
                : v.status === 3
                  ? "InPosition"
                  : "Expired",
          );
          throw new Error(
            `Cannot borrow: ${invalidVaults.length} vault(s) are not in AVAILABLE status. Current statuses: ${statusNames.join(", ")}. Only vaults with AVAILABLE status (status 2) can be used for borrowing.`,
          );
        }

        await addCollateralWithMarketId(
          walletClient,
          chain,
          CONTRACTS.VAULT_CONTROLLER,
          pegInTxHashes,
          marketId,
          borrowAmountBigint,
        );
      } else {
        // Case 2: Borrow more from existing position (no new collateral)
        if (!hasPosition) {
          throw new Error(
            "No existing position found. Please add collateral first.",
          );
        }

        await borrowMoreFromPosition(
          walletClient,
          chain,
          CONTRACTS.VAULT_CONTROLLER,
          marketId,
          borrowAmountBigint,
        );
      }

      // Refetch position data to update UI
      await refetch();

      // Success - show success modal
      onBorrowSuccess();
    } catch (error) {
      // Log detailed error information for debugging
      console.error("Borrow failed:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : "Unknown error",
        cause: error instanceof Error ? error.cause : undefined,
        stack: error instanceof Error ? error.stack : undefined,
        fullError: error,
      });

      // TODO: Show error to user with proper error handling UI
    } finally {
      setProcessing(false);
    }
  };

  return {
    handleConfirmBorrow,
  };
}
