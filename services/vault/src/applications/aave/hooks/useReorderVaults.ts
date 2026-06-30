/**
 * Hook for reordering vaults on-chain.
 *
 * Calls reorderVaults(bytes32[]) on the AaveIntegrationAdapter
 * to change the prefix ordering for liquidation priority.
 */

import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { isReorderBlocked } from "@/components/shared/protocolStatus";
import { getETHChain } from "@/config/network";
import { useError } from "@/context/error";
import { logger } from "@/infrastructure";
import {
  ErrorCode,
  WalletError,
  mapViemErrorToContractError,
} from "@/utils/errors";

import { getAaveAdapterAddress } from "../config";
import {
  PositionChangedError,
  assertOptimalOrderMatchesOnChain,
  assertReorderBaseline,
  assertReorderMembership,
  reorderVaultOrder,
  type ReorderVerificationContext,
} from "../services";

export interface ExecuteReorderOptions {
  /**
   * Trusted calculator inputs from the auto-suggestion CTA. When provided,
   * the hook re-runs the optimizer against on-chain amounts and refuses to
   * sign if the result diverges from the submitted permutation. Manual
   * drag-and-drop reorders omit this so users can pick non-optimal orders.
   */
  optimalOrderContext?: ReorderVerificationContext;
  /**
   * The on-chain vault ordering the caller observed at the time it built
   * the submission (e.g. the modal-open snapshot). When provided, the hook
   * refuses to sign if the live ordering has drifted from this baseline
   * — closes the same-set/different-order race the on-chain
   * `InvalidVaultsPermutation` check cannot catch.
   */
  expectedCurrentVaultIds?: readonly Hex[];
}

export interface UseReorderVaultsResult {
  /** Execute the reorder transaction */
  executeReorder: (
    permutedVaultIds: Hex[],
    options?: ExecuteReorderOptions,
  ) => Promise<boolean>;
  /** Whether transaction is currently processing */
  isProcessing: boolean;
}

/**
 * Hook for executing vault reorder transactions.
 *
 * Handles:
 * 1. Wallet validation
 * 2. On-chain integrity guards (membership; optimal-order recompute when
 *    invoked from the auto-suggestion CTA)
 * 3. Reorder transaction execution
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
    async (permutedVaultIds: Hex[], options?: ExecuteReorderOptions) => {
      // Freeze/Pause blocks reorder. Guard the shared execution chokepoint so
      // neither the banner CTA nor the reorder modal can broadcast while
      // blocked, regardless of how the handler was reached (the UI buttons are
      // disabled too). Returns a no-op failure — the path is UI-prevented, so
      // there is nothing actionable to surface in a modal.
      if (isReorderBlocked()) return false;

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

        const adapterAddress = getAaveAdapterAddress();

        const currentVaultIds = await assertReorderMembership(
          adapterAddress,
          address,
          permutedVaultIds,
        );

        if (options?.expectedCurrentVaultIds) {
          assertReorderBaseline(
            currentVaultIds,
            options.expectedCurrentVaultIds,
          );
        }

        if (options?.optimalOrderContext) {
          await assertOptimalOrderMatchesOnChain(
            permutedVaultIds,
            currentVaultIds,
            adapterAddress,
            options.optimalOrderContext,
          );
        }

        await reorderVaultOrder(walletClient, getETHChain(), permutedVaultIds);

        return true;
      } catch (error) {
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          { data: { context: "Reorder vaults failed" } },
        );
        // Surface a stale-baseline mismatch as its own user-facing error so
        // the user understands they need to refresh, not retry. Retry with
        // the same stale baseline cannot help.
        const isPositionChanged = error instanceof PositionChangedError;
        const mappedError = isPositionChanged
          ? error
          : error instanceof Error
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
