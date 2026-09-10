/**
 * Hook to calculate estimated BTC transaction fee using iterative UTXO selection.
 *
 * When UTXOs are provided, uses the SDK's selectUtxosForPegin for accurate
 * fee calculation that accounts for the actual number of inputs needed.
 *
 * The algorithm iteratively:
 * 1. Adds UTXOs (sorted by value, largest first)
 * 2. Recalculates fee based on current inputs
 * 3. Checks if change output needed (affects fee)
 * 4. Continues until accumulated >= amount + fee
 *
 * @param amount - Amount to peg in (in satoshis)
 * @param utxos - Available UTXOs for fee calculation
 * @param numOutputs - Number of outputs before change (e.g. N HTLCs + 1 CPFP anchor)
 * @param maxInputCount - On-chain `maxFundingInputCount`; `null` when the
 *   deployment predates the field, `undefined` while the bound is unresolved
 *   (treated as loading — selecting without it would fail open)
 * @param feeRateOverride - Optional sat/vB rate; when > 0, replaces mempool default
 * @returns Estimated fee, fee rate, loading state, and error
 */

import type { MempoolUTXO } from "@babylonlabs-io/ts-sdk";
import {
  computeFundingBudget,
  computeMaxDeposit,
  isFundingInputCountExceededError,
  selectUtxosForPegin,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { useMemo } from "react";

import { COPY } from "@/copy";

import { useNetworkFees } from "../useNetworkFees";

export interface EstimatedBtcFeeResult {
  /** Estimated fee in satoshis, or null if unavailable */
  fee: bigint | null;
  /** Fee rate used for calculation (sat/vB) */
  feeRate: number;
  /** Whether fee rates are still loading */
  isLoading: boolean;
  /** Error if fee could not be calculated */
  error: string | null;
  /** Maximum depositable amount in satoshis (balance minus fee for all UTXOs) */
  maxDeposit: bigint | null;
}

export function useEstimatedBtcFee(
  amount: bigint,
  utxos: MempoolUTXO[] | undefined,
  numOutputs: number,
  maxInputCount: number | null | undefined,
  feeRateOverride?: number,
): EstimatedBtcFeeResult {
  const { defaultFeeRate, isLoading, error: feeError } = useNetworkFees();

  // Prefer a positive caller override (user-adjusted rate); otherwise mempool.
  const feeRate =
    feeRateOverride !== undefined &&
    Number.isFinite(feeRateOverride) &&
    feeRateOverride > 0
      ? feeRateOverride
      : defaultFeeRate;

  // Max deposit only depends on the fundable UTXOs + fee rate, not the user's
  // amount. The budget is the same filter, sort and cap the selector applies,
  // so the Max stays fundable once the bound binds rather than quoting a
  // balance the selector would then refuse to reach.
  const maxDeposit = useMemo(() => {
    if (isLoading || feeRate === 0 || maxInputCount === undefined) return null;
    const budget = computeFundingBudget(utxos ?? [], maxInputCount);
    return computeMaxDeposit({
      numInputs: budget.numInputs,
      numOutputs,
      totalBalance: budget.totalBalance,
      feeRate,
    });
  }, [utxos, feeRate, numOutputs, isLoading, maxInputCount]);

  const result = useMemo((): EstimatedBtcFeeResult => {
    if (maxInputCount === undefined) {
      return {
        fee: null,
        feeRate,
        isLoading: true,
        error: null,
        maxDeposit: null,
      };
    }

    // Still loading fee rates — and no usable override yet
    if (isLoading && feeRate === 0) {
      return {
        fee: null,
        feeRate: 0,
        isLoading: true,
        error: null,
        maxDeposit,
      };
    }

    // Fee rate not available
    if (feeRate === 0) {
      return {
        fee: null,
        feeRate: 0,
        isLoading: false,
        error: feeError?.message ?? "Unable to fetch network fee rates",
        maxDeposit,
      };
    }

    // No UTXOs provided - can't calculate accurate fee
    if (!utxos || utxos.length === 0) {
      return {
        fee: null,
        feeRate,
        isLoading: false,
        error: null,
        maxDeposit,
      };
    }

    // Amount is zero - no fee calculation needed
    if (amount === 0n) {
      return {
        fee: null,
        feeRate,
        isLoading: false,
        error: null,
        maxDeposit,
      };
    }

    try {
      const { fee } = selectUtxosForPegin(
        utxos,
        amount,
        feeRate,
        numOutputs,
        maxInputCount,
      );

      return {
        fee,
        feeRate,
        isLoading: false,
        error: null,
        maxDeposit,
      };
    } catch (err) {
      // The SDK message names an input count, which is not what the depositor
      // acts on. Map it to the copy surface by guard so the raw message can
      // never reach the CTA label.
      const errorMessage = isFundingInputCountExceededError(err)
        ? COPY.deposit.errors.tooManyFundingInputs.title
        : err instanceof Error
          ? err.message
          : "Failed to estimate fee";

      return {
        fee: null,
        feeRate,
        isLoading: false,
        error: errorMessage,
        maxDeposit,
      };
    }
  }, [
    amount,
    utxos,
    feeRate,
    numOutputs,
    maxInputCount,
    isLoading,
    feeError,
    maxDeposit,
  ]);

  return result;
}
