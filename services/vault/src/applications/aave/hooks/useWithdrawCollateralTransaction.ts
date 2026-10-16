/**
 * Hook for withdraw collateral transaction
 *
 * Handles withdrawing selected collateral vaults from an Aave position.
 * Position must have zero debt before withdrawal.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import { assertNoTransactionInFlight } from "@/clients/eth-contract/transactionInFlight";
import { getWalletClientOnExpectedChain } from "@/clients/eth-contract/walletChain";
import { isWithdrawBlocked } from "@/components/shared/protocolStatus";
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
import { usePendingVaults } from "../context";
import {
  CollateralAmountMismatchError,
  CollateralRegistryReadError,
  assertCollateralAmountsMatchOnChain,
  withdrawSelectedCollateral,
  type CollateralAmountPair,
} from "../services";
import {
  runAaveWrite,
  type AaveActionResult,
  type PendingAaveWrite,
} from "../services/pendingAaveWrite";

import { usePendingAaveWrite } from "./usePendingAaveWrite";

export interface UseWithdrawCollateralTransactionResult {
  /**
   * Execute the withdraw collateral transaction. Resolves `succeeded` once it
   * is mined, including a transaction mined after the normal receipt wait,
   * which this keeps waiting for, and `unknown` when it may still be mined:
   * the user stopped waiting, the wallet replaced it with a transaction that
   * could not be read, or the wallet refused as "nonce too low" a send it may
   * have broadcast.
   * @param selection - The reviewed vaults and amounts. Signing stops if the
   *   registry does not match them.
   */
  executeWithdraw: (
    selection: readonly CollateralAmountPair[],
  ) => Promise<AaveActionResult>;
  /** Whether transaction is currently processing */
  isProcessing: boolean;
  /**
   * This form's own withdrawal is mined, and its outcome waits for it to be deep
   * enough on the chain. Clears when the withdrawal ends.
   */
  isConfirming: boolean;
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
   * broadcast send, either of which may have done the withdrawal, a
   * withdrawal the user stopped waiting for, or another Aave form's write
   * holding the lock. Shown without the failure title.
   */
  notice: string | null;
  /** Clear the last failure message and notice (e.g. when the dialog reopens). */
  clearError: () => void;
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
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const account = useETHWallet().address as Address | undefined;
  const queryClient = useQueryClient();
  const { markVaultsAsPending } = usePendingVaults();
  const gate = useProtocolGateState();
  const pendingWrite = usePendingAaveWrite(account);

  const clearError = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const executeWithdraw = useCallback(
    async (selection: readonly CollateralAmountPair[]) => {
      // Withdraw is an EXIT: blocked only when either scope is paused (Freeze
      // preserves exits). Guard the execution chokepoint so a pause that lands
      // mid-session can't broadcast even if a modal was already open; the menu
      // item is disabled too.
      if (isWithdrawBlocked(gate)) return "failed";

      const vaultIds = selection.map((entry) => entry.vaultId);
      setError(null);
      setNotice(null);
      setIsProcessing(true);
      // The button reads "Confirming" while the withdrawal gets deep enough
      // on the chain.
      const markIncluded = () => setIsConfirming(true);
      try {
        if (!account) {
          throw new WalletError(
            COPY.wallet.connectToContinue,
            ErrorCode.WALLET_NOT_CONNECTED,
          );
        }

        // The account's Aave lock covers the pre-send check too, so a second
        // call made while it runs is refused instead of sent after this one.
        const outcome = await runAaveWrite(account, async () => {
          // A withdrawal this page did not see (sent before a reload, or from
          // another tab) may still be pending.
          await assertNoTransactionInFlight({
            publicClient: ethClient.getPublicClient(),
            account,
          });

          // Check each reviewed amount, status and application before signing.
          await assertCollateralAmountsMatchOnChain(
            selection,
            getAaveAdapterAddress(),
          );

          const walletClient = await getWalletClientOnExpectedChain(account);
          await withdrawSelectedCollateral(
            walletClient,
            getETHChain(),
            vaultIds as Hex[],
            markIncluded,
          );
        });
        // "Confirming" holds through the refresh only for a mined withdrawal:
        // one the lock's watch found after the first wait gave up never
        // reported its inclusion, and one the user stopped waiting on is not
        // confirming.
        setIsConfirming(outcome === "mined");

        // Mark vaults as pending withdrawal before indexer updates, only once
        // the withdrawal is known to be mined
        if (outcome === "mined" && vaultIds.length > 0) {
          markVaultsAsPending(vaultIds, "withdraw");
        }

        // Invalidate vault-related queries to refresh from indexer, also after
        // the user stopped waiting: the withdrawal may still be mined
        await invalidateVaultQueries(queryClient);

        if (outcome === "mined") return "succeeded";
        setNotice(COPY.common.unconfirmedTransaction.stopped);
        return "unknown";
      } catch (error) {
        // The wallet replaced the transaction, or refused as "nonce too low" a
        // send it may have broadcast. Either may still have done the
        // withdrawal, so the position must show the chain's answer before the
        // user decides whether to try again.
        if (
          error instanceof TransactionReplacedError ||
          error instanceof SendOutcomeUnknownError
        ) {
          await invalidateVaultQueries(queryClient);
        }
        // Not a failure: a refusal before anything was signed, or an outcome
        // that may have done the withdrawal.
        if (isWriteNotice(error)) {
          setNotice(error.message);
          return error instanceof TransactionReplacedError ||
            error instanceof SendOutcomeUnknownError
            ? "unknown"
            : "failed";
        }
        logger.error(error, {
          data: { context: "Withdraw collateral failed" },
        });
        // The guard's message is a diagnostic for the log. The user gets the
        // copy, not a contract-error mapping: a retry against the same
        // indexer data cannot help.
        const mappedError =
          error instanceof CollateralAmountMismatchError
            ? new Error(COPY.withdraw.integrityError)
            : error instanceof CollateralRegistryReadError
              ? new Error(COPY.withdraw.verificationFailed)
              : error instanceof Error
                ? mapViemErrorToContractError(error, "Withdraw Collateral")
                : new Error(COPY.withdraw.unexpectedError);

        setError(mappedError.message);

        return "failed";
      } finally {
        setIsProcessing(false);
        setIsConfirming(false);
      }
    },
    [account, queryClient, markVaultsAsPending, gate],
  );

  // Another Aave form's write holds the lock while it is signed or sent, so
  // this one is disabled: say why instead of leaving it without a reason.
  const lockedByOtherWrite =
    pendingWrite?.phase === "submitting" && !isProcessing;

  return {
    executeWithdraw,
    isProcessing,
    isConfirming,
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
