/**
 * Hook for borrow transaction
 * Handles the transaction execution for borrowing assets against collateral
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { ERC20 } from "@/clients/eth-contract";
import { ethClient } from "@/clients/eth-contract/client";
import { assertNoTransactionInFlight } from "@/clients/eth-contract/transactionInFlight";
import { isBorrowBlocked } from "@/components/shared/protocolStatus";
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
import {
  invalidateHubQueries,
  invalidateVaultQueries,
} from "@/utils/queryKeys";

import { getAaveAdapterAddress } from "../config";
import { SAFE_TOFIXED_PRECISION } from "../constants";
import {
  ReserveMismatchError,
  assertReserveMatchesOnChain,
  borrow,
} from "../services";
import type { AaveReserveConfig } from "../services/fetchConfig";
import {
  runAaveWrite,
  type AaveActionResult,
  type PendingAaveWrite,
} from "../services/pendingAaveWrite";
import { BorrowReserveCapUnavailableError } from "../utils/borrowReserveLimit";
import { describeAaveRevert } from "../utils/describeAaveRevert";

import { usePendingAaveWrite } from "./usePendingAaveWrite";

export interface UseBorrowTransactionResult {
  /**
   * Execute the borrow transaction. Resolves `succeeded` once it is mined,
   * including a transaction mined after the normal receipt wait, which this
   * keeps waiting for.
   */
  executeBorrow: (
    borrowAmount: number,
    reserve: AaveReserveConfig,
    preSignValidation?: () => Promise<void>,
  ) => Promise<AaveActionResult>;
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
   * borrow, or another Aave form's write holding the lock. Shown without the
   * failure title.
   */
  notice: string | null;
  /** Clear the last failure message and notice (e.g. when the borrow asset changes). */
  clearError: () => void;
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const chain = getETHChain();
  const gate = useProtocolGateState();
  const pendingWrite = usePendingAaveWrite(address);

  const clearError = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const executeBorrow = async (
    borrowAmount: number,
    reserve: AaveReserveConfig,
    preSignValidation?: () => Promise<void>,
  ): Promise<AaveActionResult> => {
    if (borrowAmount <= 0) return "failed";

    // Borrow is an aave-scope ENTRY action: Freeze or Pause blocks it. Guard the
    // execution chokepoint behind the disabled button so a programmatic call
    // can't broadcast while blocked.
    if (isBorrowBlocked(gate)) return "failed";

    setError(null);
    setNotice(null);
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

      // The account's Aave lock covers the pre-sign checks too, so a second
      // call made while they run is refused instead of sent after this one.
      const outcome = await runAaveWrite(address, async () => {
        // A borrow this page did not see (sent before a reload, or from
        // another tab) may still be pending. Checked before the pre-sign
        // reads, so the health-factor recheck cannot pass on state that
        // pending borrow is about to change.
        await assertNoTransactionInFlight({
          publicClient: ethClient.getPublicClient(),
          account: address,
        });

        // Verify the indexer-supplied (reserveId, token.address) pair maps to
        // the same reserve on-chain via the env-pinned adapter the tx will
        // execute against. Run before the decimals fetch so a mismatch
        // surfaces its specific error instead of being masked by a parallel
        // rejection.
        await assertReserveMatchesOnChain(
          getAaveAdapterAddress(),
          reserve.reserveId,
          reserve.token.address,
        );

        const onChainDecimals = await ERC20.getERC20Decimals(
          reserve.token.address,
        ).catch(() => {
          throw new Error(
            `Failed to fetch on-chain decimals for ${reserve.token.address}`,
          );
        });
        // Clamp toFixed precision to SAFE_TOFIXED_PRECISION to avoid IEEE 754
        // artifacts (e.g. (0.1).toFixed(18) === "0.100000000000000006"). The
        // max-borrow floor in calculateMaxBorrowTokens uses the same cap so
        // the displayed Max never exposes precision this path can't preserve.
        // parseUnits handles strings with fewer decimal places than the
        // token's decimals correctly.
        const borrowAmountBigInt = parseUnits(
          borrowAmount.toFixed(
            Math.min(onChainDecimals, SAFE_TOFIXED_PRECISION),
          ),
          onChainDecimals,
        );

        // Pre-sign revalidation: refetch position and recheck health factor
        // before submitting the on-chain transaction. Throws if unsafe.
        if (preSignValidation) {
          await preSignValidation();
        }

        // Adapter resolves borrower's proxy from msg.sender
        await borrow(
          walletClient,
          chain,
          reserve.reserveId,
          borrowAmountBigInt,
        );
      });

      // Invalidate position queries to refresh data, and the hub reads behind
      // the loan forms (liquidity, our spoke's borrow limit and hub state).
      // Also after the user stopped waiting: the borrow may still be mined.
      await Promise.all([
        invalidateVaultQueries(queryClient),
        invalidateHubQueries(queryClient),
      ]);

      return outcome === "mined" ? "succeeded" : "unknown";
    } catch (error) {
      // The wallet replaced the transaction. A speed-up may still have done
      // the borrow, so the position must show the chain's answer before the user
      // decides whether to try again.
      if (error instanceof TransactionReplacedError) {
        await Promise.all([
          invalidateVaultQueries(queryClient),
          invalidateHubQueries(queryClient),
        ]);
      }
      // Not a failure: a refusal before anything was signed, or a replacement
      // that may have done the borrow.
      if (isWriteNotice(error)) {
        setNotice(error.message);
        return error instanceof TransactionReplacedError ? "unknown" : "failed";
      }
      // A pre-sign refusal for an unreadable cap shows its own sentence as
      // is: mapping it would prefix "Borrow failed:", and decoding would walk
      // its cause chain, where an RPC revert could replace the sentence.
      if (error instanceof BorrowReserveCapUnavailableError) {
        logger.warn(error.message, { error });
        setError(COPY.loans.borrowLimit.capUnavailableError);
        return "failed";
      }
      logger.error(error, {
        data: { context: "Borrow failed" },
      });
      // Surface the on-chain reserve-mismatch as its own user-facing error so
      // the user sees an integrity warning, not a generic borrow failure.
      // Retry is suppressed because retrying can't help against a compromised
      // indexer.
      const isReserveMismatch = error instanceof ReserveMismatchError;
      const mappedError = isReserveMismatch
        ? new Error(COPY.loans.borrowIntegrityError)
        : error instanceof Error
          ? mapViemErrorToContractError(error, "Borrow")
          : new Error("An unexpected error occurred while borrowing");

      setError(
        describeAaveRevert(error, reserve, "borrow") ?? mappedError.message,
      );

      return "failed";
    } finally {
      setIsProcessing(false);
    }
  };

  // Another Aave form's write holds the lock while it is signed or sent, so
  // this one is disabled: say why instead of leaving it without a reason.
  const lockedByOtherWrite =
    pendingWrite?.phase === "submitting" && !isProcessing;

  return {
    executeBorrow,
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
