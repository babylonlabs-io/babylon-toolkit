/**
 * Hook for repay transaction
 *
 * Thin wrapper around the repayDebt service function.
 * Manages React state and query invalidation.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { parseUnits } from "viem";
import { useAccount, useWalletClient } from "wagmi";

import { ERC20 } from "@/clients/eth-contract";
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
  ReserveMismatchError,
  assertReserveMatchesOnChain,
  repayFull,
  repayMaxCapped,
  repayPartial,
} from "../services";
import type { AaveReserveConfig } from "../services/fetchConfig";

/**
 * Which repay path the user is invoking.
 *
 * - `"partial"` — user typed a specific amount; send it verbatim, no buffer.
 * - `"full"` — user wants to clear the debt and balance covers debt × (1 + buffer);
 *   service refetches debt at broadcast time and adds the buffer.
 * - `"max-capped"` — balance is between `debt` and `debt × (1 + buffer)`;
 *   approve the full balance as the cap and send the repay-all sentinel
 *   (`maxUint256`). Adapter clears the full debt; reverts cleanly if accrued
 *   interest exceeds the balance.
 */
export type RepayMode = "partial" | "full" | "max-capped";

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
   * Exact bigint amount (in the token's smallest unit) to use instead of
   * deriving it from `repayAmount` via `parseUnits`. In `"max-capped"` mode
   * the float `repayAmount` is just a display value, and the float round-trip
   * can round up by 1 ULP for high-precision raw values — which would produce
   * an approval larger than the user's actual balance and revert. When
   * provided in `"max-capped"` mode this bigint is used verbatim. Ignored in
   * other modes.
   */
  repayAmountRaw?: bigint | null;
}

export interface UseRepayTransactionResult {
  /**
   * Execute the repay transaction (handles approval if needed)
   * @param repayAmount - Amount to repay in token units (e.g., 100 for 100 USDC).
   *   In `"max-capped"` mode this is the user's full balance, which becomes the cap.
   * @param reserve - Reserve config for the debt token
   * @param mode - Which repay path to take. Defaults to `"partial"`.
   * @param options - Optional pre-sign hook and exact bigint amount.
   */
  executeRepay: (
    repayAmount: number,
    reserve: AaveReserveConfig,
    mode?: RepayMode,
    options?: ExecuteRepayOptions,
  ) => Promise<boolean>;
  /** Whether transaction is currently processing */
  isProcessing: boolean;
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
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const chain = getETHChain();
  const { handleError } = useError();

  const executeRepay = async (
    repayAmount: number,
    reserve: AaveReserveConfig,
    mode: RepayMode = "partial",
    options: ExecuteRepayOptions = {},
  ) => {
    const { preSignValidation, repayAmountRaw } = options;

    if (repayAmount <= 0) return false;

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
      // The borrower address is resolved from the connected wallet (self-repay)
      // Adapter and spoke addresses are pinned from trusted environment config
      if (mode === "full") {
        if (!proxyContract) {
          throw new Error(
            "Cannot perform full repayment: position data not available",
          );
        }

        await repayFull(
          walletClient,
          chain,
          reserve.reserveId,
          reserve.token.address,
          proxyContract as Address,
        );
      } else if (mode === "max-capped") {
        // max-capped requires the caller-supplied exact bigint. The float
        // round-trip via `parseUnits` can round up by 1 ULP for ≥16-significant
        // -digit raw values (any 18-decimal token with > ~10 tokens in the
        // wallet), producing an approval strictly greater than the user's
        // balance and reverting the tx. Refuse to proceed without the raw
        // bigint instead of silently degrading.
        if (repayAmountRaw == null || repayAmountRaw <= 0n) {
          throw new Error(
            "max-capped mode requires repayAmountRaw (the exact bigint balance). Caller must pass it from a fresh on-chain read.",
          );
        }

        await repayMaxCapped(
          walletClient,
          chain,
          reserve.reserveId,
          reserve.token.address,
          repayAmountRaw,
        );
      } else {
        // partial path: convert the user-typed float to bigint. Float rounding
        // is bounded by the input value itself (the user typed it), so a 1-ULP
        // overshoot here can't exceed the user's balance the way it can for
        // max-capped where the input *is* the balance.
        const onChainDecimals = await ERC20.getERC20Decimals(
          reserve.token.address,
        ).catch(() => {
          throw new Error(
            `Failed to fetch on-chain decimals for ${reserve.token.address}`,
          );
        });
        const SAFE_TOFIXED_PRECISION = 15;
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
        );
      }

      // Invalidate position queries to refresh data
      await queryClient.invalidateQueries({
        queryKey: ["aaveUserPosition", address],
      });

      return true;
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {
        data: { context: "Repay failed" },
      });
      // Surface the on-chain reserve-mismatch as its own user-facing error so
      // the user sees an integrity warning, not a generic repay failure.
      const mappedError =
        error instanceof ReserveMismatchError
          ? new Error(
              "Asset integrity check failed: the debt asset returned by the indexer does not match what's registered on-chain. Refresh and try again. If this persists, do not proceed.",
            )
          : error instanceof Error
            ? mapViemErrorToContractError(error, "Repay")
            : new Error("An unexpected error occurred while repaying");

      // Repay deliberately has no `retryAction`. If one is added later, mirror
      // the borrow hook and gate it on `!(error instanceof ReserveMismatchError)`
      // — retrying can't help against a compromised indexer.
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
  };

  return {
    executeRepay,
    isProcessing,
  };
}
