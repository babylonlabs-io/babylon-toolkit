/**
 * Hook for repay transaction
 *
 * Thin wrapper around the repayDebt service function.
 * Manages React state and query invalidation.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Address } from "viem";
import { parseUnits } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { ERC20 } from "@/clients/eth-contract";
import { ethClient } from "@/clients/eth-contract/client";
import { assertNoTransactionInFlight } from "@/clients/eth-contract/transactionInFlight";
import { isRepayBlocked } from "@/components/shared/protocolStatus";
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
  ProxyMismatchError,
  ReserveMismatchError,
  assertReserveMatchesOnChain,
  repayAll,
  repayPartial,
} from "../services";
import type { AaveReserveConfig } from "../services/fetchConfig";
import {
  runAaveWrite,
  type AaveActionResult,
  type PendingAaveWrite,
} from "../services/pendingAaveWrite";
import { describeAaveRevert } from "../utils/describeAaveRevert";

import { usePendingAaveWrite } from "./usePendingAaveWrite";

/**
 * Which repay path the user is invoking.
 *
 * - `"partial"` — user typed a specific amount; send it verbatim, no buffer.
 * - `"max"` — user wants to clear the debt and balance covers it; the service
 *   quotes the fee-inclusive debt from the position proxy, approves
 *   `min(quote + buffer, balance)`, and sends the repay-all sentinel
 *   (`maxUint256`). Adapter clears the full debt; reverts cleanly if accrued
 *   interest exceeds the cap.
 */
export type RepayMode = "partial" | "max";

export interface UseRepayTransactionProps {
  /** User's proxy contract address (for debt queries) */
  proxyContract: string | undefined;
}

/**
 * Optional, non-default parameters for `executeRepay`. Kept as an options
 * object so callers don't need to remember positional defaults.
 */
export interface ExecuteRepayOptions {
  /**
   * Callback that runs after the on-chain reserve-mismatch check and before
   * any repay tx. Throwing aborts the submission. Used by the Repay UI to
   * refetch position + split params and recompute the projected post-repay
   * HF against current on-chain values.
   */
  preSignValidation?: () => Promise<void>;
  /**
   * Exact bigint balance (in the token's smallest unit) to use instead of
   * deriving it from `repayAmount` via `parseUnits`. In `"max"` mode the
   * float `repayAmount` is just a display value, and the float round-trip
   * can round up by 1 ULP for high-precision raw values — which would produce
   * an approval cap larger than the user's actual balance and revert. When
   * provided in `"max"` mode this bigint is used verbatim. Ignored in
   * other modes.
   */
  repayAmountRaw?: bigint | null;
}

export interface UseRepayTransactionResult {
  /**
   * Execute the repay transaction (handles approval if needed). Resolves
   * `succeeded` once the repay is mined, including a repay mined after the
   * normal receipt wait, which this keeps waiting for.
   * @param repayAmount - Amount to repay in token units (e.g., 100 for 100 USDC).
   *   In `"max"` mode this is display-only (the debt being cleared); the cap
   *   comes from `repayAmountRaw`.
   * @param reserve - Reserve config for the debt token
   * @param mode - Which repay path to take. Defaults to `"partial"`.
   * @param options - Optional pre-sign hook and exact bigint amount.
   */
  executeRepay: (
    repayAmount: number,
    reserve: AaveReserveConfig,
    mode?: RepayMode,
    options?: ExecuteRepayOptions,
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
   * repay, or another Aave form's write holding the lock. Shown without the
   * failure title.
   */
  notice: string | null;
  /** Clear the last failure message and notice (e.g. when the repay asset changes). */
  clearError: () => void;
}

/**
 * Hook for executing repay transactions
 *
 * Delegates business logic to repayDebt service.
 * Handles React state, error handling, and cache invalidation.
 */
export function useRepayTransaction({
  proxyContract,
}: UseRepayTransactionProps): UseRepayTransactionResult {
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

  const executeRepay = async (
    repayAmount: number,
    reserve: AaveReserveConfig,
    mode: RepayMode = "partial",
    options: ExecuteRepayOptions = {},
  ): Promise<AaveActionResult> => {
    const { preSignValidation, repayAmountRaw } = options;

    if (repayAmount <= 0) return "failed";

    // Repay is an aave-scope EXIT: blocked only by an aave Pause (not a protocol
    // pause, and never by Freeze). Guard the chokepoint behind the disabled button.
    if (isRepayBlocked(gate)) return "failed";

    setError(null);
    setNotice(null);
    setIsProcessing(true);
    try {
      // Validate prerequisites
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
      // The approve, when one is needed, runs under it as well.
      const outcome = await runAaveWrite(address, async () => {
        // A transaction this page did not see (sent before a reload, or from
        // another tab) may still be pending. Checked once for the whole
        // action, before the pre-sign reads, and never between the approve
        // and the repay: the approve that just mined would still look pending
        // on a lagging RPC backend.
        await assertNoTransactionInFlight({
          publicClient: ethClient.getPublicClient(),
          account: address,
        });

        // Verify the indexer-supplied (reserveId, token.address) pair maps to
        // the same reserve on-chain via the env-pinned adapter the tx will
        // execute against. Without this, a compromised indexer could redirect
        // a repayment to a different asset.
        await assertReserveMatchesOnChain(
          getAaveAdapterAddress(),
          reserve.reserveId,
          reserve.token.address,
        );

        // Pre-sign revalidation: refetch position + risk parameters and
        // recheck projected post-repay HF before submitting. Throws if the
        // on-chain risk parameters have moved since the displayed metrics
        // were computed.
        if (preSignValidation) {
          await preSignValidation();
        }

        // Call appropriate service based on repayment type
        // The borrower address is resolved from the connected wallet
        // (self-repay). Adapter and proxy addresses come from pinned config /
        // position data.
        if (mode === "max") {
          if (!proxyContract) {
            throw new Error(
              "Cannot perform full repayment: position data not available",
            );
          }
          // max requires the caller-supplied exact bigint. The float
          // round-trip via `parseUnits` can round up by 1 ULP for
          // ≥16-significant-digit raw values (any 18-decimal token with > ~10
          // tokens in the wallet), producing an approval cap strictly greater
          // than the user's balance and reverting the tx. Refuse to proceed
          // without the raw bigint instead of silently degrading.
          if (repayAmountRaw == null || repayAmountRaw <= 0n) {
            throw new Error(
              "max mode requires repayAmountRaw (the exact bigint balance). Caller must pass it from a fresh on-chain read.",
            );
          }

          await repayAll(
            walletClient,
            chain,
            reserve.reserveId,
            reserve.token.address,
            proxyContract as Address,
            repayAmountRaw,
            reserve.token,
          );
          return;
        }

        // partial path: convert the user-typed float to bigint. Float
        // rounding is bounded by the input value itself (the user typed it),
        // so a 1-ULP overshoot here can't exceed the user's balance the way it
        // can for max mode where the input *is* the balance.
        const onChainDecimals = await ERC20.getERC20Decimals(
          reserve.token.address,
        ).catch(() => {
          throw new Error(
            `Failed to fetch on-chain decimals for ${reserve.token.address}`,
          );
        });
        const amountBigInt = parseUnits(
          repayAmount.toFixed(
            Math.min(onChainDecimals, SAFE_TOFIXED_PRECISION),
          ),
          onChainDecimals,
        );

        await repayPartial(
          walletClient,
          chain,
          reserve.reserveId,
          reserve.token.address,
          amountBigInt,
          reserve.token,
        );
      });

      // Invalidate position queries to refresh data, and the hub reads behind
      // the loan forms (liquidity, our spoke's borrow limit and hub state).
      // Also after the user stopped waiting: the repay may still be mined.
      await Promise.all([
        invalidateVaultQueries(queryClient),
        invalidateHubQueries(queryClient),
      ]);

      return outcome === "mined" ? "succeeded" : "unknown";
    } catch (error) {
      // The wallet replaced the transaction. A speed-up may still have done
      // the repay, so the position must show the chain's answer before the user
      // decides whether to try again.
      if (error instanceof TransactionReplacedError) {
        await Promise.all([
          invalidateVaultQueries(queryClient),
          invalidateHubQueries(queryClient),
        ]);
      }
      // Not a failure: a refusal before anything was signed, or a replacement
      // that may have done the repay.
      if (isWriteNotice(error)) {
        setNotice(error.message);
        return error instanceof TransactionReplacedError ? "unknown" : "failed";
      }
      logger.error(error, {
        data: { context: "Repay failed" },
      });
      // Surface the on-chain integrity checks (reserve + proxy) as their own
      // user-facing errors so the user sees an integrity warning, not a generic
      // repay failure.
      const mappedError =
        error instanceof ReserveMismatchError
          ? new Error(
              "Asset integrity check failed: the debt asset returned by the indexer does not match what's registered on-chain. Refresh and try again. If this persists, do not proceed.",
            )
          : error instanceof ProxyMismatchError
            ? new Error(COPY.loans.repay.integrityError)
            : error instanceof Error
              ? mapViemErrorToContractError(error, "Repay")
              : new Error("An unexpected error occurred while repaying");

      setError(
        describeAaveRevert(error, reserve, "repay") ?? mappedError.message,
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
    executeRepay,
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
