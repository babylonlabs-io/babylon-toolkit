/**
 * Hook for borrow transaction
 * Handles the transaction execution for borrowing assets against collateral
 */

import { getETHChain } from "@babylonlabs-io/config";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { ERC20 } from "@/clients/eth-contract";
import { useError } from "@/context/error";
import { logger } from "@/infrastructure";
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
    preSignValidation?: () => Promise<void>,
  ) => Promise<boolean>;
  /** Whether transaction is currently processing */
  isProcessing: boolean;
}

/**
 * Hook for executing borrow transactions
 *
 * Returns the transaction handler and processing state.
 * Handles wallet validation, error mapping, and cache invalidation.
 * The adapter resolves the borrower's proxy automatically from msg.sender.
 */
export function useBorrowTransaction(): UseBorrowTransactionResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const chain = getETHChain();
  const { handleError } = useError();

  const executeBorrow = async (
    borrowAmount: number,
    reserve: AaveReserveConfig,
    preSignValidation?: () => Promise<void>,
  ) => {
    if (borrowAmount <= 0) return false;

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

      // Fetch decimals on-chain to prevent a compromised GraphQL indexer from
      // supplying a falsified value that would cause parseUnits to produce a
      // materially different amount than the user intended.
      const onChainDecimals = await ERC20.getERC20Decimals(
        reserve.token.address,
      ).catch(() => {
        throw new Error(
          `Failed to fetch on-chain decimals for ${reserve.token.address}`,
        );
      });
      // Clamp toFixed precision to 15 to avoid IEEE 754 floating-point artifacts
      // (e.g. (0.1).toFixed(18) === "0.100000000000000006"). parseUnits handles
      // strings with fewer decimal places than the token's decimals correctly.
      const SAFE_TOFIXED_PRECISION = 15;
      const borrowAmountBigInt = parseUnits(
        borrowAmount.toFixed(Math.min(onChainDecimals, SAFE_TOFIXED_PRECISION)),
        onChainDecimals,
      );

      // Pre-sign revalidation: refetch position and recheck health factor
      // before submitting the on-chain transaction. Throws if unsafe.
      if (preSignValidation) {
        await preSignValidation();
      }

      // Execute the borrow transaction
      // Adapter resolves borrower's proxy from msg.sender
      await borrow(walletClient, chain, reserve.reserveId, borrowAmountBigInt);

      // Invalidate position queries to refresh data
      await queryClient.invalidateQueries({
        queryKey: ["aaveUserPosition", address],
      });

      return true;
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {
        data: { context: "Borrow failed" },
      });
      const mappedError =
        error instanceof Error
          ? mapViemErrorToContractError(error, "Borrow")
          : new Error("An unexpected error occurred while borrowing");

      handleError({
        error: mappedError,
        displayOptions: {
          showModal: true,
          retryAction: () =>
            executeBorrow(borrowAmount, reserve, preSignValidation),
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
