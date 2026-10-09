/**
 * Hook for reordering vaults on-chain.
 *
 * Calls reorderVaults(bytes32[]) on the AaveIntegrationAdapter
 * to change the prefix ordering for liquidation priority.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { ethClient } from "@/clients/eth-contract/client";
import { assertNoTransactionInFlight } from "@/clients/eth-contract/transactionInFlight";
import { isReorderBlocked } from "@/components/shared/protocolStatus";
import { getETHChain } from "@/config/network";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { logger } from "@/infrastructure";
import {
  ErrorCode,
  TransactionReplacedError,
  WalletError,
  isWriteNotice,
  mapViemErrorToContractError,
} from "@/utils/errors";
import { invalidateVaultQueries } from "@/utils/queryKeys";

import { getAaveAdapterAddress } from "../config";
import {
  PositionChangedError,
  assertOptimalOrderMatchesOnChain,
  assertReorderBaseline,
  assertReorderMembership,
  reorderVaultOrder,
  type ReorderVerificationContext,
} from "../services";
import {
  runAaveWrite,
  type PendingAaveWrite,
} from "../services/pendingAaveWrite";

import { usePendingAaveWrite } from "./usePendingAaveWrite";

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
   * `InvalidVaultsArray` check cannot catch.
   */
  expectedCurrentVaultIds?: readonly Hex[];
}

export interface UseReorderVaultsResult {
  /**
   * Execute the reorder transaction. Resolves true once it is mined,
   * including a transaction mined after the normal receipt wait, which this
   * keeps waiting for.
   */
  executeReorder: (
    permutedVaultIds: Hex[],
    options?: ExecuteReorderOptions,
  ) => Promise<boolean>;
  /** Whether transaction is currently processing */
  isProcessing: boolean;
  /**
   * The account's Aave write in progress, from this form or any other. Every
   * Aave action stays disabled while it is set.
   */
  pendingWrite: PendingAaveWrite | null;
  /** Last failure message, shown inline under the action (null when none). */
  error: string | null;
  /**
   * Last outcome that is not a failure (null when none): a refusal before
   * anything was signed, a wallet replacement that may have done the
   * reorder, or another Aave form's write holding the lock. Shown without the
   * failure title.
   */
  notice: string | null;
  /** Clear the last failure message and notice (e.g. when the modal reopens). */
  clearError: () => void;
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
 * After a success, cache invalidation is deferred to the success modal close
 * handler to give the indexer time to process the block. When the outcome is
 * unknown (the user stopped waiting, or the wallet replaced the transaction)
 * there is no success modal, so the hook refreshes the position itself.
 */
export function useReorderVaults(): UseReorderVaultsResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const gate = useProtocolGateState();
  const pendingWrite = usePendingAaveWrite(address);

  const clearError = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const executeReorder = useCallback(
    async (permutedVaultIds: Hex[], options?: ExecuteReorderOptions) => {
      // Reorder is an aave-scope entry action: Freeze or Pause blocks it. Guard
      // the shared execution chokepoint so neither the banner CTA nor the
      // reorder modal can broadcast while blocked, regardless of how the handler
      // was reached (the UI buttons are disabled too). Returns a no-op failure —
      // the path is UI-prevented, so there is nothing actionable to surface.
      if (isReorderBlocked(gate)) return false;

      setError(null);
      setNotice(null);
      setIsProcessing(true);
      try {
        if (!walletClient) {
          throw new WalletError(
            COPY.wallet.connectToContinue,
            ErrorCode.WALLET_NOT_CONNECTED,
          );
        }

        if (!address) {
          throw new WalletError(
            COPY.wallet.addressUnavailable,
            ErrorCode.WALLET_NOT_CONNECTED,
          );
        }

        // The account's Aave lock covers the pre-sign checks too, so a second
        // call made while they run is refused instead of sent after this one.
        const outcome = await runAaveWrite(address, async () => {
          // A reorder this page did not see (sent before a reload, or from
          // another tab) may still be pending.
          await assertNoTransactionInFlight({
            publicClient: ethClient.getPublicClient(),
            account: address,
          });

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

          await reorderVaultOrder(
            walletClient,
            getETHChain(),
            permutedVaultIds,
          );
        });

        if (outcome === "mined") return true;
        // The user stopped waiting and the reorder may still be mined: show
        // the chain's order rather than the one in the cache.
        await invalidateVaultQueries(queryClient);
        return false;
      } catch (error) {
        // The wallet replaced the transaction. A speed-up may still have done
        // the reorder, so the position must show the chain's order.
        if (error instanceof TransactionReplacedError) {
          await invalidateVaultQueries(queryClient);
        }
        // Not a failure: a refusal before anything was signed, or a
        // replacement that may have done the reorder.
        if (isWriteNotice(error)) {
          setNotice(error.message);
          return false;
        }
        logger.error(error, { data: { context: "Reorder vaults failed" } });
        // Surface a stale-baseline mismatch as its own user-facing error so
        // the user understands they need to refresh, not retry. Retry with
        // the same stale baseline cannot help.
        const isPositionChanged = error instanceof PositionChangedError;
        const mappedError = isPositionChanged
          ? error
          : error instanceof Error
            ? mapViemErrorToContractError(error, "Reorder Vaults")
            : new Error(COPY.reorder.unexpectedError);

        setError(mappedError.message);

        return false;
      } finally {
        setIsProcessing(false);
      }
    },
    [walletClient, address, queryClient, gate],
  );

  // Another Aave form's write holds the lock while it is signed or sent, so
  // this one is disabled: say why instead of leaving it without a reason.
  const lockedByOtherWrite =
    pendingWrite?.phase === "submitting" && !isProcessing;

  return {
    executeReorder,
    isProcessing,
    pendingWrite,
    error,
    notice:
      notice ??
      (lockedByOtherWrite
        ? COPY.common.unconfirmedTransaction.inProgress
        : null),
    clearError,
  };
}
