import type { MempoolUTXO } from "@babylonlabs-io/ts-sdk";
import {
  MAX_NON_LEGACY_OUTPUT_SIZE,
  P2TR_INPUT_SIZE,
  TX_BUFFER_SIZE_OVERHEAD,
  selectUtxosForPegin,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { useMemo } from "react";

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

/**
 * Compute the maximum depositable amount.
 *
 * For a max deposit all UTXOs are spent and there is no change output,
 * so the fee is deterministic: (numInputs × P2TR_INPUT_SIZE + 1 output + overhead) × feeRate.
 */
function computeMaxDeposit(
  numInputs: number,
  totalBalance: bigint,
  feeRate: number,
): bigint | null {
  if (totalBalance <= 0n) return null;

  // tx vsize: all inputs + 1 peg-in output (no change) + fixed overhead
  const txVsize =
    numInputs * P2TR_INPUT_SIZE +
    MAX_NON_LEGACY_OUTPUT_SIZE +
    TX_BUFFER_SIZE_OVERHEAD;
  const fee = BigInt(Math.ceil(txVsize * feeRate));
  const max = totalBalance - fee;
  return max > 0n ? max : 0n;
}

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
 * @returns Estimated fee, fee rate, loading state, and error
 */
export function useEstimatedBtcFee(
  amount: bigint,
  utxos?: MempoolUTXO[],
): EstimatedBtcFeeResult {
  const { defaultFeeRate, isLoading, error: feeError } = useNetworkFees();

  // Max deposit only depends on UTXOs + fee rate, not the user's amount
  const maxDeposit = useMemo(() => {
    if (isLoading || defaultFeeRate === 0 || !utxos?.length) return null;
    const totalBalance = utxos.reduce((sum, u) => sum + BigInt(u.value), 0n);
    return computeMaxDeposit(utxos.length, totalBalance, defaultFeeRate);
  }, [utxos, defaultFeeRate, isLoading]);

  const result = useMemo((): EstimatedBtcFeeResult => {
    // Still loading fee rates
    if (isLoading) {
      return {
        fee: null,
        feeRate: 0,
        isLoading: true,
        error: null,
        maxDeposit,
      };
    }

    // Fee rate not available
    if (defaultFeeRate === 0) {
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
        feeRate: defaultFeeRate,
        isLoading: false,
        error: null,
        maxDeposit,
      };
    }

    // Amount is zero - no fee calculation needed
    if (amount === 0n) {
      return {
        fee: null,
        feeRate: defaultFeeRate,
        isLoading: false,
        error: null,
        maxDeposit,
      };
    }

    try {
      // Use SDK's iterative UTXO selection with fee calculation
      const { fee } = selectUtxosForPegin(utxos, amount, defaultFeeRate);

      return {
        fee,
        feeRate: defaultFeeRate,
        isLoading: false,
        error: null,
        maxDeposit,
      };
    } catch (err) {
      // Handle insufficient funds or other errors
      const errorMessage =
        err instanceof Error ? err.message : "Failed to estimate fee";

      return {
        fee: null,
        feeRate: defaultFeeRate,
        isLoading: false,
        error: errorMessage,
        maxDeposit,
      };
    }
  }, [amount, utxos, defaultFeeRate, isLoading, feeError, maxDeposit]);

  return result;
}
