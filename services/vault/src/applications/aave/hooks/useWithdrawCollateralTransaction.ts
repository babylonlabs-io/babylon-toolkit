/**
 * Hook for withdraw collateral transaction
 *
 * Handles withdrawing selected collateral vaults from an Aave position.
 * Position must have zero debt before withdrawal.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { ethClient } from "@/clients/eth-contract/client";
import { assertNoTransactionInFlight } from "@/clients/eth-contract/transactionInFlight";
import { isWithdrawBlocked } from "@/components/shared/protocolStatus";
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

import { usePendingVaults } from "../context";
import { withdrawSelectedCollateral } from "../services";
import {
  runAaveWrite,
  type PendingAaveWrite,
} from "../services/pendingAaveWrite";

import { usePendingAaveWrite } from "./usePendingAaveWrite";

export interface UseWithdrawCollateralTransactionResult {
  /**
   * Execute the withdraw collateral transaction. Resolves true once it is
   * mined, including a transaction mined after the normal receipt wait, which
   * this keeps waiting for.
   * @param vaultIds - IDs of vaults currently used as collateral (to mark as pending)
   */
  executeWithdraw: (vaultIds: string[]) => Promise<boolean>;
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
   * withdrawal, or another Aave form's write holding the lock. Shown without the
   * failure title.
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { markVaultsAsPending } = usePendingVaults();
  const gate = useProtocolGateState();
  const pendingWrite = usePendingAaveWrite(address);

  const clearError = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const executeWithdraw = useCallback(
    async (vaultIds: string[]) => {
      // Withdraw is an EXIT: blocked only when either scope is paused (Freeze
      // preserves exits). Guard the execution chokepoint so a pause that lands
      // mid-session can't broadcast even if a modal was already open; the menu
      // item is disabled too.
      if (isWithdrawBlocked(gate)) return false;

      setError(null);
      setNotice(null);
      setIsProcessing(true);
      try {
        // Validate wallet connection
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

        // The account's Aave lock covers the pre-send check too, so a second
        // call made while it runs is refused instead of sent after this one.
        const outcome = await runAaveWrite(address, async () => {
          // A withdrawal this page did not see (sent before a reload, or from
          // another tab) may still be pending.
          await assertNoTransactionInFlight({
            publicClient: ethClient.getPublicClient(),
            account: address,
          });

          await withdrawSelectedCollateral(
            walletClient,
            getETHChain(),
            vaultIds as Hex[],
          );
        });

        // Mark vaults as pending withdrawal before indexer updates, only once
        // the withdrawal is known to be mined
        if (outcome === "mined" && vaultIds.length > 0) {
          markVaultsAsPending(vaultIds, "withdraw");
        }

        // Invalidate vault-related queries to refresh from indexer, also after
        // the user stopped waiting: the withdrawal may still be mined
        await invalidateVaultQueries(queryClient);

        return outcome === "mined";
      } catch (error) {
        // The wallet replaced the transaction. A speed-up may still have done
        // the withdrawal, so the position must show the chain's answer before
        // the user decides whether to try again.
        if (error instanceof TransactionReplacedError) {
          await invalidateVaultQueries(queryClient);
        }
        // Not a failure: a refusal before anything was signed, or a
        // replacement that may have done the withdrawal.
        if (isWriteNotice(error)) {
          setNotice(error.message);
          return false;
        }
        logger.error(error, {
          data: { context: "Withdraw collateral failed" },
        });
        const mappedError =
          error instanceof Error
            ? mapViemErrorToContractError(error, "Withdraw Collateral")
            : new Error(COPY.withdraw.unexpectedError);

        setError(mappedError.message);

        return false;
      } finally {
        setIsProcessing(false);
      }
    },
    [walletClient, address, queryClient, markVaultsAsPending, gate],
  );

  // Another Aave form's write holds the lock while it is signed or sent, so
  // this one is disabled: say why instead of leaving it without a reason.
  const lockedByOtherWrite =
    pendingWrite?.phase === "submitting" && !isProcessing;

  return {
    executeWithdraw,
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
