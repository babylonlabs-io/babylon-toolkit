/**
 * Hook for reordering vaults on-chain.
 *
 * Calls reorderVaults(bytes32[]) on the AaveIntegrationAdapter
 * to change the prefix ordering for liquidation priority.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import { assertNoTransactionInFlight } from "@/clients/eth-contract/transactionInFlight";
import { getWalletClientOnExpectedChain } from "@/clients/eth-contract/walletChain";
import { isReorderBlocked } from "@/components/shared/protocolStatus";
import { getETHChain } from "@/config/network";
import { useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { logger } from "@/infrastructure";
import {
  ErrorCode,
  SendOutcomeUnknownError,
  TransactionReplacedError,
  WalletError,
  isWriteNotice,
  mapViemErrorToContractError,
} from "@/utils/errors";
import { invalidateVaultQueries } from "@/utils/queryKeys";

import { getAaveAdapterAddress } from "../config";
import {
  CollateralAmountMismatchError,
  CollateralRegistryReadError,
  PositionChangedError,
  assertCollateralAmountsMatchOnChain,
  assertOptimalOrderMatchesOnChain,
  assertReorderBaseline,
  assertReorderMembership,
  reorderVaultOrder,
  type CollateralAmountPair,
  type ReorderVerificationContext,
} from "../services";
import {
  runAaveWrite,
  type PendingAaveWrite,
} from "../services/pendingAaveWrite";

import { usePendingAaveWrite } from "./usePendingAaveWrite";

/**
 * Which pre-sign guards a reorder runs, keyed by where the submission comes
 * from. The literal `kind` is required: a structural union would accept a
 * mixed literal and silently skip the amount check.
 */
export type ExecuteReorderOptions =
  | {
      /** The auto-suggestion banner CTA. */
      kind: "optimal";
      /**
       * Trusted calculator inputs. The hook re-runs the optimizer against
       * on-chain amounts and refuses to sign if the result diverges from the
       * submitted permutation.
       */
      optimalOrderContext: ReorderVerificationContext;
    }
  | {
      /** The drag-and-drop modal. */
      kind: "manual";
      /**
       * The vaults and amounts the user reviewed at modal open, in the
       * on-chain order observed then. The hook refuses to sign if the live
       * ordering has drifted from this baseline (the same-set/different-order
       * race the on-chain `InvalidVaultsArray` check cannot catch), or if any
       * reviewed amount differs from the registry.
       */
      expectedCurrentVaults: readonly CollateralAmountPair[];
    }
  | {
      /** The split-order repair card; its signed order is registry-derived. */
      kind: "baseline";
      /**
       * The on-chain vault ordering the caller observed when it built the
       * submission. The hook refuses to sign if the live ordering has drifted
       * from it.
       */
      expectedCurrentVaultIds: readonly Hex[];
    };

export interface UseReorderVaultsResult {
  /**
   * Execute the reorder transaction. Resolves true once it is mined,
   * including a transaction mined after the normal receipt wait, which this
   * keeps waiting for.
   */
  executeReorder: (
    permutedVaultIds: Hex[],
    options: ExecuteReorderOptions,
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
   * anything was signed, a wallet replacement or a "nonce too low" for a
   * broadcast send, either of which may have done the reorder, or another Aave
   * form's write holding the lock. Shown without the failure title.
   */
  notice: string | null;
  /** Clear the last failure message and notice (e.g. when the modal reopens). */
  clearError: () => void;
}

/**
 * The message shown under the action for a failed reorder. A stale baseline
 * or an amount the registry does not confirm is its own user-facing error so
 * the user understands they need to refresh, not retry. Retry with the same
 * stale input cannot help.
 */
function reorderErrorMessage(error: unknown): string {
  if (error instanceof PositionChangedError) return error.message;
  if (error instanceof CollateralAmountMismatchError) {
    return COPY.reorder.collateralAmountsChanged;
  }
  if (error instanceof CollateralRegistryReadError) {
    return COPY.reorder.collateralVerificationFailed;
  }
  if (error instanceof Error) {
    return mapViemErrorToContractError(error, "Reorder Vaults").message;
  }
  return COPY.reorder.unexpectedError;
}

/**
 * Hook for executing vault reorder transactions.
 *
 * Handles:
 * 1. Wallet validation
 * 2. On-chain integrity guards (membership; then, by `options.kind`, the
 *    optimal-order recompute, the baseline check, or the baseline check
 *    followed by the per-vault amount check)
 * 3. Reorder transaction execution
 *
 * After a success, cache invalidation is deferred to the success modal close
 * handler to give the indexer time to process the block. When the outcome is
 * unknown (the user stopped waiting, the wallet replaced the transaction, or
 * the wallet refused as "nonce too low" a send it may have broadcast) there is
 * no success modal, so the hook refreshes the position itself.
 */
export function useReorderVaults(): UseReorderVaultsResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const account = useETHWallet().address as Address | undefined;
  const queryClient = useQueryClient();
  const gate = useProtocolGateState();
  const pendingWrite = usePendingAaveWrite(account);

  const clearError = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const executeReorder = useCallback(
    async (permutedVaultIds: Hex[], options: ExecuteReorderOptions) => {
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
        if (!account) {
          throw new WalletError(
            COPY.wallet.connectToContinue,
            ErrorCode.WALLET_NOT_CONNECTED,
          );
        }

        // The account's Aave lock covers the pre-sign checks too, so a second
        // call made while they run is refused instead of sent after this one.
        const outcome = await runAaveWrite(account, async () => {
          // A reorder this page did not see (sent before a reload, or from
          // another tab) may still be pending.
          await assertNoTransactionInFlight({
            publicClient: ethClient.getPublicClient(),
            account,
          });

          const adapterAddress = getAaveAdapterAddress();

          const currentVaultIds = await assertReorderMembership(
            adapterAddress,
            account,
            permutedVaultIds,
          );

          // The baseline check is pure over Guard A's result, so it runs
          // before any registry read.
          switch (options.kind) {
            case "optimal":
              await assertOptimalOrderMatchesOnChain(
                permutedVaultIds,
                currentVaultIds,
                adapterAddress,
                options.optimalOrderContext,
              );
              break;
            case "manual":
              assertReorderBaseline(
                currentVaultIds,
                options.expectedCurrentVaults.map((vault) => vault.vaultId),
              );
              await assertCollateralAmountsMatchOnChain(
                options.expectedCurrentVaults,
                adapterAddress,
              );
              break;
            case "baseline":
              assertReorderBaseline(
                currentVaultIds,
                options.expectedCurrentVaultIds,
              );
              break;
            default: {
              // Exhaustive over `ExecuteReorderOptions`: a kind with no
              // guards must refuse, never sign.
              const unknownOptions: never = options;
              throw new Error(
                `Reorder options have no guards for kind ${String(
                  (unknownOptions as { kind?: unknown }).kind,
                )}`,
              );
            }
          }

          const walletClient = await getWalletClientOnExpectedChain(account);
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
        // The wallet replaced the transaction, or refused as "nonce too low" a
        // send it may have broadcast. Either may still have done the reorder,
        // so the position must show the chain's order.
        if (
          error instanceof TransactionReplacedError ||
          error instanceof SendOutcomeUnknownError
        ) {
          await invalidateVaultQueries(queryClient);
        }
        // Not a failure: a refusal before anything was signed, or an outcome
        // that may have done the reorder.
        if (isWriteNotice(error)) {
          setNotice(error.message);
          return false;
        }
        logger.error(error, { data: { context: "Reorder vaults failed" } });
        setError(reorderErrorMessage(error));

        return false;
      } finally {
        setIsProcessing(false);
      }
    },
    [account, queryClient, gate],
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
